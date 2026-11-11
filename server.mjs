import http from "node:http";
import https from "node:https";
import { createFeatures } from "./features.mjs";
import { createEvidenceRoutes } from "./evidence.mjs";
import { DatabaseSync, backup } from "node:sqlite";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const data = process.env.DATA_DIR || join(root, "data");
mkdirSync(data, { recursive: true });
const db = new DatabaseSync(join(data, "rental.sqlite"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,phone TEXT,role TEXT NOT NULL,hash TEXT NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER);
CREATE TABLE IF NOT EXISTS cars(id TEXT PRIMARY KEY,name TEXT,type TEXT,rate INTEGER,status TEXT,condition TEXT,odometer INTEGER DEFAULT 28000);
CREATE TABLE IF NOT EXISTS promos(code TEXT PRIMARY KEY,name TEXT,percent REAL,start TEXT,end TEXT,min_days INTEGER,active INTEGER);
CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),car_id TEXT REFERENCES cars(id),start TEXT,end TEXT,location TEXT,status TEXT,total INTEGER,base INTEGER,discount INTEGER,tax INTEGER,days INTEGER,method TEXT,signature TEXT,document TEXT,created TEXT);
CREATE INDEX IF NOT EXISTS booking_overlap ON bookings(car_id,start,end,status);
CREATE TABLE IF NOT EXISTS inspections(id TEXT PRIMARY KEY,car_id TEXT REFERENCES cars(id),inspector TEXT REFERENCES users(id),date TEXT,phase TEXT,odometer INTEGER,fuel INTEGER,checks TEXT,notes TEXT,damage INTEGER,status TEXT,next_service TEXT);
CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,user_id TEXT,booking_id TEXT,recipient TEXT,subject TEXT,body TEXT,created TEXT);`);
const deriveKey = promisify(scrypt);
async function hash(p) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await deriveKey(p, salt, 64)).toString("hex");
}
async function verify(p, h) {
  const [s, v] = h.split(":");
  return timingSafeEqual(await deriveKey(p, s, 64), Buffer.from(v, "hex"));
}
const id = (p) => p + "-" + randomBytes(6).toString("hex").toUpperCase();
const query = (q, ...p) => db.prepare(q).all(...p);
const one = (q, ...p) => db.prepare(q).get(...p);
const run = (q, ...p) => db.prepare(q).run(...p);
if (!one("SELECT id FROM users LIMIT 1")) {
  for (const [uid, name, role] of [
    ["C001", "Mali Demo", "customer"],
    ["S001", "เจ้าหน้าที่บริการ", "staff"],
    ["A001", "ผู้ดูแลระบบ", "admin"],
    ["I001", "เจ้าหน้าที่ตรวจรถ", "inspector"],
  ])
    run(
      "INSERT INTO users(id,name,email,phone,role,hash) VALUES(?,?,?,?,?,?)",
      uid,
      name,
      role + "@tim.test",
      "0810000142",
      role,
      await hash("Demo1234!"),
    );
  for (const c of [
    ["CAR-001", "Toyota Yaris Cross", "SUV", 120000, "available"],
    ["CAR-002", "Honda Civic", "Sedan", 150000, "available"],
    ["CAR-003", "BYD Dolphin", "EV", 140000, "available"],
    ["CAR-004", "Toyota Fortuner", "SUV", 250000, "inspection"],
  ])
    run(
      "INSERT INTO cars(id,name,type,rate,status,condition) VALUES(?,?,?,?,?,?)",
      ...c,
      "excellent",
    );
  run(
    "INSERT INTO promos VALUES(?,?,?,?,?,?,?)",
    "SEASON15",
    "ส่วนลดตามฤดูกาล",
    15,
    "2026-01-01",
    "2027-12-31",
    2,
    1,
  );
  run(
    "INSERT INTO bookings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    "TRC-DEMO-003",
    "C001",
    "CAR-003",
    "2026-11-25T10:00:00+07:00",
    "2026-11-27T10:00:00+07:00",
    "ศาลายา นครปฐม",
    "confirmed",
    299600,
    280000,
    0,
    19600,
    2,
    "cash",
    "Demo signature",
    null,
    new Date().toISOString(),
  );
}
const safeUser = (u) =>
  u && {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    active: u.active,
  };
function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
function required(v, m) {
  if (!v) fail(m);
}
function period(start, end) {
  const a = Date.parse(start),
    b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a)
    fail("วันคืนรถต้องอยู่หลังวันรับรถ");
  return Math.ceil((b - a) / 86400000);
}
function carAvailable(car, start, end, exclude = "") {
  return (
    car.status === "available" &&
    !one(
      "SELECT id FROM bookings WHERE car_id=? AND id<>? AND status NOT IN ('cancelled','completed','expired') AND julianday(start)<julianday(?) AND julianday(end)>julianday(?)",
      car.id,
      exclude,
      end,
      start,
    )
  );
}
function quote(b, exclude = "") {
  const days = period(b.start, b.end);
  const car = one("SELECT * FROM cars WHERE id=?", b.carId);
  required(car, "ไม่พบรถ");
  let percent = 0;
  if (b.code) {
    const p = one(
      "SELECT * FROM promos WHERE code=?",
      String(b.code).trim().toUpperCase(),
    );
    if (
      !p ||
      !p.active ||
      b.start.slice(0, 10) < p.start ||
      b.end.slice(0, 10) > p.end ||
      days < p.min_days
    )
      fail("รหัสส่วนลดไม่ถูกต้อง หมดอายุ หรือไม่ตรงเงื่อนไข");
    percent = p.percent;
  }
  const base = car.rate * days,
    discount = Math.round((base * percent) / 100),
    tax = Math.round((base - discount) * 0.07);
  return {
    car,
    days,
    base,
    discount,
    tax,
    total: base - discount + tax,
    available: carAvailable(car, b.start, b.end, exclude),
  };
}
function owned(user, b) {
  if (!b) fail("ไม่พบการจอง", 404);
  if (user.role === "customer" && b.user_id !== user.id)
    fail("ไม่มีสิทธิ์เข้าถึง", 403);
}
function authorize(u, roles) {
  if (!u) fail("กรุณาเข้าสู่ระบบ", 401);
  if (roles && !roles.includes(u.role)) fail("ไม่มีสิทธิ์เข้าถึง", 403);
}
async function body(req) {
  let chunks = [],
    size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 15 * 1024 * 1024) fail("ไฟล์หรือข้อมูลใหญ่เกินกำหนด", 413);
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    fail("ข้อมูล JSON ไม่ถูกต้อง");
  }
}
const rates = new Map();
const features = createFeatures({
  db,
  one,
  query,
  run,
  id,
  fail,
  authorize,
  owned,
  body,
  carAvailable,
});
const evidenceRoutes = createEvidenceRoutes({
  db,
  body,
  fail,
  authorize,
  root,
  data,
});
async function api(req, res, url) {
  const path = url.pathname,
    method = req.method,
    cookie = req.headers.cookie || "",
    token = cookie.match(/(?:^|;\s*)sid=([a-f0-9]+)/)?.[1];
  const user =
    token &&
    one(
      "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1",
      token,
      Date.now(),
    );
  const send = (v, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(v));
  };
  if (
    !["GET", "HEAD"].includes(method) &&
    req.headers.origin &&
    req.headers.origin !== `http://${req.headers.host}` &&
    req.headers.origin !== `https://${req.headers.host}`
  )
    fail("Origin ไม่ได้รับอนุญาต", 403);
  if (await features({ req, res, url, user, send })) return;
  if (await evidenceRoutes({ req, res, url, user, send })) return;
  if (path === "/api/me") return send({ user: safeUser(user), demo: true });
  if (path === "/api/login" && method === "POST") {
    const b = await body(req);
    const email = String(b.email || "")
      .trim()
      .toLowerCase();
    const key = req.socket.remoteAddress + ":" + email,
      limit = rates.get(key) || { n: 0, t: Date.now() };
    if (Date.now() - limit.t > 600000) {
      limit.n = 0;
      limit.t = Date.now();
    }
    if (++limit.n > 30) fail("ลองใหม่อีกครั้งใน 10 นาที", 429);
    rates.set(key, limit);
    const u = one("SELECT * FROM users WHERE email=? AND active=1", email);
    if (!u || !(await verify(String(b.password), u.hash)))
      fail("อีเมลหรือรหัสผ่านไม่ถูกต้อง", 401);
    rates.delete(key);
    const sid = randomBytes(32).toString("hex");
    run("INSERT INTO sessions VALUES(?,?,?)", sid, u.id, Date.now() + 86400000);
    res.setHeader(
      "Set-Cookie",
      `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${req.socket.encrypted || process.env.COOKIE_SECURE === "1" ? "; Secure" : ""}`,
    );
    return send(safeUser(u));
  }
  if (path === "/api/register" && method === "POST") {
    const b = await body(req);
    required(String(b.name || "").trim(), "กรอกชื่อ");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email || ""))
      fail("อีเมลไม่ถูกต้อง");
    if (typeof b.password !== "string" || b.password.length < 8)
      fail("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
    required(b.phone, "กรอกเบอร์โทรศัพท์");
    const uid = id("CUS");
    try {
      run(
        "INSERT INTO users(id,name,email,phone,role,hash) VALUES(?,?,?,?,?,?)",
        uid,
        b.name,
        b.email.trim().toLowerCase(),
        b.phone,
        "customer",
        await hash(b.password),
      );
    } catch {
      fail("อีเมลนี้มีบัญชีแล้ว");
    }
    return send({ id: uid }, 201);
  }
  if (path === "/api/logout" && method === "POST") {
    if (token) run("DELETE FROM sessions WHERE token=?", token);
    res.setHeader(
      "Set-Cookie",
      "sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    return send({ ok: true });
  }
  if (path === "/api/cars" && method === "GET") {
    const start = url.searchParams.get("start"),
      end = url.searchParams.get("end");
    if (start || end) period(start, end);
    return send(
      query(
        "SELECT c.* FROM cars c LEFT JOIN car_archives a ON c.id=a.car_id WHERE a.car_id IS NULL",
      ).map((c) => ({
        ...c,
        available: start
          ? carAvailable(c, start, end)
          : c.status === "available",
      })),
    );
  }
  authorize(user);
  if (path === "/api/quote" && method === "POST")
    return send(quote(await body(req)));
  if (path === "/api/bookings" && method === "GET") {
    const bs = query(
      `SELECT b.*,h.expires hold_expires,c.name car_name,u.name customer,u.email FROM bookings b LEFT JOIN booking_holds h ON h.booking_id=b.id JOIN cars c ON c.id=b.car_id JOIN users u ON u.id=b.user_id ${user.role === "customer" ? "WHERE b.user_id=?" : ""} ORDER BY b.created DESC`,
      ...(user.role === "customer" ? [user.id] : []),
    );
    return send(
      bs.map(({ signature, document, ...b }) => ({
        ...b,
        signed: !!signature,
        has_document: !!document,
      })),
    );
  }
  if (path === "/api/bookings" && method === "POST") {
    authorize(user, ["customer", "staff", "admin"]);
    const b = await body(req);
    if (Date.parse(b.start) < Date.now()) fail("ไม่สามารถจองย้อนหลังได้");
    const uid = user.role === "customer" ? user.id : b.userId;
    const customer = one(
      "SELECT * FROM users WHERE id=? AND role='customer' AND active=1",
      uid,
    );
    required(customer, "เลือกลูกค้าที่ใช้งานอยู่");
    required(String(b.location || "").trim(), "กรอกสถานที่รับและคืนรถ");
    db.exec("BEGIN IMMEDIATE");
    try {
      const q = quote(b);
      if (!q.available)
        fail(
          "รถไม่ว่างในช่วงวันที่เลือก พบการจองทับซ้อนหรือรถไม่พร้อมให้บริการ",
          409,
        );
      const bid = id("TRC");
      run(
        "INSERT INTO bookings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        bid,
        uid,
        b.carId,
        b.start,
        b.end,
        b.location,
        "pending",
        q.total,
        q.base,
        q.discount,
        q.tax,
        q.days,
        "qr",
        null,
        null,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
      return send({ id: bid, ...q }, 201);
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  const bm = path.match(
    /^\/api\/bookings\/([^/]+)(?:\/(contract|payment|cancel|handover|return|confirmation))?$/,
  );
  if (bm) {
    const b = one("SELECT * FROM bookings WHERE id=?", bm[1]);
    owned(user, b);
    const action = bm[2];
    if (!action && method === "POST") {
      authorize(user, ["staff", "admin"]);
      if (b.status !== "pending") fail("แก้ไขรายละเอียดได้เฉพาะรายการรอชำระ");
      const x = await body(req);
      if (Date.parse(x.start) < Date.now()) fail("ไม่สามารถจองย้อนหลังได้");
      required(String(x.location || "").trim(), "กรอกสถานที่นัดหมาย");
      db.exec("BEGIN IMMEDIATE");
      try {
        const q = quote(x, b.id);
        if (!q.available)
          fail("รถไม่ว่างในช่วงวันที่เลือก พบการจองทับซ้อน", 409);
        run(
          "UPDATE bookings SET car_id=?,start=?,end=?,location=?,total=?,base=?,discount=?,tax=?,days=?,signature=NULL,document=NULL WHERE id=?",
          x.carId,
          x.start,
          x.end,
          x.location,
          q.total,
          q.base,
          q.discount,
          q.tax,
          q.days,
          b.id,
        );
        db.exec("COMMIT");
        return send({ ok: true, ...q });
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    if (action === "confirmation" && method === "GET") {
      return send({
        ...b,
        signature: undefined,
        document: undefined,
        car: one("SELECT * FROM cars WHERE id=?", b.car_id),
        customer: safeUser(one("SELECT * FROM users WHERE id=?", b.user_id)),
      });
    }
    if (action === "contract" && method === "GET") {
      authorize(user, ["customer", "staff", "admin"]);
      return send({ id: b.id, signature: b.signature, document: b.document });
    }
    if (action === "contract" && method === "POST") {
      authorize(user, ["customer", "staff", "admin"]);
      if (b.status !== "pending") fail("แก้ไขสัญญาได้เฉพาะรายการรอยืนยัน");
      const x = await body(req);
      required(x.accepted, "กรุณายอมรับเงื่อนไข");
      if (!x.signature && !x.document) fail("ลงนามหรืออัปโหลดสัญญาก่อน");
      if (
        x.signature &&
        (!/^data:image\/png;base64,/.test(x.signature) ||
          x.signature.length > 500000)
      )
        fail("ลายเซ็นไม่ถูกต้อง");
      if (x.document) {
        if (
          !/^data:(application\/pdf|image\/png);base64,/.test(x.document) ||
          x.document.length > 14000000
        )
          fail("รองรับ PDF หรือ PNG ขนาดไม่เกิน 10 MB");
      }
      run(
        "UPDATE bookings SET signature=?,document=? WHERE id=?",
        x.signature || null,
        x.document || null,
        b.id,
      );
      return send({ ok: true });
    }
    if (action === "payment" && method === "POST") {
      authorize(user, ["customer", "staff", "admin"]);
      if (b.status !== "pending") fail("สถานะรายการไม่รองรับการชำระเงิน");
      required(b.signature || b.document, "กรุณาลงนามสัญญาก่อน");
      const x = await body(req);
      if (
        !["cash", "card", "qr"].includes(x.method) ||
        (user.role === "customer" && x.method !== "qr")
      )
        fail("วิธีชำระเงินไม่ถูกต้อง");
      db.exec("BEGIN IMMEDIATE");
      try {
        run(
          "UPDATE bookings SET status='confirmed',method=? WHERE id=?",
          x.method,
          b.id,
        );
        const u = one("SELECT * FROM users WHERE id=?", b.user_id);
        run(
          "INSERT INTO outbox VALUES(?,?,?,?,?,?,?)",
          id("MAIL"),
          u.id,
          b.id,
          u.email,
          `ยืนยันการจอง ${b.id}`,
          `หมายเลขจอง ${b.id}\nรับรถ ${b.start}\nคืนรถ ${b.end}\nยอดสุทธิ ${(b.total / 100).toFixed(2)} บาท\nสถานที่ ${b.location}\nโหมดทดสอบ ไม่ได้รับเงินจริง`,
          new Date().toISOString(),
        );
        db.exec("COMMIT");
        return send({ ok: true, delivery: "local-outbox", simulation: true });
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    if (action === "cancel" && method === "POST") {
      authorize(user, ["customer", "staff", "admin"]);
      if (b.status !== "pending")
        fail(
          "ยกเลิกได้เฉพาะรายการรอชำระ ติดต่อเจ้าหน้าที่สำหรับรายการยืนยันแล้ว",
        );
      run("UPDATE bookings SET status='cancelled' WHERE id=?", b.id);
      return send({ ok: true });
    }
    if (action === "handover" && method === "POST") {
      authorize(user, ["staff", "admin"]);
      if (b.status !== "confirmed") fail("ต้องเป็นรายการยืนยันแล้ว");
      if (
        one("SELECT status FROM cars WHERE id=?", b.car_id).status !==
        "available"
      )
        fail("รถยังไม่พร้อมส่งมอบ");
      run("UPDATE bookings SET status='active' WHERE id=?", b.id);
      return send({ ok: true });
    }
    if (action === "return" && method === "POST") {
      authorize(user, ["staff", "admin"]);
      if (b.status !== "active") fail("ต้องเป็นรายการกำลังเช่า");
      db.exec("BEGIN IMMEDIATE");
      try {
        run("UPDATE bookings SET status='completed' WHERE id=?", b.id);
        run("UPDATE cars SET status='inspection' WHERE id=?", b.car_id);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return send({ ok: true });
    }
  }
  if (path === "/api/outbox" && method === "GET") {
    authorize(user, ["customer", "staff", "admin"]);
    return send(
      query(
        `SELECT * FROM outbox ${user.role === "customer" ? "WHERE user_id=?" : ""} ORDER BY created DESC`,
        ...(user.role === "customer" ? [user.id] : []),
      ),
    );
  }
  if (path === "/api/customers" && method === "GET") {
    authorize(user, ["staff", "admin"]);
    return send(
      query(
        "SELECT id,name,email,phone,role,active FROM users WHERE role='customer'",
      ),
    );
  }
  if (path === "/api/users" && method === "GET") {
    authorize(user, ["admin"]);
    return send(query("SELECT id,name,email,phone,role,active FROM users"));
  }
  if (path === "/api/users" && method === "POST") {
    authorize(user, ["admin"]);
    const x = await body(req);
    required(x.name, "กรอกชื่อ");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email || ""))
      fail("อีเมลไม่ถูกต้อง");
    if (!["customer", "staff", "admin", "inspector"].includes(x.role))
      fail("บทบาทไม่ถูกต้อง");
    if (x.id) {
      const old = one("SELECT * FROM users WHERE id=?", x.id);
      required(old, "ไม่พบผู้ใช้");
      if (
        old.role === "admin" &&
        (!x.active || x.role !== "admin") &&
        one("SELECT count(*) n FROM users WHERE role='admin' AND active=1").n <=
          1
      )
        fail("ต้องมีผู้ดูแลระบบอย่างน้อยหนึ่งคน");
      try {
        run(
          "UPDATE users SET name=?,email=?,phone=?,role=?,active=? WHERE id=?",
          x.name,
          x.email.toLowerCase(),
          x.phone || "",
          x.role,
          x.active ? 1 : 0,
          x.id,
        );
      } catch {
        fail("อีเมลซ้ำ");
      }
      run("DELETE FROM sessions WHERE user_id=?", x.id);
    } else {
      if (String(x.password || "").length < 8)
        fail("รหัสผ่านอย่างน้อย 8 ตัวอักษร");
      try {
        run(
          "INSERT INTO users(id,name,email,phone,role,hash) VALUES(?,?,?,?,?,?)",
          id("USR"),
          x.name,
          x.email.toLowerCase(),
          x.phone || "",
          x.role,
          await hash(x.password),
        );
      } catch {
        fail("อีเมลซ้ำ");
      }
    }
    return send({ ok: true });
  }
  if (path === "/api/cars" && method === "POST") {
    authorize(user, ["admin", "staff"]);
    const b = await body(req),
      car = one("SELECT * FROM cars WHERE id=?", b.id);
    required(car, "ไม่พบรถ");
    if (!["available", "maintenance", "inspection"].includes(b.status))
      fail("สถานะรถไม่ถูกต้อง");
    if (user.role === "admin") {
      if (
        !Number.isFinite(+b.rate) ||
        +b.rate <= 0 ||
        !["excellent", "good", "fair"].includes(b.condition)
      )
        fail("ราคาและสภาพรถไม่ถูกต้อง");
      run(
        "UPDATE cars SET rate=?,condition=?,status=? WHERE id=?",
        Math.round(+b.rate),
        b.condition,
        b.status,
        b.id,
      );
    } else run("UPDATE cars SET status=? WHERE id=?", b.status, b.id);
    return send({ ok: true });
  }
  if (path === "/api/promos" && method === "GET") {
    authorize(user, ["admin", "staff"]);
    return send(query("SELECT * FROM promos"));
  }
  if (path === "/api/promos" && method === "POST") {
    authorize(user, ["admin"]);
    const b = await body(req);
    if (
      !/^[A-Z0-9_-]{3,30}$/.test(b.code || "") ||
      !(b.percent > 0 && b.percent <= 100) ||
      !Number.isInteger(+b.min_days) ||
      b.min_days < 1 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(b.start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(b.end) ||
      b.end < b.start
    )
      fail("ข้อมูลส่วนลดไม่ถูกต้อง");
    run(
      "INSERT OR REPLACE INTO promos VALUES(?,?,?,?,?,?,?)",
      b.code,
      b.name || b.code,
      +b.percent,
      b.start,
      b.end,
      +b.min_days,
      b.active ? 1 : 0,
    );
    return send({ ok: true });
  }
  if (path === "/api/inspections" && method === "GET") {
    authorize(user, ["inspector", "admin"]);
    return send(
      query(
        "SELECT i.*,c.name car_name FROM inspections i JOIN cars c ON c.id=i.car_id ORDER BY date DESC",
      ),
    );
  }
  if (path === "/api/inspections" && method === "POST") {
    authorize(user, ["inspector", "admin"]);
    const b = await body(req),
      car = one("SELECT * FROM cars WHERE id=?", b.carId);
    required(car, "ไม่พบรถ");
    if (
      !b.date ||
      !Number.isFinite(Date.parse(b.date)) ||
      !["before", "after", "monthly"].includes(b.phase) ||
      !Array.isArray(b.checks) ||
      b.checks.length !== 7 ||
      b.checks.some((x) => !["pass", "damage"].includes(x))
    )
      fail("กรุณากรอกผลตรวจให้ครบทั้ง 7 รายการ");
    if (
      !Number.isInteger(+b.odometer) ||
      +b.odometer < car.odometer ||
      !Number.isInteger(+b.fuel) ||
      b.fuel < 0 ||
      b.fuel > 100
    )
      fail("เลขไมล์หรือระดับน้ำมันไม่ถูกต้อง");
    const costs = [150000, 200000, 250000, 50000, 100000, 120000, 80000];
    const damage = b.checks.reduce(
      (s, x, i) => s + (x === "damage" ? costs[i] : 0),
      0,
    );
    if (damage && !String(b.notes || "").trim())
      fail("กรอกรายละเอียดความเสียหาย");
    const status = damage
      ? "maintenance"
      : b.status === "maintenance"
        ? "maintenance"
        : "available";
    if (b.nextService && !Number.isFinite(Date.parse(b.nextService)))
      fail("วันบำรุงรักษาไม่ถูกต้อง");
    const inspectionId = id("INS");
    db.exec("BEGIN IMMEDIATE");
    try {
      run(
        "INSERT INTO inspections VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        inspectionId,
        car.id,
        user.id,
        b.date,
        b.phase,
        +b.odometer,
        +b.fuel,
        JSON.stringify(b.checks),
        b.notes || "",
        damage,
        status,
        b.nextService || null,
      );
      run(
        "UPDATE cars SET status=?,odometer=? WHERE id=?",
        status,
        +b.odometer,
        car.id,
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return send({ ok: true, id: inspectionId, damage, status }, 201);
  }
  if (path === "/api/reports" && method === "GET") {
    authorize(user, ["admin"]);
    const start = url.searchParams.get("start") || "2000-01-01",
      end = url.searchParams.get("end") || "2100-01-01";
    if (end < start) fail("ช่วงวันที่ไม่ถูกต้อง");
    const bs = query(
      "SELECT b.*,c.name car_name FROM bookings b JOIN cars c ON b.car_id=c.id WHERE substr(b.start,1,10)>=? AND substr(b.start,1,10)<=?",
      start,
      end,
    );
    const paid = bs.filter((b) =>
      ["confirmed", "active", "completed"].includes(b.status),
    );
    return send({
      bookings: bs.length,
      revenue: paid.reduce((s, b) => s + b.total, 0),
      active: bs.filter((b) => b.status === "active").length,
      maintenance: one("SELECT count(*) n FROM cars WHERE status='maintenance'")
        .n,
      monthly: Object.entries(
        paid.reduce(
          (o, b) => (
            (o[b.start.slice(0, 7)] = (o[b.start.slice(0, 7)] || 0) + 1),
            o
          ),
          {},
        ),
      ).sort(),
      byCar: query("SELECT * FROM cars").map((c) => ({
        name: c.name,
        total: paid
          .filter((b) => b.car_id === c.id)
          .reduce((s, b) => s + b.total, 0),
      })),
      rows: bs,
    });
  }
  fail("ไม่พบ API", 404);
}
const handler = async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (!["GET", "HEAD"].includes(req.method)) fail("Method not allowed", 405);
    const files = {
      "/": "index.html",
      "/pay": "index.html",
      "/app.js": "app.js",
      "/style.css": "style.css",
      "/usability": "usability.html",
      "/usability.js": "usability.js",
      "/evidence": "evidence.html",
      "/evidence.js": "evidence.js",
    };
    const f =
      files[url.pathname] ||
      (/^\/(assets|fonts)\/[A-Za-z0-9_-]+\.(png|jpg|webp|ttf|txt)$/.test(
        url.pathname,
      )
        ? url.pathname.slice(1)
        : null);
    if (!f || !existsSync(join(root, "public", f))) fail("ไม่พบหน้า", 404);
    res.setHeader(
      "Content-Type",
      {
        html: "text/html; charset=utf-8",
        js: "text/javascript; charset=utf-8",
        css: "text/css; charset=utf-8",
        png: "image/png",
        jpg: "image/jpeg",
        webp: "image/webp",
        ttf: "font/ttf",
        txt: "text/plain; charset=utf-8",
      }[extname(f).slice(1)],
    );
    res.end(readFileSync(join(root, "public", f)));
  } catch (e) {
    res.writeHead(e.status || 500, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(
      JSON.stringify({
        error: e.status ? e.message : "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
      }),
    );
    if (!e.status) console.error(e);
  }
};
const secure = !!(process.env.TLS_CERT_FILE && process.env.TLS_KEY_FILE);
const server = secure
  ? https.createServer(
      {
        cert: readFileSync(process.env.TLS_CERT_FILE),
        key: readFileSync(process.env.TLS_KEY_FILE),
        minVersion: "TLSv1.2",
      },
      handler,
    )
  : http.createServer(handler);
const port = Number(process.env.PORT || 3003);
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Tim Rent Car: ${secure ? "https" : "http"}://127.0.0.1:${server.address().port}`,
  ),
);
process.on("SIGINT", () =>
  server.close(() => {
    db.close();
    process.exit(0);
  }),
);
process.on("SIGTERM", () =>
  server.close(() => {
    db.close();
    process.exit(0);
  }),
);
async function snapshot() {
  const dir = join(data, "backups");
  mkdirSync(dir, { recursive: true });
  const file = join(
    dir,
    `rental-${new Date().toISOString().slice(0, 10)}.sqlite`,
  );
  if (!existsSync(file)) await backup(db, file);
}
snapshot().catch(console.error);
setInterval(() => snapshot().catch(console.error), 3600000).unref();
