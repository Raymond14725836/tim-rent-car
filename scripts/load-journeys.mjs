import { spawn } from "node:child_process";
import https from "node:https";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { PNG } from "pngjs";
import { ensureLocalTls } from "./local-tls.mjs";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const data = mkdtempSync(join(tmpdir(), "tim-rent-journeys-")),
  tls = ensureLocalTls(join(data, "tls"));
const child = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: "0",
    DATA_DIR: data,
    TLS_CERT_FILE: tls.certFile,
    TLS_KEY_FILE: tls.keyFile,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let errors = "";
child.stderr.on("data", (d) => (errors += d));
const base = await new Promise((resolve, reject) => {
  child.stdout.on("data", (d) => {
    const m = String(d).match(/https:\/\/127\.0\.0\.1:\d+/);
    if (m) resolve(m[0]);
  });
  child.once("exit", (c) => reject(Error("Server exited " + c + " " + errors)));
  child.once("error", reject);
  setTimeout(() => reject(Error("Startup timeout " + errors)), 20000).unref();
});
const agent = new https.Agent({
  ca: tls.cert,
  keepAlive: true,
  maxSockets: 200,
  rejectUnauthorized: true,
});
const observations = [],
  failures = [],
  manifest = [];
let active = 0,
  peak = 0;
