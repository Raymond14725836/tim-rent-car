import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url)),
  data = process.env.DATA_DIR || join(root, "data");
mkdirSync(data, { recursive: true });
const logfile = join(data, "availability.jsonl"),
  interval = Math.max(1000, Number(process.env.MONITOR_INTERVAL_MS || 30000));
let child,
  base,
  stopping = false,
  timer,
  restartTimer,
  backoff = 250;
const record = (event, details = {}) =>
  appendFileSync(
    logfile,
    JSON.stringify({ time: Date.now(), event, ...details }) + "\n",
  );
function health() {
  if (!base || stopping) return;
  const transport = base.startsWith("https:") ? https : http;
  const start = performance.now();
  const req = transport.get(
    base + "/api/system",
    {
      ...(process.env.TLS_CERT_FILE
        ? {
            ca: readFileSync(process.env.TLS_CERT_FILE),
            rejectUnauthorized: true,
          }
        : {}),
      timeout: 2000,
    },
    (res) => {
      res.resume();
      res.on("end", () =>
        record("health", {
          ok: res.statusCode === 200,
          status: res.statusCode,
          ms: Math.round(performance.now() - start),
        }),
      );
    },
  );
  req.on("timeout", () => req.destroy(Error("timeout")));
  req.on("error", (e) =>
    record("health", { ok: false, error: e.code || e.message }),
  );
}
function start() {
  child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    const m = String(chunk).match(/https?:\/\/127\.0\.0\.1:\d+/);
    if (m) {
      base = m[0];
      record("ready", { pid: child.pid, base });
      process.send?.({ event: "ready", pid: child.pid, base });
      backoff = 250;
      health();
    }
  });
  child.on("exit", (code, signal) => {
    record("server-exit", { code, signal });
    if (!stopping) {
      record("health", { ok: false, error: "server-exit" });
      record("restart", { delayMs: backoff });
      restartTimer = setTimeout(start, backoff);
      backoff = Math.min(backoff * 2, 30000);
    }
  });
  child.on("error", (e) => {
    record("spawn-error", { error: e.message });
    console.error(e.message);
  });
}
function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  clearTimeout(restartTimer);
  record("monitor-stop");
  if (child?.exitCode === null) {
    child.once("exit", () => process.exit(0));
    child.kill();
  } else process.exit(0);
}
record("monitor-start", { intervalMs: interval });
start();
timer = setInterval(health, interval);
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("message", (m) => {
  if (m?.command === "stop") stop();
});
