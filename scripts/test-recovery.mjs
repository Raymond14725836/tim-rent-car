import { spawn } from "node:child_process";
import net from "node:net";
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { availabilitySummary } from "../availability.mjs";
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  data = mkdtempSync(join(tmpdir(), "tim-recovery-"));
const port = await new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => resolve(p));
  });
});
const supervisor = spawn(process.execPath, ["supervisor.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: data,
    MONITOR_INTERVAL_MS: "1000",
    TLS_CERT_FILE: "",
    TLS_KEY_FILE: "",
  },
  stdio: ["ignore", "pipe", "pipe", "ipc"],
});
const ready = [];
supervisor.on("message", (m) => {
  if (m.event === "ready") ready.push({ ...m, time: Date.now() });
});
let stderr = "";
supervisor.stderr.on("data", (d) => (stderr += d));
const until = async (test, limit = 10000) => {
  const start = Date.now();
  while (!test()) {
    if (Date.now() - start > limit)
      throw Error("Recovery test timed out " + stderr);
    await new Promise((r) => setTimeout(r, 100));
  }
};
try {
  await until(() => ready.length === 1);
  await new Promise((r) => setTimeout(r, 1300));
  const login = await fetch(`http://127.0.0.1:${port}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "customer@tim.test", password: "Demo1234!" }),
  });
  if (!login.ok) throw Error("Initial login failed");
  const cookie = login.headers.get("set-cookie").split(";")[0],
    carCount = (await (await fetch(`http://127.0.0.1:${port}/api/cars`)).json())
      .length;
  const failureAt = Date.now();
  process.kill(ready[0].pid, "SIGKILL");
  await until(() => ready.length === 2);
  const response = await fetch(`http://127.0.0.1:${port}/api/me`, {
      headers: { cookie },
    }),
    me = await response.json();
  const afterCount = (
    await (await fetch(`http://127.0.0.1:${port}/api/cars`)).json()
  ).length;
  await new Promise((r) => setTimeout(r, 1200));
  const result = {
    testedAt: new Date().toISOString(),
    failure: "Abruptly terminated the isolated server process",
    automaticRestarts: ready.length - 1,
    recoveryMs: ready[1].time - failureAt,
    sessionSurvived: me.user?.id === "C001",
    dataSurvived: carCount === afterCount,
    pass: response.ok && me.user?.id === "C001" && carCount === afterCount,
    availability: availabilitySummary(join(data, "availability.jsonl")),
    scope:
      "Short fault-injection recovery test; not a monthly 99% availability measurement.",
  };
  mkdirSync(join(root, "verification"), { recursive: true });
  writeFileSync(
    join(root, "verification/recovery-test.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  const ended = new Promise((resolve) => supervisor.once("exit", resolve));
  supervisor.send({ command: "stop" });
  await ended;
  console.log("Recovery database retained: " + data);
}
