import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { availabilitySummary } from "./availability.mjs";
export function createEvidenceRoutes({
  db,
  body,
  sendUnused,
  fail,
  authorize,
  root,
  data,
}) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS usability_runs(token TEXT PRIMARY KEY,participant TEXT,kind TEXT,new_user INTEGER,started INTEGER,finished INTEGER,elapsed_ms INTEGER,passed INTEGER,start_date TEXT,end_date TEXT);`,
  );
  const get = (q, ...p) => db.prepare(q).get(...p),
    run = (q, ...p) => db.prepare(q).run(...p);
  const jsonFile = (name) => {
    const p = join(root, "verification", name);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  };
  return async ({ req, res, url, user, send }) => {
    const path = url.pathname,
      method = req.method,
      done = (v) => {
        send(v);
        return true;
      };
    if (path === "/api/usability/start" && method === "POST") {
      const b = await body(req);
      if (b.newUser !== true || b.consent !== true)
        fail("แบบทดสอบนี้ต้องทำโดยผู้ใช้ใหม่ที่ยินยอมจับเวลา");
      if (!/^[A-Za-z0-9_-]{1,20}$/.test(b.participant || ""))
        fail("ใช้รหัสผู้ทดสอบ เช่น P001 โดยไม่กรอกชื่อจริง");
      const kind =
          b.kind === "instrumentation-check"
            ? "instrumentation-check"
            : "self-reported-human",
        token = randomBytes(24).toString("hex"),
        started = Date.now();
      const date = (days) =>
        new Date(started + days * 86400000).toLocaleDateString("en-CA", {
          timeZone: "Asia/Bangkok",
        }) + "T10:00";
      run(
        "INSERT INTO usability_runs VALUES(?,?,?,?,?,?,?,?,?,?)",
        token,
        b.participant,
        kind,
        1,
        started,
        null,
        null,
        null,
        date(14),
        date(16),
      );
      return done({
        token,
        started,
        start: date(14),
        end: date(16),
        type: "SUV",
        limitSeconds: 300,
      });
    }
    const match = path.match(
      /^\/api\/usability\/([a-f0-9]{48})(?:\/(finish))?$/,
    );
    if (match) {
      const row = get("SELECT * FROM usability_runs WHERE token=?", match[1]);
      if (!row) fail("ไม่พบการทดสอบ", 404);
      if (method === "GET")
        return done({
          token: row.token,
          started: row.started,
          start: row.start_date,
          end: row.end_date,
          limitSeconds: 300,
          finished: row.finished,
          elapsedMs: row.elapsed_ms,
          passed: row.passed,
          kind: row.kind,
        });
      if (method === "POST" && match[2]) {
        if (row.finished)
          return done({
            elapsedMs: row.elapsed_ms,
            passed: !!row.passed,
            kind: row.kind,
          });
        const b = await body(req);
        if (
          b.start !== row.start_date ||
          b.end !== row.end_date ||
          b.type !== "SUV"
        )
          fail("เงื่อนไขการค้นหายังไม่ตรงกับโจทย์");
        const car = get(
          "SELECT c.id FROM cars c LEFT JOIN car_archives a ON a.car_id=c.id WHERE c.type='SUV' AND c.status='available' AND a.car_id IS NULL AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.car_id=c.id AND b.status NOT IN ('cancelled','completed','expired') AND julianday(b.start)<julianday(?) AND julianday(b.end)>julianday(?)) LIMIT 1",
          b.end + ":00+07:00",
          b.start + ":00+07:00",
        );
        if (!car)
          fail(
            "ช่วงนี้ไม่มีรถ SUV ว่าง ให้ผู้ดูแลเตรียมข้อมูลก่อนเริ่มรอบใหม่",
          );
        const finished = Date.now(),
          elapsed = finished - row.started,
          passed = elapsed <= 300000;
        run(
          "UPDATE usability_runs SET finished=?,elapsed_ms=?,passed=? WHERE token=?",
          finished,
          elapsed,
          passed ? 1 : 0,
          row.token,
        );
        return done({ elapsedMs: elapsed, passed, kind: row.kind });
      }
    }
    if (path === "/api/evidence" && method === "GET") {
      authorize(user, ["admin"]);
      const trials = db
        .prepare(
          "SELECT participant,kind,new_user,started,finished,elapsed_ms,passed FROM usability_runs ORDER BY started DESC",
        )
        .all();
      const human = trials.filter(
        (x) => x.kind === "self-reported-human" && x.finished,
      );
      return done({
        version: "3.0.0",
        functionalTestFile: "verification/tests.txt",
        loadTest: jsonFile("load-100-journeys.json"),
        recoveryTest: jsonFile("recovery-test.json"),
        backup: jsonFile("backup.json"),
        humanTrials: trials,
        humanUsabilityStatus: human.length
          ? human.every((x) => x.passed)
            ? "observed-pass"
            : "observed-failure"
          : "awaiting-human-trial",
        availability: availabilitySummary(join(data, "availability.jsonl")),
        httpsOnThisConnection: !!req.socket.encrypted,
        important:
          "Automated instrumentation checks are excluded from human-usability results. Monthly availability is not established by a short recovery test.",
      });
    }
    return false;
  };
}
