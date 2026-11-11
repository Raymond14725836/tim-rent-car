import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import jsQR from "jsqr";
import { PNG } from "pngjs";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), "tim-rent-tests-"));
let server, base, customer, staff, admin, inspector;
async function call(path, data, cookie) {
  const r = await fetch(base + "/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function login(role) {
  const r = await call("login", {
    email: role + "@tim.test",
    password: "Demo1234!",
  });
  assert.equal(r.status, 200);
  return r.cookie;
}
before(async () => {
  server = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: "0", DATA_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (d) => process.stderr.write(d));
  base = await new Promise((resolve, reject) => {
    server.stdout.on("data", (d) => {
      const m = d.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) resolve(m[0]);
    });
    server.once("error", reject);
    server.once("exit", (c) => reject(Error("Server exited " + c)));
    setTimeout(() => reject(Error("Startup timeout")), 10000).unref();
  });
  customer = await login("customer");
  staff = await login("staff");
  admin = await login("admin");
  inspector = await login("inspector");
});
after(async () => {
  if (server) {
    const done = new Promise((r) => server.once("exit", r));
    server.kill();
    await done;
  }
  const target = resolve(dir);
  assert.ok(
    target.startsWith(resolve(tmpdir()) + sep) &&
      basename(target).startsWith("tim-rent-tests-"),
  );
  rmSync(target, { recursive: true, force: true });
});
const times = {
  start: "2026-11-20T10:00:00+07:00",
  end: "2026-11-22T10:00:00+07:00",
};
const future = {
  start: "2027-11-25T10:00:00+07:00",
  end: "2027-11-27T10:00:00+07:00",
};
test("TC1-H ค้นหาและเลือกรถว่าง พร้อมคำนวณค่าเช่า", async () => {
  const r = await call("cars?" + new URLSearchParams(times));
  assert.equal(r.status, 200);
  assert.equal(r.data.find((c) => c.id === "CAR-001").available, true);
  const q = await call("quote", { carId: "CAR-001", ...times }, customer);
  assert.equal(q.data.days, 2);
  assert.equal(q.data.total, 256800);
});
test("TC1-U ป้องกันวันคืนก่อนวันรับ", async () => {
  const r = await call(
    "cars?" + new URLSearchParams({ start: times.end, end: times.start }),
  );
  assert.equal(r.status, 400);
  assert.match(r.data.error, /หลังวันรับ/);
});
test("TC2-H เจ้าหน้าที่จองรถ ส่วนลด สัญญา ชำระเงิน และใบยืนยัน", async () => {
  const b = await call(
    "bookings",
    {
      userId: "C001",
      carId: "CAR-002",
      ...future,
      code: "SEASON15",
      location: "ศาลายา",
    },
    staff,
  );
  assert.equal(b.status, 201);
  assert.equal(b.data.total, 272850);
  const bid = b.data.id;
  const early = await call(
    `bookings/${bid}/payment`,
    { method: "cash" },
    staff,
  );
  assert.equal(early.status, 409);
  const c = await call(
    `bookings/${bid}/contract`,
    { accepted: true, document: "data:application/pdf;base64,JVBERi0xLjQK" },
    staff,
  );
  assert.equal(c.status, 200);
  const session = await call(
    `bookings/${bid}/payment-session`,
    { method: "cash" },
    staff,
  );
  assert.equal(session.status, 200);
  const token = new URL(session.data.url).searchParams.get("token");
  const p = await call(
    `demo-pay/${token}`,
    { outcome: "success", cashReceived: 300000 },
    staff,
  );
  assert.equal(p.data.simulation, true);
  const confirm = await call(
    `bookings/${bid}/confirmation`,
    undefined,
    customer,
  );
  assert.equal(confirm.data.status, "confirmed");
  const out = await call("outbox", undefined, customer);
  assert.ok(out.data.some((m) => m.booking_id === bid));
  assert.equal(
    (await call(`bookings/${bid}/payment`, { method: "cash" }, staff)).status,
    409,
  );
});
test("TC2-U ป้องกันการจองทับซ้อนและตรวจช่วงเวลาที่ติดกัน", async () => {
  const t = {
    start: "2026-11-26T10:00:00+07:00",
    end: "2026-11-28T10:00:00+07:00",
  };
  assert.equal(
    (
      await call(
        "bookings",
        { userId: "C001", carId: "CAR-003", ...t, location: "ศาลายา" },
        staff,
      )
    ).status,
    409,
  );
  const q = await call(
    "quote",
    {
      carId: "CAR-003",
      start: "2026-11-27T10:00:00+07:00",
      end: "2026-11-28T10:00:00+07:00",
    },
    staff,
  );
  assert.equal(q.data.available, true);
});
test("การจองพร้อมกันสำเร็จเพียงหนึ่งรายการ", async () => {
  const b = { carId: "CAR-001", ...future, location: "ศาลายา" };
  const rs = await Promise.all([
    call("bookings", b, customer),
    call("bookings", b, customer),
  ]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409]);
});
test("TC3-H บันทึกผลตรวจครบและปรับรถเป็นพร้อมใช้งาน", async () => {
  const r = await call(
    "inspections",
    {
      carId: "CAR-004",
      date: "2026-11-28",
      phase: "after",
      odometer: 28640,
      fuel: 75,
      checks: Array(7).fill("pass"),
      status: "available",
    },
    inspector,
  );
  assert.equal(r.status, 201);
  assert.equal(r.data.damage, 0);
  assert.equal(r.data.status, "available");
});
test("TC3-U ปฏิเสธผลตรวจไม่ครบและไม่มีการบันทึก", async () => {
  const before = await call("inspections", undefined, inspector);
  const r = await call(
    "inspections",
    {
      carId: "CAR-004",
      date: "2026-11-28",
      phase: "after",
      odometer: 28640,
      fuel: 75,
      checks: ["pass"],
    },
    inspector,
  );
  assert.equal(r.status, 400);
  assert.equal(
    (await call("inspections", undefined, inspector)).data.length,
    before.data.length,
  );
});
test("คำนวณค่าเสียหาย 2000 บาทและบังคับรถเข้าซ่อม", async () => {
  const checks = Array(7).fill("pass");
  checks[0] = "damage";
  checks[3] = "damage";
  const r = await call(
    "inspections",
    {
      carId: "CAR-004",
      date: "2026-11-28",
      phase: "after",
      odometer: 28650,
      fuel: 50,
      checks,
      notes: "กันชนเป็นรอยและพรมสกปรก",
      status: "available",
    },
    inspector,
  );
  assert.equal(r.data.damage, 200000);
  assert.equal(r.data.status, "maintenance");
  const cars = await call("cars");
  assert.equal(cars.data.find((c) => c.id === "CAR-004").available, false);
});
test("ควบคุมสิทธิ์ API และรหัสผ่านไม่ถูกต้อง", async () => {
  assert.equal((await call("users")).status, 401);
  assert.equal((await call("users", undefined, customer)).status, 403);
  assert.equal((await call("outbox", undefined, inspector)).status, 403);
  assert.equal((await call("promos", { code: "HACK" }, staff)).status, 403);
  assert.equal(
    (await call("login", { email: "admin@tim.test", password: "wrong" }))
      .status,
    401,
  );
});
test("สมัครสมาชิกและแยกข้อมูลการจองของแต่ละคน", async () => {
  const email = "other@example.test";
  assert.equal(
    (
      await call("register", {
        name: "Other Demo",
        email,
        phone: "0800000000",
        password: "Testing123!",
      })
    ).status,
    201,
  );
  const u = await call("login", { email, password: "Testing123!" });
  const rs = await call("bookings", undefined, u.cookie);
  assert.equal(rs.data.length, 0);
  assert.equal(
    (await call("bookings/TRC-DEMO-003/confirmation", undefined, u.cookie))
      .status,
    403,
  );
});
test("ส่วนลดหมดอายุ วันไม่เข้าเงื่อนไข และราคาคำนวณบนเซิร์ฟเวอร์", async () => {
  assert.equal(
    (
      await call(
        "quote",
        { carId: "CAR-001", ...future, code: "INVALID" },
        customer,
      )
    ).status,
    400,
  );
  const r = await call(
    "quote",
    { carId: "CAR-001", ...future, code: "SEASON15", total: 1, rate: 1 },
    customer,
  );
  assert.equal(r.data.total, 218280);
});
test("ผู้ดูแลสร้างส่วนลดและรายงานจากข้อมูลจริง", async () => {
  const p = await call(
    "promos",
    {
      code: "TEST10",
      name: "Test",
      percent: 10,
      start: "2027-01-01",
      end: "2027-12-31",
      min_days: 1,
      active: true,
    },
    admin,
  );
  assert.equal(p.status, 200);
  const r = await call(
    "reports?start=2027-01-01&end=2027-12-31",
    undefined,
    admin,
  );
  assert.ok(r.data.bookings >= 1);
  assert.equal(r.data.revenue, 272850);
  assert.equal(
    r.data.byCar.find((c) => c.name === "Honda Civic").total,
    272850,
  );
});
test("แก้ไขรายการรอชำระ ตรวจทับซ้อน และล้างสัญญาเดิม", async () => {
  const bs = await call("bookings", undefined, admin);
  const b = bs.data.find(
    (x) => x.car_id === "CAR-001" && x.status === "pending",
  );
  assert.ok(b);
  const edit = await call(
    `bookings/${b.id}`,
    {
      carId: "CAR-001",
      start: future.start,
      end: future.end,
      location: "กรุงเทพฯ",
    },
    admin,
  );
  assert.equal(edit.status, 200);
  const conflict = await call(
    `bookings/${b.id}`,
    { carId: "CAR-002", ...future, location: "ศาลายา" },
    admin,
  );
  assert.equal(conflict.status, 409);
  const c = await call(`bookings/${b.id}/contract`, undefined, customer);
  assert.equal(c.data.signature, null);
  assert.equal(c.data.document, null);
});
test("ส่งมอบรถ รับคืน และคงสถานะรอตรวจ", async () => {
  const bs = await call("bookings", undefined, staff);
  const b = bs.data.find(
    (x) => x.car_id === "CAR-002" && x.status === "confirmed",
  );
  assert.ok(b);
  assert.equal(
    (await call(`bookings/${b.id}/handover`, {}, staff)).status,
    200,
  );
  assert.equal((await call(`bookings/${b.id}/return`, {}, staff)).status, 200);
  assert.equal(
    (await call("cars")).data.find((c) => c.id === "CAR-002").status,
    "inspection",
  );
});
let qrBooking, qrToken;
test("QR สแกนได้ ทดสอบชำระไม่สำเร็จแล้วลองใหม่ ตรวจยอด และป้องกันยืนยันซ้ำ", async () => {
  const b = await call(
    "bookings",
    {
      carId: "CAR-003",
      start: "2027-12-01T10:00:00+07:00",
      end: "2027-12-03T10:00:00+07:00",
      location: "ศาลายา",
    },
    customer,
  );
  assert.equal(b.status, 201);
  qrBooking = b.data.id;
  assert.equal(
    (
      await call(
        `bookings/${qrBooking}/payment-session`,
        { method: "qr" },
        customer,
      )
    ).status,
    400,
  );
  await call(
    `bookings/${qrBooking}/contract`,
    { accepted: true, document: "data:application/pdf;base64,JVBERi0xLjQK" },
    customer,
  );
  assert.equal(
    (
      await call(
        `bookings/${qrBooking}/payment-session`,
        { method: "cash" },
        customer,
      )
    ).status,
    403,
  );
  const first = await call(
    `bookings/${qrBooking}/payment-session`,
    { method: "qr" },
    customer,
  );
  assert.equal(first.status, 200);
  const png = PNG.sync.read(Buffer.from(first.data.qr.split(",")[1], "base64"));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded.data, first.data.url);
  const token = new URL(first.data.url).searchParams.get("token");
  assert.equal(
    (await call("demo-pay/" + token, { outcome: "failed" })).status,
    200,
  );
  const second = await call(
    `bookings/${qrBooking}/payment-session`,
    { method: "qr" },
    customer,
  );
  qrToken = new URL(second.data.url).searchParams.get("token");
  assert.notEqual(token, qrToken);
  assert.equal(
    (await call("demo-pay/" + qrToken, { outcome: "success", amount: 1 }))
      .status,
    400,
  );
  assert.equal(
    (await call("demo-pay/" + qrToken, { outcome: "success" })).status,
    200,
  );
  const replay = await call("demo-pay/" + qrToken, { outcome: "success" });
  assert.equal(replay.data.replayed, true);
  const mail = (await call("outbox", undefined, customer)).data.filter(
    (x) => x.booking_id === qrBooking,
  );
  assert.equal(mail.length, 1);
});
test("เอกสาร PDF ภาษาไทยและอีเมล MIME พร้อมเอกสารแนบ 3 ฉบับ", async () => {
  for (const kind of ["contract", "confirmation", "receipt"]) {
    const r = await fetch(
      `${base}/api/bookings/${qrBooking}/documents/${kind}.pdf`,
      { headers: { cookie: customer } },
    );
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/pdf");
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    assert.ok(bytes.length > 3000);
  }
  const mail = (await call("outbox", undefined, customer)).data.find(
    (x) => x.booking_id === qrBooking,
  );
  const r = await fetch(`${base}/api/outbox/${mail.id}.eml`, {
    headers: { cookie: customer },
  });
  assert.equal(r.status, 200);
  const eml = await r.text();
  assert.equal((eml.match(/Content-Disposition: attachment/g) || []).length, 3);
  assert.match(eml, /X-Tim-Rent-Mode: academic-demo/);
  const other = await call("login", {
    email: "other@example.test",
    password: "Testing123!",
  });
  assert.equal(
    (
      await fetch(`${base}/api/bookings/${qrBooking}/documents/receipt.pdf`, {
        headers: { cookie: other.cookie },
      })
    ).status,
    403,
  );
});
test("รายการค้างชำระหมดอายุแล้วรถกลับมาว่าง", async () => {
  const t = {
    start: "2027-12-11T10:00:00+07:00",
    end: "2027-12-12T10:00:00+07:00",
  };
  const b = await call(
    "bookings",
    { carId: "CAR-003", ...t, location: "ศาลายา" },
    customer,
  );
  assert.equal(b.status, 201);
  const d = new DatabaseSync(join(dir, "rental.sqlite"));
  d.prepare("UPDATE booking_holds SET expires=0 WHERE booking_id=?").run(
    b.data.id,
  );
  d.close();
  const r = await call(
    `bookings/${b.data.id}/payment-status`,
    undefined,
    customer,
  );
  assert.equal(r.data.status, "expired");
  const cars = await call("cars?" + new URLSearchParams(t));
  assert.equal(cars.data.find((c) => c.id === "CAR-003").available, true);
});
test("รูปความเสียหายจัดเก็บจริงและตรวจสิทธิ์เข้าถึง", async () => {
  const ins = (await call("inspections", undefined, inspector)).data[0];
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(255);
  const data =
    "data:image/png;base64," + PNG.sync.write(png).toString("base64");
  assert.equal(
    (
      await call(
        `inspections/${ins.id}/photos`,
        { files: [{ name: "damage.png", data }] },
        customer,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `inspections/${ins.id}/photos`,
        { files: [{ name: "damage.png", data }] },
        inspector,
      )
    ).status,
    201,
  );
  const photos = (
    await call(`inspections/${ins.id}/photos`, undefined, inspector)
  ).data;
  assert.equal(photos.length, 1);
  const r = await fetch(
    `${base}/api/inspections/${ins.id}/photos/${photos[0].id}`,
    { headers: { cookie: inspector } },
  );
  assert.equal(r.status, 200);
  assert.equal(
    Buffer.from(await r.arrayBuffer())
      .subarray(0, 4)
      .toString("hex"),
    "89504e47",
  );
  assert.equal(
    (
      await call(
        `inspections/${ins.id}/photos`,
        { files: [{ name: "bad.png", data: "data:image/png;base64,AAAA" }] },
        inspector,
      )
    ).status,
    400,
  );
});
test("งานบำรุงรักษาต้องผ่านตรวจอีกครั้งหลังซ่อม", async () => {
  const orders = (await call("maintenance", undefined, inspector)).data;
  assert.ok(orders.some((m) => m.car_id === "CAR-004"));
  const r = await call(
    `maintenance/${orders[0].id}/complete`,
    { notes: "ซ่อมกันชนและทำความสะอาดแล้ว" },
    inspector,
  );
  assert.equal(r.status, 200);
  assert.equal(
    (await call("cars")).data.find((c) => c.id === orders[0].car_id).status,
    "inspection",
  );
  assert.equal(
    (
      await call(
        `maintenance/${orders[0].id}/complete`,
        { notes: "duplicate" },
        inspector,
      )
    ).status,
    409,
  );
});
test("ลบและกู้คืนบัญชีลูกค้า พร้อมยุติเซสชันและคงประวัติ", async () => {
  const u = (await call("users", undefined, admin)).data.find(
    (u) => u.email === "other@example.test",
  );
  assert.equal((await call(`users/${u.id}/archive`, {}, admin)).status, 200);
  assert.equal(
    (await call("login", { email: u.email, password: "Testing123!" })).status,
    401,
  );
  assert.equal((await call(`users/${u.id}/restore`, {}, admin)).status, 200);
  assert.equal(
    (await call("login", { email: u.email, password: "Testing123!" })).status,
    200,
  );
  assert.equal((await call("users/A001/archive", {}, admin)).status, 400);
});
test("ตารางราคาตามสภาพรถและสิทธิ์ผู้ดูแล", async () => {
  const rules = (await call("pricing", undefined, admin)).data;
  assert.equal(rules.length, 9);
  for (const r of rules)
    if (r.type === "EV" && r.condition === "excellent") r.rate = 130000;
  assert.equal(
    (await call("pricing", { rules, applyToFleet: true }, staff)).status,
    403,
  );
  assert.equal(
    (await call("pricing", { rules, applyToFleet: true }, admin)).status,
    200,
  );
  assert.equal(
    (await call("cars")).data.find((c) => c.id === "CAR-003").rate,
    130000,
  );
});
test("ยกเลิกรายการยืนยันและคืนเงินทดสอบโดยเจ้าหน้าที่", async () => {
  assert.equal(
    (await call(`bookings/${qrBooking}/cancel`, { reason: "ยกเลิก" }, customer))
      .status,
    409,
  );
  const r = await call(
    `bookings/${qrBooking}/cancel`,
    { reason: "ลูกค้าขอยกเลิกการเดินทาง" },
    staff,
  );
  assert.equal(r.status, 200);
  assert.equal(r.data.refunded, true);
  const logs = await call("audit", undefined, admin);
  assert.ok(
    logs.data.some(
      (x) => x.action === "payment.success" && x.entity === qrBooking,
    ),
  );
  assert.ok(
    logs.data.some(
      (x) => x.action === "booking.cancel" && x.entity === qrBooking,
    ),
  );
});
test("ปฏิเสธคำขอแก้ข้อมูลข้ามเว็บไซต์และไม่เปิดเอกสารให้ผู้ไม่เข้าสู่ระบบ", async () => {
  const r = await fetch(base + "/api/logout", {
    method: "POST",
    headers: {
      cookie: customer,
      origin: "https://evil.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
  assert.equal(
    (await fetch(`${base}/api/bookings/${qrBooking}/documents/receipt.pdf`))
      .status,
    401,
  );
});
test("บัตรเครดิตทดสอบรับเฉพาะเลขท้าย 4 หลักและยืนยันผ่านหน้าทดสอบ", async () => {
  const b = await call(
    "bookings",
    {
      userId: "C001",
      carId: "CAR-001",
      start: "2027-12-20T10:00:00+07:00",
      end: "2027-12-22T10:00:00+07:00",
      location: "ศาลายา",
    },
    staff,
  );
  assert.equal(b.status, 201);
  await call(
    `bookings/${b.data.id}/contract`,
    { accepted: true, document: "data:application/pdf;base64,JVBERi0xLjQK" },
    staff,
  );
  const session = await call(
    `bookings/${b.data.id}/payment-session`,
    { method: "card" },
    staff,
  );
  assert.equal(session.status, 200);
  const token = new URL(session.data.url).searchParams.get("token");
  assert.equal(
    (
      await call("demo-pay/" + token, {
        outcome: "success",
        last4: "1234567890123456",
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("demo-pay/" + token, { outcome: "success", last4: "4242" }))
      .status,
    200,
  );
});
test("แบบจับเวลาตรวจผู้ใช้ใหม่และไม่ใช้ผลอัตโนมัติแทนผลจากคน", async () => {
  assert.equal(
    (
      await call("usability/start", {
        participant: "AUTO",
        newUser: false,
        consent: true,
      })
    ).status,
    400,
  );
  const r = await call("usability/start", {
    participant: "AUTO",
    newUser: true,
    consent: true,
    kind: "instrumentation-check",
  });
  assert.equal(r.status, 200);
  const s = r.data;
  assert.equal(
    (
      await call(`usability/${s.token}/finish`, {
        start: s.start,
        end: s.end,
        type: "Sedan",
      })
    ).status,
    400,
  );
  const result = await call(`usability/${s.token}/finish`, {
    start: s.start,
    end: s.end,
    type: "SUV",
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.kind, "instrumentation-check");
  assert.ok(result.data.elapsedMs >= 0);
  const evidence = await call("evidence", undefined, admin);
  assert.equal(evidence.data.humanUsabilityStatus, "awaiting-human-trial");
});
test("หลักฐานข้อกำหนดเข้าถึงได้เฉพาะผู้ดูแลและไม่รายงาน uptime ครบเดือนจากข้อมูลสั้น", async () => {
  assert.equal((await call("evidence", undefined, customer)).status, 403);
  const r = await call("evidence", undefined, admin);
  assert.equal(r.status, 200);
  assert.equal(r.data.availability.monthlyStatus, "not_yet_verified");
});
