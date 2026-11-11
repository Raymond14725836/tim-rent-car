import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3003),
  url = `http://127.0.0.1:${port}`;
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("Invalid PORT");
function open() {
  if (process.platform === "win32")
    spawn("cmd.exe", ["/c", "start", "", url], {
      windowsHide: true,
      stdio: "ignore",
    }).unref();
  else
    spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
      stdio: "ignore",
    }).unref();
}
let running = false;
try {
  const r = await fetch(url + "/api/system", {
    signal: AbortSignal.timeout(1200),
  });
  const s = await r.json();
  running = s.version === "3.0.0";
} catch {}
if (running) {
  console.log("Tim Rent Car is already running: " + url);
  open();
} else {
  const child = spawn(process.execPath, ["supervisor.mjs"], {
    cwd: root,
    env: process.env,
    stdio: ["inherit", "pipe", "inherit"],
  });
  let opened = false;
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    if (!opened && chunk.toString().includes("Tim Rent Car:")) {
      opened = true;
      open();
    }
  });
  child.on("exit", (code) => {
    process.exitCode = code || 0;
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
}
