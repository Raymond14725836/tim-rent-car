import QRCode from "qrcode";
import { randomBytes } from "node:crypto";
import { rentalPdf, emailMessage } from "./documents.mjs";

export function createFeatures(ctx) {
  const {
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
  } = ctx;
  db.exec(`CREATE TABLE IF NOT EXISTS payment_sessions(id TEXT PRIMARY KEY,token TEXT UNIQUE,booking_id TEXT REFERENCES bookings(id),method TEXT,status TEXT,expires INTEGER,created TEXT);
 CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,booking_id TEXT UNIQUE REFERENCES bookings(id),session_id TEXT UNIQUE,method TEXT,amount INTEGER,paid_at TEXT);
 CREATE TABLE IF NOT EXISTS payment_events(id TEXT PRIMARY KEY,session_id TEXT,outcome TEXT,created TEXT);
 CREATE TABLE IF NOT EXISTS booking_holds(booking_id TEXT PRIMARY KEY REFERENCES bookings(id),expires INTEGER);
 CREATE TABLE IF NOT EXISTS refunds(id TEXT PRIMARY KEY,booking_id TEXT UNIQUE REFERENCES bookings(id),amount INTEGER,reason TEXT,created TEXT);
 CREATE TABLE IF NOT EXISTS maintenance(id TEXT PRIMARY KEY,car_id TEXT REFERENCES cars(id),inspection_id TEXT,scheduled TEXT,status TEXT,vendor TEXT,notes TEXT,cost INTEGER DEFAULT 0,closed TEXT);
 CREATE TABLE IF NOT EXISTS inspection_photos(id TEXT PRIMARY KEY,inspection_id TEXT REFERENCES inspections(id),name TEXT,mime TEXT,data BLOB);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT,action TEXT,entity TEXT,details TEXT,created TEXT);
 CREATE TABLE IF NOT EXISTS archived_users(user_id TEXT PRIMARY KEY REFERENCES users(id),created TEXT);
 CREATE TABLE IF NOT EXISTS pricing_rules(type TEXT,condition TEXT,rate INTEGER,PRIMARY KEY(type,condition));
 CREATE TABLE IF NOT EXISTS car_archives(car_id TEXT PRIMARY KEY REFERENCES cars(id),created TEXT);
 CREATE TRIGGER IF NOT EXISTS booking_hold_created AFTER INSERT ON bookings WHEN NEW.status='pending' BEGIN INSERT OR REPLACE INTO booking_holds VALUES(NEW.id,unixepoch('now')*1000+900000); END;
 CREATE TRIGGER IF NOT EXISTS booking_hold_edited AFTER UPDATE OF start,end,car_id ON bookings WHEN NEW.status='pending' BEGIN UPDATE booking_holds SET expires=unixepoch('now')*1000+900000 WHERE booking_id=NEW.id; UPDATE payment_sessions SET status='expired' WHERE booking_id=NEW.id AND status='pending'; END;
 CREATE TRIGGER IF NOT EXISTS inspection_maintenance AFTER INSERT ON inspections WHEN NEW.status='maintenance' OR NEW.next_service IS NOT NULL BEGIN INSERT INTO maintenance(id,car_id,inspection_id,scheduled,status,vendor,notes) VALUES('MNT-'||hex(randomblob(6)),NEW.car_id,NEW.id,coalesce(NEW.next_service,NEW.date),'scheduled','',NEW.notes); END;`);
  run(
    "INSERT OR IGNORE INTO booking_holds SELECT id,CAST(strftime('%s',created) AS INTEGER)*1000+900000 FROM bookings WHERE status='pending'",
  );
  for (const [type, base] of [
    ["SUV", 120000],
    ["Sedan", 150000],
    ["EV", 140000],
  ])
    for (const [condition, factor] of [
      ["excellent", 1],
      ["good", 0.9],
      ["fair", 0.8],
    ])
      run(
        "INSERT OR IGNORE INTO pricing_rules VALUES(?,?,?)",
        type,
        condition,
        Math.round(base * factor),
      );
  const audit = (actor, action, entity, details = "") =>
    run(
      "INSERT INTO audit VALUES(?,?,?,?,?,?)",
      id("LOG"),
      actor || "demo-provider",
      action,
      entity,
      String(details),
      new Date().toISOString(),
    );
  function expire() {
    run(
      "UPDATE bookings SET status='expired' WHERE status='pending' AND id IN (SELECT booking_id FROM booking_holds WHERE expires<?)",
      Date.now(),
    );
    run(
      "UPDATE payment_sessions SET status='expired' WHERE status='pending' AND (expires<? OR booking_id IN (SELECT id FROM bookings WHERE status<>'pending'))",
      Date.now(),
    );
  }
  expire();
  setInterval(expire, 30000).unref();
  function context(bid) {
    const b = one("SELECT * FROM bookings WHERE id=?", bid);
    if (!b) fail("ไม่พบการจอง", 404);
    return {
      booking: b,
      car: one("SELECT * FROM cars WHERE id=?", b.car_id),
      customer: one("SELECT * FROM users WHERE id=?", b.user_id),
      payment: one("SELECT * FROM payments WHERE booking_id=?", bid),
    };
  }
  function settle(s, eventId) {
    const old = one("SELECT * FROM payments WHERE booking_id=?", s.booking_id);
    if (old && old.session_id === s.id)
      return { ok: true, replayed: true, payment: old };
    const b = one("SELECT * FROM bookings WHERE id=?", s.booking_id);
    if (
      !b ||
      b.status !== "pending" ||
      s.status !== "pending" ||
      s.expires < Date.now()
    )
      fail("รายการชำระเงินหมดอายุหรือดำเนินการแล้ว", 409);
    if (!b.signature && !b.document) fail("กรุณาลงนามสัญญาก่อน");
    const car = one("SELECT * FROM cars WHERE id=?", b.car_id);
    if (!carAvailable(car, b.start, b.end, b.id))
      fail("รถไม่พร้อมให้บริการ กรุณาติดต่อเจ้าหน้าที่", 409);
    const ref = id("PAY"),
      now = new Date().toISOString(),
      u = one("SELECT * FROM users WHERE id=?", b.user_id);
    db.exec("BEGIN IMMEDIATE");
    try {
      if (one("SELECT id FROM payment_events WHERE id=?", eventId))
        fail("เลขอ้างอิงเหตุการณ์ซ้ำ", 409);
      run(
        "INSERT INTO payment_events VALUES(?,?,?,?)",
        eventId,
        s.id,
        "success",
        now,
      );
      run(
        "INSERT INTO payments VALUES(?,?,?,?,?,?)",
        ref,
        b.id,
        s.id,
        s.method,
        b.total,
        now,
      );
      run(
        "UPDATE bookings SET status='confirmed',method=? WHERE id=?",
        s.method,
        b.id,
      );
      run("UPDATE payment_sessions SET status='success' WHERE id=?", s.id);
      run(
        "UPDATE payment_sessions SET status='expired' WHERE booking_id=? AND id<>? AND status='pending'",
        b.id,
        s.id,
      );
      run(
        "INSERT INTO outbox VALUES(?,?,?,?,?,?,?)",
        id("MAIL"),
        u.id,
        b.id,
        u.email,
        `ยืนยันการจอง ${b.id}`,
        `เรียน ${u.name}\n\nยืนยันการจอง ${car.name}\nหมายเลขจอง ${b.id}\nรับรถ ${b.start}\nคืนรถ ${b.end}\nสถานที่ ${b.location}\nยอดสุทธิ ${(b.total / 100).toFixed(2)} บาท\nเลขอ้างอิงชำระเงิน ${ref}\n\nแนบใบยืนยัน สัญญา และใบเสร็จ PDF\nกรุณานำใบขับขี่และบัตรประจำตัวมาแสดงเมื่อรับรถ\n\nอีเมลทดสอบสำหรับโครงการ ไม่มีการเรียกเก็บเงินจริง`,
        now,
      );
      audit(u.id, "payment.success", b.id, ref);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return { ok: true, payment: one("SELECT * FROM payments WHERE id=?", ref) };
  }
  return async function features({ req, res, url, user, send }) {
    expire();
    const path = url.pathname,
      method = req.method;
    const done = (v, status = 200) => {
      send(v, status);
      return true;
    };
    const binary = (buffer, type, name) => {
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      });
      res.end(buffer);
      return true;
    };
    if (path === "/api/system" && method === "GET")
      return done({
        mode: "academic-demo",
        payment: "local-test-gateway",
        email: "local-test-inbox",
        version: "3.0.0",
      });
    let m = path.match(/^\/api\/demo-pay\/([a-f0-9]{48})$/);
    if (m) {
      const s = one("SELECT * FROM payment_sessions WHERE token=?", m[1]);
      if (!s) fail("ไม่พบรายการชำระเงิน", 404);
      const b = one("SELECT * FROM bookings WHERE id=?", s.booking_id);
      if (method === "GET")
        return done({
          id: s.id,
          bookingId: b.id,
          amount: b.total,
          method: s.method,
          status: s.status,
          expires: s.expires,
          mode: "academic-demo",
        });
      if (method === "POST") {
        const x = await body(req);
        if (x.outcome === "failed") {
          if (s.status !== "pending" || s.expires < Date.now())
            fail("รายการไม่อยู่ระหว่างชำระเงิน", 409);
          run("UPDATE payment_sessions SET status='failed' WHERE id=?", s.id);
          audit(null, "payment.failed", b.id, s.id);
          return done({ ok: true, status: "failed" });
        }
        if (x.outcome !== "success") fail("ระบุผลการชำระเงิน");
        if (x.amount !== undefined && x.amount !== b.total)
          fail("ยอดชำระเงินไม่ตรงกับการจอง");
        if (
          s.method === "cash" &&
          (!Number.isFinite(+x.cashReceived) || +x.cashReceived < b.total)
        )
          fail("จำนวนเงินสดที่รับไม่เพียงพอ");
        if (s.method === "card" && !/^\d{4}$/.test(x.last4 || ""))
          fail("กรอกเลขท้ายบัตรทดสอบ 4 หลักเท่านั้น");
        const eventId = String(x.eventId || "event-" + s.id);
        if (eventId.length > 100) fail("เลขอ้างอิงยาวเกินกำหนด");
        return done({ ...settle(s, eventId), simulation: true });
      }
    }
    m = path.match(
      /^\/api\/bookings\/([^/]+)\/(payment-session|payment-status|payment|documents\/(contract|confirmation|receipt)\.pdf|original-contract)$/,
    );
    if (m) {
      authorize(user, ["customer", "staff", "admin"]);
      const b = one("SELECT * FROM bookings WHERE id=?", m[1]);
      owned(user, b);
      const action = m[2];
      if (action === "payment")
        fail("กรุณาสร้างรายการชำระเงินและยืนยันผ่านหน้าทดสอบ", 409);
      if (action === "payment-session" && method === "POST") {
        const x = await body(req);
        if (b.status !== "pending")
          fail("รายการจองไม่อยู่ระหว่างรอชำระเงิน", 409);
        if (!b.signature && !b.document) fail("กรุณาลงนามสัญญาก่อน");
        const method = x.method || "qr";
        if (
          !["qr", "cash", "card"].includes(method) ||
          (user.role === "customer" && method !== "qr")
        )
          fail("วิธีชำระเงินไม่ถูกต้อง", 403);
        let s = one(
          "SELECT * FROM payment_sessions WHERE booking_id=? AND method=? AND status='pending' AND expires>?",
          b.id,
          method,
          Date.now(),
        );
        if (!s) {
          const hold = one(
            "SELECT expires FROM booking_holds WHERE booking_id=?",
            b.id,
          );
          if (!hold || hold.expires <= Date.now())
            fail("รายการจองหมดอายุ", 409);
          s = {
            id: id("SESSION"),
            token: randomBytes(24).toString("hex"),
            booking_id: b.id,
            method,
            status: "pending",
            expires: hold.expires,
            created: new Date().toISOString(),
          };
          run(
            "INSERT INTO payment_sessions VALUES(?,?,?,?,?,?,?)",
            ...Object.values(s),
          );
        }
        const base =
          process.env.PUBLIC_BASE_URL ||
          `${req.socket.encrypted ? "https" : "http"}://${req.headers.host}`;
        const payUrl = base.replace(/\/$/, "") + "/pay?token=" + s.token;
        return done({
          id: s.id,
          url: payUrl,
          qr: await QRCode.toDataURL(payUrl, {
            width: 280,
            margin: 3,
            errorCorrectionLevel: "M",
          }),
          expires: s.expires,
          amount: b.total,
          method: s.method,
          simulation: true,
        });
      }
      if (action === "payment-status" && method === "GET")
        return done({
          status: b.status,
          payment: one("SELECT * FROM payments WHERE booking_id=?", b.id),
          hold: one(
            "SELECT expires FROM booking_holds WHERE booking_id=?",
            b.id,
          ),
        });
      if (m[3] && method === "GET") {
        const kind = m[3];
        if (
          kind !== "contract" &&
          !["confirmed", "active", "completed"].includes(b.status)
        )
          fail("เอกสารนี้ใช้ได้หลังยืนยันการชำระเงิน", 409);
        return binary(
          await rentalPdf({ kind, ...context(b.id) }),
          "application/pdf",
          `${kind}-${b.id}.pdf`,
        );
      }
      if (action === "original-contract" && method === "GET") {
        if (!b.document) fail("ไม่มีไฟล์สัญญาที่อัปโหลด", 404);
        const [prefix, encoded] = b.document.split(",");
        const pdf = prefix.includes("application/pdf");
        return binary(
          Buffer.from(encoded, "base64"),
          pdf ? "application/pdf" : "image/png",
          `signed-${b.id}.${pdf ? "pdf" : "png"}`,
        );
      }
    }
    m = path.match(/^\/api\/outbox\/([^/]+)\.eml$/);
    if (m && method === "GET") {
      authorize(user, ["customer", "staff", "admin"]);
      const message = one("SELECT * FROM outbox WHERE id=?", m[1]);
      if (!message) fail("ไม่พบอีเมล", 404);
      if (user.role === "customer" && message.user_id !== user.id)
        fail("ไม่มีสิทธิ์", 403);
      const c = context(message.booking_id);
      const attachments = await Promise.all(
        ["confirmation", "contract", "receipt"].map(async (kind) => ({
          name: `${kind}-${c.booking.id}.pdf`,
          data: await rentalPdf({ kind, ...c }),
        })),
      );
      return binary(
        emailMessage({ message, attachments }),
        "message/rfc822",
        message.id + ".eml",
      );
    }
    m = path.match(/^\/api\/bookings\/([^/]+)\/(cancel|handover)$/);
    if (m && method === "POST") {
      authorize(user, ["customer", "staff", "admin"]);
      const b = one("SELECT * FROM bookings WHERE id=?", m[1]);
      owned(user, b);
      if (m[2] === "handover") {
        authorize(user, ["staff", "admin"]);
        if (b.status !== "confirmed") fail("ต้องเป็นรายการยืนยันแล้ว");
        if (
          one("SELECT status FROM cars WHERE id=?", b.car_id).status !==
            "available" ||
          one(
            "SELECT id FROM bookings WHERE car_id=? AND status='active'",
            b.car_id,
          )
        )
          fail("รถไม่พร้อมส่งมอบหรือมีผู้เช่าใช้งานอยู่", 409);
        run("UPDATE bookings SET status='active' WHERE id=?", b.id);
        audit(user.id, "booking.handover", b.id);
        return done({ ok: true });
      }
      const x = await body(req);
      if (
        !["pending", "confirmed"].includes(b.status) ||
        (b.status === "confirmed" && user.role === "customer")
      )
        fail("สถานะนี้ต้องติดต่อเจ้าหน้าที่ หรือไม่สามารถยกเลิกได้", 409);
      if (b.status === "confirmed" && !String(x.reason || "").trim())
        fail("กรอกเหตุผลยกเลิกและคืนเงินทดสอบ");
      db.exec("BEGIN IMMEDIATE");
      try {
        const p = one("SELECT * FROM payments WHERE booking_id=?", b.id);
        if (p)
          run(
            "INSERT INTO refunds VALUES(?,?,?,?,?)",
            id("REFUND"),
            b.id,
            p.amount,
            x.reason,
            new Date().toISOString(),
          );
        run("UPDATE bookings SET status='cancelled' WHERE id=?", b.id);
        run(
          "UPDATE payment_sessions SET status='expired' WHERE booking_id=? AND status='pending'",
          b.id,
        );
        audit(
          user.id,
          "booking.cancel",
          b.id,
          x.reason || "pending cancellation",
        );
        db.exec("COMMIT");
        return done({ ok: true, refunded: !!p });
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    if (path === "/api/audit" && method === "GET") {
      authorize(user, ["admin"]);
      return done(
        query(
          "SELECT a.*,u.name actor_name FROM audit a LEFT JOIN users u ON a.actor=u.id ORDER BY a.created DESC LIMIT 200",
        ),
      );
    }
    if (path === "/api/maintenance" && method === "GET") {
      authorize(user, ["admin", "inspector"]);
      return done(
        query(
          "SELECT m.*,c.name car_name FROM maintenance m JOIN cars c ON c.id=m.car_id ORDER BY m.scheduled DESC",
        ),
      );
    }
    if (path === "/api/maintenance" && method === "POST") {
      authorize(user, ["admin", "inspector"]);
      const x = await body(req);
      if (!one("SELECT id FROM cars WHERE id=?", x.carId)) fail("ไม่พบรถ");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(x.scheduled || "") ||
        !String(x.notes || "").trim() ||
        !Number.isSafeInteger(+x.cost) ||
        x.cost < 0
      )
        fail("ระบุวัน รายละเอียด และค่าใช้จ่ายให้ถูกต้อง");
      const mid = id("MNT");
      run(
        "INSERT INTO maintenance VALUES(?,?,?,?,?,?,?,?,?)",
        mid,
        x.carId,
        null,
        x.scheduled,
        "scheduled",
        x.vendor || "",
        x.notes,
        +x.cost,
        null,
      );
      audit(user.id, "maintenance.create", mid);
      return done({ ok: true, id: mid }, 201);
    }
    m = path.match(/^\/api\/maintenance\/([^/]+)\/complete$/);
    if (m && method === "POST") {
      authorize(user, ["admin", "inspector"]);
      const x = await body(req),
        o = one("SELECT * FROM maintenance WHERE id=?", m[1]);
      if (!o) fail("ไม่พบรายการ", 404);
      if (o.status === "completed") fail("งานนี้เสร็จแล้ว", 409);
      if (!String(x.notes || "").trim()) fail("ระบุผลการซ่อม");
      run(
        "UPDATE maintenance SET status='completed',closed=?,notes=notes||? WHERE id=?",
        new Date().toISOString(),
        "\nผลการซ่อม: " + x.notes,
        o.id,
      );
      run("UPDATE cars SET status='inspection' WHERE id=?", o.car_id);
      audit(user.id, "maintenance.complete", o.id);
      return done({ ok: true, status: "inspection" });
    }
    m = path.match(/^\/api\/inspections\/([^/]+)\/photos(?:\/([^/]+))?$/);
    if (m) {
      authorize(user, ["admin", "inspector"]);
      if (!one("SELECT id FROM inspections WHERE id=?", m[1]))
        fail("ไม่พบผลตรวจ", 404);
      if (method === "POST") {
        const x = await body(req);
        if (!Array.isArray(x.files) || x.files.length > 5)
          fail("เพิ่มได้ครั้งละไม่เกิน 5 รูป");
        const total = one(
          "SELECT count(*) n FROM inspection_photos WHERE inspection_id=?",
          m[1],
        ).n;
        if (total + x.files.length > 5)
          fail("ผลตรวจหนึ่งรายการเก็บได้ไม่เกิน 5 รูป");
        const files = x.files.map((f) => {
          const match = String(f.data || "").match(
            /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/,
          );
          if (!match) fail("รองรับ PNG/JPEG เท่านั้น");
          const bytes = Buffer.from(match[2], "base64");
          if (bytes.length > 2 * 1024 * 1024) fail("รูปละไม่เกิน 2 MB");
          if (
            !(
              bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
              (bytes[0] === 255 && bytes[1] === 216)
            )
          )
            fail("ไฟล์ภาพไม่ถูกต้อง");
          return {
            id: id("PHOTO"),
            name: String(f.name || "photo").slice(0, 120),
            mime: match[1],
            bytes,
          };
        });
        db.exec("BEGIN");
        try {
          for (const f of files)
            run(
              "INSERT INTO inspection_photos VALUES(?,?,?,?,?)",
              f.id,
              m[1],
              f.name,
              f.mime,
              f.bytes,
            );
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
        return done({ ok: true, count: files.length }, 201);
      }
      if (method === "GET" && m[2]) {
        const f = one(
          "SELECT * FROM inspection_photos WHERE inspection_id=? AND id=?",
          m[1],
          m[2],
        );
        if (!f) fail("ไม่พบรูป", 404);
        res.writeHead(200, {
          "Content-Type": f.mime,
          "Cache-Control": "private,max-age=300",
        });
        res.end(f.data);
        return true;
      }
      if (method === "GET")
        return done(
          query(
            "SELECT id,name,mime FROM inspection_photos WHERE inspection_id=?",
            m[1],
          ),
        );
    }
    if (path === "/api/pricing" && method === "GET") {
      authorize(user, ["admin"]);
      return done(query("SELECT * FROM pricing_rules"));
    }
    if (path === "/api/pricing" && method === "POST") {
      authorize(user, ["admin"]);
      const x = await body(req);
      if (!Array.isArray(x.rules) || x.rules.length !== 9)
        fail("ระบุราคาครบ 9 ช่อง");
      const keys = new Set();
      for (const r of x.rules) {
        if (
          !["SUV", "Sedan", "EV"].includes(r.type) ||
          !["excellent", "good", "fair"].includes(r.condition) ||
          !Number.isSafeInteger(r.rate) ||
          r.rate <= 0
        )
          fail("ข้อมูลราคาไม่ถูกต้อง");
        keys.add(r.type + ":" + r.condition);
      }
      if (keys.size !== 9) fail("ประเภทหรือสภาพรถซ้ำ");
      db.exec("BEGIN");
      try {
        for (const r of x.rules) {
          run(
            "UPDATE pricing_rules SET rate=? WHERE type=? AND condition=?",
            r.rate,
            r.type,
            r.condition,
          );
          if (x.applyToFleet)
            run(
              "UPDATE cars SET rate=? WHERE type=? AND condition=?",
              r.rate,
              r.type,
              r.condition,
            );
        }
        audit(
          user.id,
          "pricing.update",
          "fleet",
          x.applyToFleet ? "applied to fleet" : "rules only",
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return done({ ok: true });
    }
    if (path === "/api/users" && method === "GET") {
      authorize(user, ["admin"]);
      return done(
        query(
          "SELECT u.id,u.name,u.email,u.phone,u.role,u.active,CASE WHEN a.user_id IS NULL THEN 0 ELSE 1 END archived FROM users u LEFT JOIN archived_users a ON a.user_id=u.id",
        ),
      );
    }
    m = path.match(/^\/api\/users\/([^/]+)\/(archive|restore)$/);
    if (m && method === "POST") {
      authorize(user, ["admin"]);
      const u = one("SELECT * FROM users WHERE id=?", m[1]);
      if (!u) fail("ไม่พบบัญชี", 404);
      if (u.id === user.id) fail("ไม่สามารถลบบัญชีตนเอง");
      if (m[2] === "archive") {
        if (
          u.role === "admin" &&
          u.active &&
          one("SELECT count(*) n FROM users WHERE role='admin' AND active=1")
            .n <= 1
        )
          fail("ต้องมีผู้ดูแลอย่างน้อยหนึ่งคน");
        run(
          "INSERT OR IGNORE INTO archived_users VALUES(?,?)",
          u.id,
          new Date().toISOString(),
        );
        run("UPDATE users SET active=0 WHERE id=?", u.id);
        run("DELETE FROM sessions WHERE user_id=?", u.id);
      } else {
        run("DELETE FROM archived_users WHERE user_id=?", u.id);
        run("UPDATE users SET active=1 WHERE id=?", u.id);
      }
      audit(user.id, "user." + m[2], u.id);
      return done({ ok: true });
    }
    if (path === "/api/cars/create" && method === "POST") {
      authorize(user, ["admin"]);
      const x = await body(req);
      if (
        !/^[A-Z0-9-]{3,30}$/.test(x.id || "") ||
        !String(x.name || "").trim() ||
        !["SUV", "Sedan", "EV"].includes(x.type) ||
        !Number.isSafeInteger(x.rate) ||
        x.rate <= 0 ||
        !["excellent", "good", "fair"].includes(x.condition)
      )
        fail("ข้อมูลรถไม่ถูกต้อง");
      try {
        run(
          "INSERT INTO cars VALUES(?,?,?,?,?,?,?)",
          x.id,
          x.name,
          x.type,
          x.rate,
          "inspection",
          x.condition,
          0,
        );
      } catch {
        fail("รหัสรถซ้ำ");
      }
      audit(user.id, "car.create", x.id);
      return done({ ok: true }, 201);
    }
    m = path.match(/^\/api\/cars\/([^/]+)\/(archive|restore)$/);
    if (m && method === "POST") {
      authorize(user, ["admin"]);
      const c = one("SELECT * FROM cars WHERE id=?", m[1]);
      if (!c) fail("ไม่พบรถ", 404);
      if (m[2] === "archive") {
        if (
          one(
            "SELECT id FROM bookings WHERE car_id=? AND status IN ('pending','confirmed','active') AND julianday(end)>julianday('now')",
            c.id,
          )
        )
          fail("รถมีการจองที่ยังไม่สิ้นสุด", 409);
        run(
          "INSERT OR IGNORE INTO car_archives VALUES(?,?)",
          c.id,
          new Date().toISOString(),
        );
        run("UPDATE cars SET status='maintenance' WHERE id=?", c.id);
      } else {
        run("DELETE FROM car_archives WHERE car_id=?", c.id);
        run("UPDATE cars SET status='inspection' WHERE id=?", c.id);
      }
      audit(user.id, "car." + m[2], c.id);
      return done({ ok: true });
    }
    return false;
  };
}