function request(
  path,
  body,
  cookie,
  { label = path, record = true, selectedAgent = agent } = {},
) {
  return new Promise((resolve, reject) => {
    const payload =
        body === undefined ? undefined : Buffer.from(JSON.stringify(body)),
      t = performance.now();
    const req = https.request(
      base + path,
      {
        method: payload ? "POST" : "GET",
        agent: selectedAgent,
        headers: {
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": payload.length,
              }
            : {}),
          ...(cookie ? { cookie } : {}),
          origin: base,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const bytes = Buffer.concat(chunks),
            ms = performance.now() - t;
          if (record)
            observations.push({ step: label, status: res.statusCode, ms });
          const type = res.headers["content-type"] || "";
          let value = bytes;
          if (type.includes("application/json"))
            try {
              value = JSON.parse(bytes);
            } catch {}
          if (res.statusCode >= 400)
            return reject(
              Error(
                label + " HTTP " + res.statusCode + " " + JSON.stringify(value),
              ),
            );
          resolve({
            value,
            bytes,
            headers: res.headers,
            protocol: res.socket?.getProtocol?.(),
          });
        });
      },
    );
    req.setTimeout(30000, () => req.destroy(Error("request timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
let report;
try {
  const d = new DatabaseSync(join(data, "rental.sqlite"));
  const userInsert = d.prepare(
      "INSERT INTO users(id,name,email,phone,role,hash) VALUES(?,?,?,?,?,?)",
    ),
    carInsert = d.prepare("INSERT INTO cars VALUES(?,?,?,?,?,?,?)");
  // Pre-existing independent accounts and vehicles. Fixture creation is not included in latency results.
  for (let n = 1; n <= 100; n++) {
    const salt = randomBytes(16).toString("hex"),
      hash = salt + ":" + scryptSync("LoadTest123!", salt, 64).toString("hex");
    userInsert.run(
      "VU-" + n,
      "Virtual User " + n,
      `vu${n}@load.test`,
      "0800000000",
      "customer",
      hash,
    );
    carInsert.run(
      "LOAD-" + n,
      "Load Test Vehicle " + n,
      "SUV",
      120000,
      "available",
      "excellent",
      1000,
    );
  }
  d.close();
  const protocols = [];
  for (const version of ["TLSv1.2", "TLSv1.3"]) {
    const a = new https.Agent({
      ca: tls.cert,
      minVersion: version,
      maxVersion: version,
      rejectUnauthorized: true,
    });
    const result = await request("/api/system", undefined, undefined, {
      record: false,
      selectedAgent: a,
    });
    protocols.push({
      requested: version,
      negotiated: result.protocol,
      verified: true,
    });
    a.destroy();
  }
  const start =
      new Date(Date.now() + 21 * 86400000).toLocaleDateString("en-CA", {
        timeZone: "Asia/Bangkok",
      }) + "T10:00:00+07:00",
    end =
      new Date(Date.now() + 23 * 86400000).toLocaleDateString("en-CA", {
        timeZone: "Asia/Bangkok",
      }) + "T10:00:00+07:00";
  const png = new PNG({ width: 32, height: 16 });
  for (let x = 1; x < 30; x++) {
    const y = 14 - Math.floor(x / 3),
      p = (y * 32 + x) * 4;
    png.data[p + 3] = 255;
  }
  const signature =
    "data:image/png;base64," + PNG.sync.write(png).toString("base64");
  const began = Date.now();
  await Promise.all(
    Array.from({ length: 100 }, async (_, index) => {
      const n = index + 1;
      active++;
      peak = Math.max(peak, active);
      const beganVU = performance.now();
      try {
        const login = await request(
          "/api/login",
          { email: `vu${n}@load.test`, password: "LoadTest123!" },
          undefined,
          { label: "login" },
        );
        if (!String(login.headers["set-cookie"]).includes("Secure"))
          throw Error("Secure cookie missing");
        const cookie = login.headers["set-cookie"][0].split(";")[0];
        const cars = await request(
          "/api/cars?" + new URLSearchParams({ start, end }),
          undefined,
          cookie,
          { label: "search" },
        );
        if (!cars.value.find((c) => c.id === "LOAD-" + n)?.available)
          throw Error("Assigned car unavailable");
        const quote = await request(
          "/api/quote",
          { carId: "LOAD-" + n, start, end, code: "SEASON15" },
          cookie,
          { label: "quote" },
        );
        const booking = await request(
            "/api/bookings",
            {
              carId: "LOAD-" + n,
              start,
              end,
              code: "SEASON15",
              location: "Load-test branch",
            },
            cookie,
            { label: "book" },
          ),
          id = booking.value.id;
        await request(
          `/api/bookings/${id}/contract`,
          { accepted: true, signature },
          cookie,
          { label: "sign" },
        );
        const session = await request(
          `/api/bookings/${id}/payment-session`,
          { method: "qr" },
          cookie,
          { label: "payment-session" },
        );
        const token = new URL(session.value.url).searchParams.get("token");
        await request("/api/demo-pay/" + token, undefined, undefined, {
          label: "gateway-open",
        });
        await request(
          "/api/demo-pay/" + token,
          { outcome: "success" },
          undefined,
          { label: "gateway-confirm" },
        );
        const confirmation = await request(
          `/api/bookings/${id}/confirmation`,
          undefined,
          cookie,
          { label: "confirmation" },
        );
        if (
          confirmation.value.status !== "confirmed" ||
          confirmation.value.total !== quote.value.total
        )
          throw Error("Confirmation mismatch");
        const bookings = await request("/api/bookings", undefined, cookie, {
          label: "my-bookings",
        });
        if (bookings.value.length !== 1 || bookings.value[0].id !== id)
          throw Error("User isolation failed");
        const inbox = await request("/api/outbox", undefined, cookie, {
          label: "inbox",
        });
        if (inbox.value.length !== 1) throw Error("Mail missing or duplicated");
        const receipt = await request(
          `/api/bookings/${id}/documents/receipt.pdf`,
          undefined,
          cookie,
          { label: "receipt-pdf" },
        );
        if (receipt.bytes.subarray(0, 5).toString() !== "%PDF-")
          throw Error("Receipt invalid");
        const mail = await request(
          `/api/outbox/${inbox.value[0].id}.eml`,
          undefined,
          cookie,
          { label: "email-download" },
        );
        if (
          (
            mail.bytes.toString().match(/Content-Disposition: attachment/g) ||
            []
          ).length !== 3
        )
          throw Error("Email attachments missing");
        await request("/api/logout", {}, cookie, { label: "logout" });
        manifest.push({
          virtualUser: n,
          bookingId: id,
          completed: true,
          durationMs: Math.round(performance.now() - beganVU),
        });
      } catch (e) {
        failures.push({ virtualUser: n, error: e.message });
      } finally {
        active--;
      }
    }),
  );
  const summarize = (xs) => {
    const times = xs.map((x) => x.ms).sort((a, b) => a - b);
    return {
      requests: xs.length,
      p95Ms: Math.round(times[Math.ceil(times.length * 0.95) - 1] || 0),
      maxMs: Math.round(times.at(-1) || 0),
      within3Seconds: xs.filter((x) => x.ms <= 3000).length,
      within3SecondsPercent:
        Math.round(
          (xs.filter((x) => x.ms <= 3000).length / xs.length) * 10000,
        ) / 100,
    };
  };
  report = {
    testedAt: new Date().toISOString(),
    timezone: "UTC",
    environment: process.version,
    transport: "HTTPS with explicit certificate trust, rejectUnauthorized=true",
    certificateFingerprint: tls.fingerprint,
    protocols,
    virtualUsers: 100,
    independentAccounts: 100,
    independentSessions: 100,
    peakConcurrentJourneys: peak,
    completedJourneys: manifest.length,
    failedJourneys: failures.length,
    durationMs: Date.now() - began,
    overall: summarize(observations),
    byStep: Object.fromEntries(
      [...new Set(observations.map((x) => x.step))].map((step) => [
        step,
        summarize(observations.filter((x) => x.step === step)),
      ]),
    ),
    pass:
      manifest.length === 100 &&
      failures.length === 0 &&
      summarize(observations).within3SecondsPercent >= 95,
    failures,
    manifest,
    scope:
      "100 concurrent virtual users completing independent customer journeys, including authenticated booking, signature, QR test payment, PDF and email attachments. Test gateway and local test inbox as approved. Not a human usability study or monthly availability measurement.",
  };
  const out = join(root, "verification");
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "load-100-journeys.json"),
    JSON.stringify(report, null, 2),
  );
  writeFileSync(
    join(out, "load-request-samples.json"),
    JSON.stringify(
      observations.map((x) => ({ ...x, ms: Math.round(x.ms) })),
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { ...report, manifest: undefined, failures: failures.slice(0, 5) },
      null,
      2,
    ),
  );
  if (!report.pass) process.exitCode = 1;
} finally {
  agent.destroy();
  const exit = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await exit;
  console.log("Isolated load database retained for audit: " + data);
}
