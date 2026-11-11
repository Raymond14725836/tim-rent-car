const $ = (s) => document.querySelector(s),
  app = $("#app"),
  modal = $("#modal");
const futureDate = (days) =>
  new Date(Date.now() + days * 86400000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Bangkok",
  }) + "T10:00";
const state = {
  user: null,
  page: "home",
  cars: [],
  bookings: [],
  customers: [],
  users: [],
  promos: [],
  inspections: [],
  outbox: [],
  report: null,
  selected: null,
  start: futureDate(9),
  end: futureDate(11),
  location: "ศาลายา นครปฐม",
  filter: "all",
  search: "",
  reportStart: "2026-01-01",
  reportEnd: "2027-12-31",
};
const money = (n) =>
  "฿" +
  (n / 100).toLocaleString("th-TH", {
    minimumFractionDigits: n % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const date = (s) =>
  new Date(s).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
const iso = (s) => (s.length === 16 ? s + ":00+07:00" : s);
const roleName = {
  customer: "ลูกค้า",
  staff: "เจ้าหน้าที่บริการ",
  admin: "ผู้ดูแลระบบ",
  inspector: "เจ้าหน้าที่ตรวจสภาพรถ",
};
const statusName = {
  available: "พร้อมให้บริการ",
  maintenance: "ซ่อมบำรุง",
  inspection: "รอตรวจสภาพ",
  pending: "รอสัญญา / ชำระเงิน",
  confirmed: "ยืนยันแล้ว",
  active: "กำลังเช่า",
  completed: "คืนรถแล้ว",
  cancelled: "ยกเลิกแล้ว",
  expired: "หมดเวลาชำระเงิน",
};
const carIcon =
  '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 13l3-7h14l3 7M5 13h22v11H5zM8 24v3m16-3v3M4 10l-2-1m26 1l2-1"/><path d="M9 18h3m8 0h3"/></svg>';
const brand = () =>
  `<span class="brand"><span class="logo">${carIcon}</span>Tim Rent Car</span>`;
function legacyCarArt(c, hero = false) {
  const color =
    c?.type === "EV" ? "#9ac4d0" : c?.type === "Sedan" ? "#5f6f80" : "#e3e6e4";
  return `<svg viewBox="0 0 500 230" aria-label="ภาพประกอบรถ ${esc(c?.name || "SUV")}" role="img"><ellipse cx="255" cy="195" rx="207" ry="12" fill="#283740" opacity=".12"/><path d="M54 150l27-37 78-15 51-48 123 1 57 54 57 20 15 53H48z" fill="${color}" stroke="#52616a" stroke-width="3"/><path d="M173 98l42-39 109 1 42 41z" fill="#314e60"/><path d="M264 58v43M57 151l82 9 8 25H50M412 136l32 5 9 15h-42" fill="#e7f4f8" stroke="#657a87" stroke-width="3"/><path d="M167 113h215v57H165M283 112v58" fill="none" stroke="#77888c" stroke-width="2"/><path d="M243 121h17m71 0h17M60 177h50M180 181h186" stroke="#697980" stroke-width="4"/><g fill="#1d2934" stroke="#57636d" stroke-width="5"><circle cx="146" cy="176" r="34"/><circle cx="397" cy="176" r="34"/></g><g fill="#b9c4cb" stroke="#667580" stroke-width="6"><circle cx="146" cy="176" r="20"/><circle cx="397" cy="176" r="20"/></g><path d="M133 164l26 25m-26 0l26-25m225 0l26 25m-26 0l26-25" stroke="#596a77" stroke-width="3"/><path d="M79 132l59-9-8 15-58 7" fill="#f5fcff"/><rect x="55" y="164" width="47" height="10" rx="3" fill="#263642"/></svg>`;
}
function badge(s) {
  return `<span class="badge ${["available", "confirmed", "completed"].includes(s) ? "green" : ["maintenance", "cancelled"].includes(s) ? "red" : "orange"}">${esc(statusName[s] || s)}</span>`;
}
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").style.display = "block";
  clearTimeout(state.toast);
  state.toast = setTimeout(() => ($("#toast").style.display = "none"), 4500);
}
async function api(path, body) {
  const r = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "เกิดข้อผิดพลาด");
  return d;
}
function field(label, name, value = "", type = "text", extra = "") {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
const select = (label, name, opts, value = "", extra = "") =>
  `<label>${label}<select name="${name}" ${extra}>${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(value) === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
const btn = (text, action, cls = "", extra = "") =>
  `<button type="button" data-action="${action}" class="${cls}" ${extra}>${text}</button>`;
function nav() {
  return `<header class="topnav">${brand()}<nav>${btn("หน้าแรก", "home")}${btn("รถและราคา", "cars")}${btn("เงื่อนไขการเช่า", "terms")}${btn("ติดต่อเรา", "contact")}</nav><div class="actions">${state.user ? `${btn("การจองของฉัน", "bookings", "text")}${state.user.role !== "customer" ? btn("พื้นที่ทำงาน", "workspace", "text") : ""}${btn("ออกจากระบบ", "logout")}` : `${btn("เข้าสู่ระบบ", "login", "text")}${btn("สร้างบัญชี", "register", "primary")}`}</div></header>`;
}
function footer() {
  return `<footer class="foot">${brand()}<p>รถคุณภาพ ราคาชัดเจน เดินทางอย่างมั่นใจ เริ่มต้นทริปกับ Tim Rent Car</p><div class="foot-bottom"><span>© 2026 Tim Rent Car · โครงการเพื่อการศึกษา</span><span>ศาลายา นครปฐม · ระบบสาธิต ไม่รับชำระเงินจริง</span></div></footer>`;
}
function searchForm() {
  return `<form id="search-form" class="searchbar">${select(
    "สถานที่รับและคืนรถ",
    "location",
    [
      ["ศาลายา นครปฐม", "ศาลายา นครปฐม"],
      ["กรุงเทพฯ", "กรุงเทพฯ"],
    ],
    state.location,
  )}${field("วันและเวลารับรถ · เวลาไทย", "start", state.start, "datetime-local", "required")}${field("วันและเวลาคืนรถ · เวลาไทย", "end", state.end, "datetime-local", "required")}<button class="primary">⌕ &nbsp; ค้นหารถ</button></form>`;
}
function cards() {
  let cars = state.cars.filter(
    (c) =>
      (state.filter === "all" || c.type === state.filter) &&
      c.name.toLowerCase().includes(state.search.toLowerCase()),
  );
  return cars.length
    ? `<div class="grid3">${cars.map((c) => `<article class="card"><div class="car-art">${carArt(c)}${badge(c.available ? "available" : c.status === "available" ? "ไม่ว่างในช่วงที่เลือก" : c.status)}</div><div class="cardbody"><div class="car-title"><h3>${esc(c.name)}</h3><span class="badge">${esc(c.type)}</span></div><p>${esc(c.id)} · ${c.condition === "excellent" ? "สภาพดีเยี่ยม" : c.condition === "good" ? "สภาพดี" : "สภาพปานกลาง"}</p><div class="specs"><span>♧ &nbsp;${c.name.includes("Fortuner") ? 7 : 5} ที่นั่ง</span><span>⚙ &nbsp;อัตโนมัติ</span><span>${c.type === "EV" ? "ϟ ไฟฟ้า" : "⛽ เบนซิน"}</span></div><hr class="line"><div class="price">${money(c.rate)} <small>/ วัน</small></div>${btn("ดูรายละเอียดและจอง", "choose", "wide", `data-id="${c.id}" ${!c.available ? "disabled" : ""}`)}</div></article>`).join("")}</div>`
    : `<div class="empty">ไม่พบรถที่ตรงกับการค้นหา ลองเปลี่ยนประเภทหรือชื่อรถ</div>`;
}
function home() {
  return `<div class="container"><section class="hero"><div><span class="eyebrow">— &nbsp; วางแผนน้อยลง ออกเดินทางมากขึ้น</span><h1>ค้นหาและเช่ารถที่ใช่<br>ได้ในไม่กี่นาที</h1><p>จะขับในวันทำงานหรือเที่ยววันหยุด ก็พบรถที่ใช่ ในราคาที่เหมาะสม พร้อมไปกับคุณทุกเส้นทาง</p></div><div class="hero-art">${carArt(null, true)}<span class="art-caption">ภาพประกอบสำหรับโครงการ</span></div></section>${searchForm()}<div class="benefits"><span>✓ รถดูแลรักษาอย่างดี</span><span>◇ รวมประกันภัยมาตรฐาน</span><span>♧ ราคาเช่ารายวันชัดเจน</span></div><section class="section"><div class="sectionhead"><div><span class="eyebrow">รถที่ใช่สำหรับทุกแผนการเดินทาง</span><h2>พบรถคู่ใจคันต่อไป</h2><p>ขับในเมือง ออกทริป หรือเดินทางสบาย ๆ เลือกรถที่เหมาะกับคุณ</p></div>${btn("ดูรถทั้งหมด ↗", "cars", "text")}</div>${cards()}</section></div>`;
}
function cars() {
  return `<div class="container"><h1>รถและราคา</h1><p>เลือกรถและช่วงเวลาที่ต้องการ ระบบตรวจสอบความพร้อมจากรายการจองจริง</p>${searchForm()}<section class="section"><div class="filterbar">${select(
    "ประเภทรถ",
    "carType",
    [
      ["all", "ทุกประเภท"],
      ["SUV", "SUV"],
      ["Sedan", "ซีดาน"],
      ["EV", "รถไฟฟ้า"],
    ],
    state.filter,
  )}${field("ค้นหาชื่อรถ", "carSearch", state.search)}</div>${cards()}</section></div>`;
}
function terms() {
  return `<div class="container"><h1>เงื่อนไขการเช่ารถ</h1><div class="panel"><h3>1. ระยะเวลาและการรับคืนรถ</h3><p>คิดค่าเช่าต่อ 24 ชั่วโมง เศษของวันปัดขึ้นเป็นหนึ่งวัน รับและคืนตามสถานที่และเวลาที่ระบุในการจอง</p><h3>2. เอกสารและผู้ขับขี่</h3><p>นำใบขับขี่ที่ยังไม่หมดอายุ บัตรประจำตัวหรือหนังสือเดินทาง และใบยืนยันการจองมาแสดงเมื่อรับรถ ใช้รถตามกฎหมายและไม่ให้เช่าช่วง</p><h3>3. ราคาและประกันภัย</h3><p>ราคารวมประกันภัยมาตรฐาน ระบบคำนวณส่วนลดก่อนบวกภาษีมูลค่าเพิ่ม 7% ค่าเสียหายและการทำความสะอาดเพิ่มเติมคำนวณจากผลตรวจสภาพรถ</p><h3>4. การคืนรถ</h3><p>คืนรถพร้อมระดับน้ำมันและสภาพตามที่รับมอบ แจ้งเจ้าหน้าที่ทันทีหากเกิดอุบัติเหตุหรือต้องการเปลี่ยนเวลาคืน</p><div class="notice">ระบบนี้เป็นโครงการเพื่อการศึกษา การลงนามและการชำระเงินเป็นข้อมูลทดสอบเท่านั้น</div></div></div>`;
}
function contact() {
  return `<div class="container"><h1>ติดต่อเรา</h1><div class="panel"><h2>Tim Rent Car · สาขาศาลายา</h2><p>สถานที่รับ–คืนรถ: ศาลายา นครปฐม</p><p>สำหรับระบบสาธิต สามารถติดต่อเจ้าหน้าที่ผ่านบัญชีทดสอบ staff@tim.test และดูรายการจองในพื้นที่ทำงานได้ ยังไม่มีการกำหนดเบอร์โทรศัพท์หรือช่องทางติดต่อจริงของบริษัท</p>${btn("ค้นหารถ", "cars", "primary")}</div></div>`;
}
function bookingTable() {
  return `<div class="tablewrap"><table><thead><tr><th>หมายเลขจอง / ลูกค้า</th><th>รถ</th><th>รับ / คืน · เวลาไทย</th><th>ยอดสุทธิ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${state.bookings.map((b) => `<tr><td><strong>${esc(b.id)}</strong>${esc(b.customer)}</td><td>${esc(b.car_name)}</td><td>${date(b.start)}<br>${date(b.end)}</td><td>${money(b.total)}</td><td>${badge(b.status)}</td><td>${b.status === "pending" && ["staff", "admin"].includes(state.user.role) ? btn("แก้ไข", "edit-booking", "", `data-id="${b.id}"`) : ""}${b.status === "pending" ? `${btn("สัญญา / ชำระเงิน", "checkout", "", `data-id="${b.id}"`)}${btn("ยกเลิก", "cancel-booking", "", `data-id="${b.id}"`)}` : btn("ใบยืนยัน", "confirmation", "", `data-id="${b.id}"`)}${["staff", "admin"].includes(state.user?.role) && b.status === "confirmed" ? btn("ส่งมอบรถ", "handover", "", `data-id="${b.id}"`) : ""}${["staff", "admin"].includes(state.user?.role) && b.status === "active" ? btn("รับคืนรถ", "return", "", `data-id="${b.id}"`) : ""}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">ยังไม่มีรายการจอง</td></tr>'}</tbody></table></div>`;
}
function bookings() {
  return `<div class="${state.user.role === "customer" ? "container" : ""}"><div class="sectionhead"><div><h1>${state.user.role === "customer" ? "การจองของฉัน" : "รายการจองและตารางรับ–คืนรถ"}</h1><p>ตรวจสอบสัญญา สถานะ และรายละเอียดการเดินทาง</p></div>${btn("＋ สร้างการจองใหม่", state.user.role === "customer" ? "cars" : "newbooking", "primary")}</div><div class="panel">${bookingTable()}</div></div>`;
}
function summary(q) {
  return `<div class="totals"><span>${q.days} วัน × ${money(q.car.rate)}</span><b>${money(q.base)}</b></div><div class="totals"><span>ส่วนลด</span><b>−${money(q.discount)}</b></div><div class="totals"><span>ภาษีมูลค่าเพิ่ม 7%</span><b>${money(q.tax)}</b></div><div class="total"><b>ยอดสุทธิ</b><strong>${money(q.total)}</strong></div>${!q.available ? '<div class="error">รถไม่ว่างในช่วงวันที่เลือก พบการจองทับซ้อนหรือรถไม่พร้อมให้บริการ</div>' : ""}`;
}
function bookingForm() {
  return `<div class="sectionhead"><div><h1>สร้างการจองใหม่</h1><p>เลือกลูกค้า รถ และช่วงเวลารับ–คืน พร้อมตรวจสอบราคาก่อนยืนยัน</p></div><span class="badge">ฉบับร่าง</span></div><form id="booking-form"><div class="split"><div class="stack"><section class="panel"><h2><span class="num">1</span>ค้นหาและเลือกลูกค้า</h2>${select("ลูกค้า", "userId", [["", "เลือกลูกค้า"], ...state.customers.filter((c) => c.active).map((c) => [c.id, `${c.id} · ${c.name} · ${c.email}`])], "C001", "required")}<p class="muted">สามารถจัดการข้อมูลลูกค้าเพิ่มเติมได้จากบัญชีผู้ดูแลระบบ</p></section><section class="panel"><h2><span class="num">2</span>เลือกรถและกำหนดวันรับ–คืน</h2>${select(
    "รถที่ต้องการ",
    "carId",
    state.cars.map((c) => [
      c.id,
      `${c.id} · ${c.name} · ${money(c.rate)}/วัน · ${statusName[c.status]}`,
    ]),
    state.cars[0]?.id,
  )}<div class="fields">${field("วันเวลารับรถ · เวลาไทย", "start", state.start, "datetime-local", "required")}${field("วันเวลาคืนรถ · เวลาไทย", "end", state.end, "datetime-local", "required")}</div>${field("สถานที่รับ–คืน / นัดหมาย", "location", state.location, "text", "required")}</section></div><div class="stack"><section class="panel"><h2><span class="num">3</span>ราคาและรหัสโปรโมชัน</h2>${field("รหัสส่วนลด (ถ้ามี)", "code", "", "text", 'placeholder="เช่น SEASON15"')}${btn("ตรวจสอบราคาและรถว่าง", "quote-booking", "wide")}<div id="quote-result"><p class="statusnote">กดตรวจสอบเพื่อแสดงยอดสุทธิ</p></div></section><div class="notice">สร้างรายการจองแล้วไปลงนามสัญญาและเลือกวิธีรับชำระเงิน</div><button class="primary wide">สร้างการจองและไปลงนาม →</button></div></div><div class="error" id="form-error" hidden></div></form>`;
}
function legacyCheckout() {
  const b = state.bookings.find((x) => x.id === state.selected);
  if (!b) return '<div class="empty">ไม่พบรายการจอง</div>';
  return `<div class="container"><h1>อีกนิดเดียว ก็พร้อมออกเดินทาง</h1><p>ตรวจสอบสัญญา ลงนาม และชำระเงินเพื่อยืนยันการจองของคุณ</p><div class="steps"><span>① สัญญาเช่ารถ · ${b.signed || b.has_document ? "ลงนามแล้ว" : "ตรวจสอบและลงนาม"}</span><span>② การชำระเงิน · โหมดทดสอบ</span></div><div class="split"><section class="panel"><h2>สัญญาเช่ารถ</h2><div class="sectionhead"><b>${esc(b.id)}</b>${btn("พิมพ์สัญญา", "print-contract", "text", `data-id="${b.id}"`)}</div><div class="terms"><b>1. ระยะเวลาเช่าและการรับรถ</b><p>เช่าตั้งแต่ ${date(b.start)} ถึง ${date(b.end)} รับและคืนรถที่ ${esc(b.location)}</p><b>2. ผู้ขับขี่และการใช้งานที่อนุญาต</b><p>แสดงใบขับขี่ที่ยังไม่หมดอายุและบัตรประจำตัวเมื่อรับรถ เฉพาะผู้ขับขี่ที่ระบุชื่อเท่านั้น ใช้รถบนถนนสาธารณะในประเทศไทย ห้ามแข่งรถหรือให้เช่าช่วง</p><b>3. ประกันภัยและการดูแลรักษา</b><p>รวมประกันภัยมาตรฐาน ความคุ้มครองเป็นไปตามเงื่อนไข แจ้งอุบัติเหตุหรือความเสียหายแก่ Tim Rent Car ทันที</p><b>4. เงื่อนไขการคืนรถ</b><p>คืนรถพร้อมระดับน้ำมันและสภาพเดิม ค่าเสียหายคำนวณตามรายการตรวจสภาพ โปรดติดต่อเจ้าหน้าที่ล่วงหน้าหากต้องการต่อเวลา</p></div><form id="contract-form"><label style="margin-top:22px">ลายเซ็นดิจิทัล · ใช้เมาส์หรือสัมผัสหน้าจอ</label><canvas id="signature" class="canvas" width="1000" height="340" aria-label="พื้นที่วาดลายเซ็น"></canvas><div class="actionsrow">${btn("ล้างลายเซ็น", "clear-signature")}</div><label>หรืออัปโหลดสัญญาที่ลงนามแล้ว (PDF / PNG ไม่เกิน 10 MB)<input type="file" id="contract-file" accept="application/pdf,image/png"></label><label><input name="accepted" type="checkbox" required>ฉันยอมรับเงื่อนไขการเช่าและประกันภัยสำหรับการทดสอบนี้</label><button class="primary wide">บันทึกสัญญาและยืนยันลายเซ็น</button><div id="form-error" class="error" hidden></div></form></section><div class="stack"><section class="panel"><h2>สรุปการจอง</h2><h3>${esc(b.car_name)}</h3><p>${esc(b.customer)} · ${b.days} วัน</p><hr class="line"><p>รับรถ ${date(b.start)}<br>คืนรถ ${date(b.end)}<br>⌖ ${esc(b.location)}</p><div class="totals"><span>ค่าเช่ารถ</span><b>${money(b.base)}</b></div><div class="totals"><span>ส่วนลด</span><b>−${money(b.discount)}</b></div><div class="totals"><span>ภาษีมูลค่าเพิ่ม 7%</span><b>${money(b.tax)}</b></div><div class="total"><b>ยอดสุทธิ</b><strong>${money(b.total)}</strong></div></section><section class="panel"><h2>การชำระเงิน</h2><form id="payment-form">${
    state.user.role === "customer"
      ? '<input type="hidden" name="method" value="qr">'
      : select(
          "เลือกวิธีรับชำระเงิน",
          "method",
          [
            ["cash", "เงินสด"],
            ["card", "บัตรเครดิต"],
            ["qr", "QR Code"],
          ],
          "qr",
        )
  }<div class="qrtest"><div class="qrmark">▣</div><b>QR สำหรับการชำระเงิน</b><p>โหมดจำลอง · ยังไม่เชื่อมผู้ให้บริการชำระเงิน<br>ห้ามโอนเงินจริง</p><strong class="price">${money(b.total)}</strong></div><button class="primary wide" ${!b.signed && !b.has_document ? "disabled" : ""}>จำลองการชำระเงินสำเร็จ →</button><p class="statusnote">${b.signed || b.has_document ? "✓ บันทึกสัญญาแล้ว" : "ลงนามสัญญาก่อนยืนยันการชำระเงิน"}</p></form></section></div></div></div>`;
}
function confirmation() {
  const b = state.confirmation;
  if (!b) return "";
  return `<div class="container"><section class="panel success"><div class="successmark">✓</div><h1>${b.status === "pending" ? "รายละเอียดการจอง" : "ยืนยันการจองแล้ว!"}</h1><h2>${esc(b.id)}</h2><p>${b.status === "pending" ? "กรุณาลงนามและดำเนินการชำระเงิน" : "ใบยืนยันถูกบันทึกไว้ในกล่องอีเมลทดสอบของคุณแล้ว"}</p>${badge(b.status)}<hr class="line"><div class="split" style="text-align:left"><div><h2>${esc(b.car.name)}</h2><p>${esc(b.customer.name)}<br>${esc(b.customer.email)}</p><p>นำใบขับขี่และบัตรประจำตัวมาแสดงเมื่อรับรถ</p></div><div><p>รับรถ: ${date(b.start)}<br>คืนรถ: ${date(b.end)}<br>สถานที่: ${esc(b.location)}</p><h2>ยอดสุทธิ ${money(b.total)}</h2></div></div><div class="notice">ระบบสาธิต · ไม่มีการรับเงินจริงหรือส่งอีเมลออกภายนอก</div><div class="actionsrow">${btn("พิมพ์ / บันทึก PDF", "print")}${btn("ดูอีเมลทดสอบ", "outbox")}${btn("ดูรายการจอง", "bookings", "primary")}</div></section></div>`;
}
function workspace() {
  const r = state.user.role;
  const menus =
    r === "admin"
      ? [
          ["reports", "วิเคราะห์ & รายงาน"],
          ["users", "จัดการลูกค้าและสิทธิ์"],
          ["promos", "ราคาและโปรโมชัน"],
          ["fleet", "สถานะยานพาหนะ"],
          ["bookings", "รายการจอง"],
          ["newbooking", "สร้างการจองใหม่"],
          ["inspections", "ประวัติการตรวจ"],
          ["maintenance", "บำรุงรักษา"],
          ["audit", "ประวัติการดำเนินการ"],
        ]
      : r === "staff"
        ? [
            ["newbooking", "＋ สร้างการจองใหม่"],
            ["fleet", "รายการรถ"],
            ["bookings", "ตารางรับ–คืนรถ"],
            ["outbox", "อีเมลทดสอบ"],
          ]
        : [
            ["inspect", "ตรวจสภาพรถ"],
            ["fleet", "รายการรถ"],
            ["inspections", "ประวัติการตรวจ"],
            ["maintenance", "บำรุงรักษา"],
          ];
  const names = Object.fromEntries(menus);
  const content = {
    newbooking: bookingForm,
    bookings,
    users: usersView,
    promos: promosView,
    fleet: fleetView,
    reports: reportsView,
    inspect: inspectView,
    inspections: inspectionHistory,
    maintenance: maintenanceView,
    audit: auditView,
    outbox: outboxView,
  }[state.page];
  return `<div class="workspace ${r}"><aside class="sidebar">${brand()}<div class="profile"><b>${esc(state.user.name)}</b><br>${roleName[r]}<br><span style="color:#35c89a">● กำลังใช้งาน</span></div><small>พื้นที่ทำงาน</small><nav>${menus.map(([p, n]) => btn(n, p, p === state.page ? "selected" : "")).join("")}</nav><div class="sidebar-bottom">${btn("↗ ไปหน้าเว็บไซต์", "home")}${btn("ออกจากระบบ", "logout")}<p class="statusnote">โครงการเพื่อการศึกษา · v3.0</p></div></aside><div class="workmain"><header class="worktop"><span>พื้นที่ทำงาน &nbsp; / &nbsp; ${names[state.page] || ""}</span><span>● ระบบออนไลน์ &nbsp; · &nbsp; ${new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })} (UTC+7)</span></header><main class="workcontent">${content ? content() : ""}</main></div></div>`;
}
function legacyUsersView() {
  const us = state.users.filter((u) =>
    (u.name + u.email + u.id)
      .toLowerCase()
      .includes(state.search.toLowerCase()),
  );
  return `<div class="sectionhead"><div><h1>จัดการลูกค้าและสิทธิ์ผู้ใช้งาน</h1><p>เพิ่มและแก้ไขข้อมูล กำหนดบทบาท และระงับบัญชีที่ไม่ได้ใช้งาน</p></div>${btn("＋ เพิ่มผู้ใช้งาน", "edit-user", "primary")}</div><div class="panel"><div class="toolbar">${field("ค้นหาชื่อ อีเมล หรือรหัส", "userSearch", state.search)}${btn("ส่งออก CSV", "export-users")}</div><div class="tablewrap"><table><thead><tr><th>ชื่อ / อีเมล</th><th>รหัส</th><th>โทรศัพท์</th><th>บทบาท</th><th>สถานะ</th><th>ดำเนินการ</th></tr></thead><tbody>${us.map((u) => `<tr><td><strong>${esc(u.name)}</strong>${esc(u.email)}</td><td>${esc(u.id)}</td><td>${esc(u.phone)}</td><td>${roleName[u.role]}</td><td>${badge(u.active ? "ใช้งาน" : "ระงับบัญชี")}</td><td>${btn("แก้ไข", "edit-user", "", `data-id="${u.id}"`)}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">ไม่พบผู้ใช้งาน</td></tr>'}</tbody></table></div><p class="statusnote">รวม ${us.length} รายการ · การระงับบัญชีคงประวัติการจองเดิมไว้</p></div>`;
}
function legacyFleetView() {
  return `<div class="sectionhead"><div><h1>สถานะยานพาหนะ</h1><p>แสดงสภาพรถ อัตราเช่า และสถานะความพร้อมให้บริการ</p></div></div><div class="grid3">${state.cars.map((c) => `<div class="card"><div class="car-art">${carArt(c)}${badge(c.status)}</div><div class="cardbody"><h3>${esc(c.name)}</h3><p>${c.id} · ${c.odometer.toLocaleString()} กม.</p><p>สภาพ: ${esc(c.condition)} · ${money(c.rate)}/วัน</p>${["staff", "admin"].includes(state.user.role) ? btn("แก้ไขสถานะ / ราคา", "edit-car", "wide", `data-id="${c.id}"`) : btn("บันทึกผลตรวจ", "inspect-car", "wide", `data-id="${c.id}"`)}</div></div>`).join("")}</div>`;
}
function legacyPromosView() {
  return `<div class="sectionhead"><div><h1>ราคาและโปรโมชันตามฤดูกาล</h1><p>กำหนดส่วนลด ช่วงเวลาพิเศษ และระยะเวลาเช่าขั้นต่ำ</p></div>${btn("＋ เพิ่มโปรโมชัน", "edit-promo", "primary")}</div><div class="split"><div class="panel"><h2>โปรโมชันทั้งหมด</h2>${state.promos.map((p) => `<div class="checkrow"><div><h3>${esc(p.name)} <span class="badge">${esc(p.code)}</span></h3><p>${p.start} ถึง ${p.end}<br>เช่าอย่างน้อย ${p.min_days} วัน · ${p.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</p></div><div><h2>ลด ${p.percent}%</h2>${btn("แก้ไข", "edit-promo", "", `data-id="${p.code}"`)}</div></div>`).join("")}</div><div class="panel"><h2>อัตราค่าเช่าพื้นฐาน</h2><p>ปรับราคาตามสภาพรถได้ในหน้าสถานะยานพาหนะ การเปลี่ยนราคาจะมีผลกับการจองใหม่</p>${state.cars.map((c) => `<div class="totals"><span>${esc(c.name)}</span><b>${money(c.rate)}/วัน</b></div>`).join("")}${btn("ปรับอัตราค่าเช่า", "fleet", "wide")}</div></div>`;
}
function reportsView() {
  const r = state.report;
  if (!r) return "";
  const months = r.monthly.length ? r.monthly : [["ไม่มีข้อมูล", 0]],
    max = Math.max(...months.map((x) => x[1]), 1);
  return `<h1>ภาพรวมการดำเนินงาน</h1><p>ติดตามการจองและรายได้จากข้อมูลในฐานข้อมูล</p><form id="report-form" class="toolbar">${field("เริ่มวันรับรถ", "start", state.reportStart, "date")}${field("สิ้นสุดวันรับรถ", "end", state.reportEnd, "date")}<button>แสดงรายงาน</button>${btn("ส่งออก CSV", "export-report")}${btn("พิมพ์ / PDF", "print")}</form><div class="stats">${[
    ["การจองทั้งหมด", r.bookings + ""],
    ["ยอดจองที่ยืนยันแล้ว", money(r.revenue)],
    ["การเช่าที่กำลังดำเนินการ", r.active + ""],
    ["รถอยู่ระหว่างซ่อมบำรุง", r.maintenance + " คัน"],
  ]
    .map(
      ([l, v]) =>
        `<div class="stat"><span class="muted">${l}</span><strong>${v}</strong><small>${l === "รถอยู่ระหว่างซ่อมบำรุง" ? "สถานะปัจจุบัน" : "ตามช่วงวันที่รับรถที่เลือก"}</small></div>`,
    )
    .join(
      "",
    )}</div><div class="split"><section class="panel"><h2>จำนวนการจองที่ยืนยันรายเดือน</h2><div class="bars">${months.map(([m, n]) => `<div class="bar" style="height:${Math.max((n / max) * 100, 1)}%"><span>${n}</span></div>`).join("")}</div><div class="chartlabels">${months.map(([m]) => `<span>${m}</span>`).join("")}</div></section><section class="panel"><h2>ยอดจองตามรุ่นรถ</h2>${r.byCar.map((c) => `<div class="totals"><span>${esc(c.name)}</span><b>${money(c.total)}</b></div><div class="progress"><div style="width:${r.revenue ? (c.total / r.revenue) * 100 : 0}%"></div></div>`).join("")}</section></div><p class="statusnote">รวมรายการยืนยัน กำลังเช่า และคืนรถแล้ว · ยอดเป็นข้อมูลทดสอบ รวมภาษี 7% · ไม่รวมค่าเสียหายจากผลตรวจ</p>`;
}
const checks = [
  "กันชนหน้า",
  "ประตูและตัวถัง",
  "กระจกและหน้าต่าง",
  "ความสะอาดห้องโดยสาร",
  "เบาะและแผงหน้าปัด",
  "ยางและแรงดันลม",
  "ไฟหน้าและไฟเบรก",
];
function inspectView() {
  const c =
    state.cars.find((c) => c.id === state.inspectCar) ||
    state.cars.find((c) => c.status === "inspection") ||
    state.cars[0];
  return `<h1>ตรวจสภาพและประเมินรถ</h1><p>บันทึกสภาพรถก่อนส่งมอบ หลังรับคืน และตามรอบบำรุงรักษา</p><form id="inspection-form"><section class="panel" style="margin-bottom:24px"><h2><span class="num">1</span>ข้อมูลรถ</h2><div class="fields">${select(
    "เลือกรถ",
    "carId",
    state.cars.map((c) => [
      c.id,
      `${c.id} · ${c.name} · ${statusName[c.status]}`,
    ]),
    c.id,
  )}${select(
    "ประเภทการตรวจ",
    "phase",
    [
      ["before", "ตรวจก่อนส่งมอบ"],
      ["after", "ตรวจรับคืนรถ"],
      ["monthly", "ตรวจประจำเดือน"],
    ],
    "after",
  )}${field("วันที่ตรวจ", "date", new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }), "date", "required")}${field("เลขไมล์ปัจจุบัน (กม.)", "odometer", c.odometer, "number", `min="${c.odometer}" required`)}${field("ระดับน้ำมัน (%)", "fuel", 75, "number", 'min="0" max="100" required')}</div></section><div class="split"><section class="panel"><h2><span class="num">2</span>รายการตรวจสภาพ</h2>${checks
    .map(
      (x, i) =>
        `<div class="checkrow"><b>${i + 1}. ${x}</b>${select(
          "ผลตรวจ",
          "check" + i,
          [
            ["", "เลือกผล"],
            ["pass", "✓ ผ่าน"],
            ["damage", "✕ เสียหาย / บกพร่อง"],
          ],
          "",
          "required",
        )}</div>`,
    )
    .join(
      "",
    )}<p class="statusnote">ต้องตรวจให้ครบทั้ง 7 รายการก่อนบันทึก</p><label>รูปความเสียหาย (PNG/JPEG ไม่เกิน 5 รูป รูปละ 2 MB)<input type="file" name="photos" accept="image/png,image/jpeg" multiple></label></section><div class="stack"><section class="panel"><h2><span class="num">3</span>ค่าเสียหาย</h2><div id="damage-result"><p>เลือกผลตรวจเพื่อคำนวณค่าเสียหาย</p></div></section><section class="panel"><h2><span class="num">4</span>สถานะบำรุงรักษา</h2>${select(
    "สถานะหลังตรวจ",
    "status",
    [
      ["available", "รถพร้อมให้บริการ"],
      ["maintenance", "ส่งซ่อมบำรุง"],
    ],
  )}<label>รายละเอียดความเสียหาย / หมายเหตุ<textarea name="notes" placeholder="ระบุอาการและงานซ่อมที่ต้องดำเนินการ"></textarea></label>${field("นัดหมายบำรุงรักษาครั้งถัดไป", "nextService", "", "date")}<div class="notice">หากพบความเสียหาย ระบบจะตั้งสถานะซ่อมบำรุงโดยอัตโนมัติ</div></section><button class="primary wide">บันทึกผลตรวจและอัปเดตสถานะรถ</button></div></div><div id="form-error" class="error" hidden></div></form>`;
}
function legacyInspectionHistory() {
  return `<h1>ประวัติการตรวจและบำรุงรักษา</h1><p>ผลตรวจและค่าเสียหายที่บันทึกไว้ในระบบ</p><div class="panel tablewrap"><table><thead><tr><th>หมายเลข / วันที่</th><th>รถ</th><th>ประเภท</th><th>ค่าเสียหาย</th><th>สถานะ</th><th>หมายเหตุ / นัดครั้งถัดไป</th></tr></thead><tbody>${state.inspections.map((i) => `<tr><td><strong>${esc(i.id)}</strong>${esc(i.date)}</td><td>${esc(i.car_name)}</td><td>${{ before: "ก่อนส่งมอบ", after: "หลังรับคืน", monthly: "ประจำเดือน" }[i.phase]}</td><td>${money(i.damage)}</td><td>${badge(i.status)}</td><td style="white-space:normal;min-width:180px">${esc(i.notes)}<br>${esc(i.next_service || "ยังไม่นัดหมาย")}<br>${btn("ดูรูปและผลตรวจ", "inspection-detail", "", `data-id="${i.id}"`)}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">ยังไม่มีประวัติการตรวจ</td></tr>'}</tbody></table></div>`;
}
function outboxView() {
  return `<div class="${state.user.role === "customer" ? "container" : ""}"><h1>กล่องอีเมลทดสอบ</h1><p>ใบยืนยันการจองที่สร้างโดยระบบ ยังไม่มีการส่งอีเมลไปยังผู้รับภายนอก</p><div class="stack">${state.outbox.map((m) => `<article class="panel"><h3>${esc(m.subject)}</h3><p>ถึง ${esc(m.recipient)} · ${date(m.created)}</p><p style="white-space:pre-line">${esc(m.body)}</p>${btn("ดูใบยืนยัน", "confirmation", "", `data-id="${m.booking_id}"`)}</article>`).join("") || '<div class="panel empty">ยังไม่มีอีเมลยืนยัน กรุณาดำเนินการจองให้ครบขั้นตอน</div>'}</div></div>`;
}
function legacyRender() {
  const publicPages = [
    "home",
    "cars",
    "terms",
    "contact",
    "checkout",
    "confirmation",
  ];
  const isWork =
    state.user &&
    state.user.role !== "customer" &&
    !publicPages.includes(state.page);
  app.innerHTML = isWork
    ? workspace()
    : `${nav()}<main>${({ home, cars, terms, contact, bookings, checkout, confirmation, outbox: outboxView }[state.page] || home)()}</main>${footer()}`;
  if (state.page === "checkout") signatureSetup();
}
async function load() {
  if (state.user && ["admin", "inspector"].includes(state.user.role))
    state.maintenance = await api("maintenance");
  if (state.user?.role === "admin") {
    state.pricing = await api("pricing");
    if (state.page === "audit") state.audit = await api("audit");
  }
  state.cars = await api(
    "cars?" +
      new URLSearchParams({ start: iso(state.start), end: iso(state.end) }),
  );
  if (state.user) {
    state.bookings = await api("bookings");
    if (["staff", "admin"].includes(state.user.role))
      state.customers = await api("customers");
    if (state.user.role === "admin") {
      state.users = await api("users");
      state.promos = await api("promos");
      state.report = await api(
        "reports?" +
          new URLSearchParams({
            start: state.reportStart,
            end: state.reportEnd,
          }),
      );
    }
    if (["admin", "inspector"].includes(state.user.role))
      state.inspections = await api("inspections");
    if (state.user.role !== "inspector") state.outbox = await api("outbox");
  }
}
async function go(page) {
  state.page = page;
  sessionStorage.setItem("tim-page", page);
  await load();
  render();
  window.scrollTo(0, 0);
}
function openDialog(content) {
  modal.innerHTML = content;
  modal.showModal();
  modal.querySelector("input,button")?.focus();
}
function auth(mode = "login") {
  state.auth = mode;
  openDialog(
    `<div class="modalhead"><span></span>${btn("✕", "close")}</div><div class="auth"><div class="authlogo"><span class="logo">${carIcon}</span></div><h2>ยินดีต้อนรับสู่ Tim Rent Car</h2><p style="text-align:center">เข้าสู่ระบบเพื่อจัดการการจองและลงนามสัญญา</p><div class="tabs">${btn("เข้าสู่ระบบ", "login", mode === "login" ? "selected" : "")}${btn("สร้างบัญชี", "register", mode === "register" ? "selected" : "")}</div><form id="auth-form">${mode === "register" ? `${field("ชื่อ–นามสกุล", "name", "", "text", "required")}${field("หมายเลขโทรศัพท์", "phone", "", "tel", "required")}` : ""}${field("อีเมล", "email", "", "email", 'required autocomplete="username"')}${field("รหัสผ่าน", "password", "", "password", 'required minlength="8" autocomplete="current-password"')}${mode === "register" ? field("ยืนยันรหัสผ่าน", "confirm", "", "password", 'required minlength="8"') : ""}<button class="primary wide">${mode === "register" ? "สร้างบัญชี" : "เข้าสู่ระบบ"}</button><div class="error" id="auth-error" hidden></div></form>${
      mode === "login"
        ? `<div class="demoaccounts" style="margin-top:20px"><b>บัญชีทดสอบ · รหัสผ่าน Demo1234!</b><br>${Object.entries(
            roleName,
          )
            .map(([r, n]) => btn(n, "demo-login", "", `data-role="${r}"`))
            .join("")}<br>ระบบสาธิต ไม่รับชำระเงินจริง</div>`
        : ""
    }</div>`,
  );
}
function userDialog(uid) {
  const u = state.users.find((u) => u.id === uid) || {
    name: "",
    email: "",
    phone: "",
    role: "customer",
    active: 1,
  };
  openDialog(
    `<div class="modalhead"><h2>${uid ? "แก้ไขผู้ใช้งาน" : "เพิ่มผู้ใช้งาน"}</h2>${btn("✕", "close")}</div><form id="user-form"><input type="hidden" name="id" value="${esc(uid || "")}">${field("ชื่อ–นามสกุล", "name", u.name, "text", "required")}${field("อีเมล", "email", u.email, "email", "required")}${field("โทรศัพท์", "phone", u.phone, "tel")}${select("บทบาท", "role", Object.entries(roleName), u.role)}${!uid ? field("รหัสผ่านเริ่มต้น", "password", "", "password", 'required minlength="8"') : ""}<label><input type="checkbox" name="active" ${u.active ? "checked" : ""}>เปิดใช้งานบัญชี</label><button class="primary wide">บันทึกข้อมูล</button><div class="error" id="modal-error" hidden></div></form>`,
  );
}
function promoDialog(code) {
  const p = state.promos.find((p) => p.code === code) || {
    code: "",
    name: "",
    percent: 15,
    start: "2026-11-11",
    end: "2027-12-31",
    min_days: 2,
    active: 1,
  };
  openDialog(
    `<div class="modalhead"><h2>ตั้งค่าโปรโมชัน</h2>${btn("✕", "close")}</div><form id="promo-form">${field("รหัสโปรโมชัน", "code", p.code, "text", 'required pattern="[A-Z0-9_-]{3,30}" ' + (code ? "readonly" : ""))}${field("ชื่อโปรโมชัน", "name", p.name, "text", "required")}<div class="fields">${field("ส่วนลด (%)", "percent", p.percent, "number", 'min="1" max="100" required')}${field("จำนวนวันขั้นต่ำ", "min_days", p.min_days, "number", 'min="1" required')}${field("เริ่มวันที่รับรถ", "start", p.start, "date", "required")}${field("สิ้นสุดวันที่คืนรถ", "end", p.end, "date", "required")}</div><label><input type="checkbox" name="active" ${p.active ? "checked" : ""}>เปิดใช้งาน</label><button class="primary wide">บันทึกโปรโมชัน</button><div class="error" id="modal-error" hidden></div></form>`,
  );
}
function carDialog(cid) {
  const c = state.cars.find((c) => c.id === cid);
  openDialog(
    `<div class="modalhead"><h2>${esc(c.name)}</h2>${btn("✕", "close")}</div><form id="car-form"><input type="hidden" name="id" value="${c.id}">${select(
      "สถานะรถ",
      "status",
      [
        ["available", "พร้อมให้บริการ"],
        ["inspection", "รอตรวจสภาพ"],
        ["maintenance", "ซ่อมบำรุง"],
      ],
      c.status,
    )}${
      state.user.role === "admin"
        ? `${field("อัตราค่าเช่า (บาท/วัน)", "rate", c.rate / 100, "number", 'min="1" step="0.01" required')}${select(
            "สภาพรถ",
            "condition",
            [
              ["excellent", "ดีเยี่ยม"],
              ["good", "ดี"],
              ["fair", "ปานกลาง"],
            ],
            c.condition,
          )}`
        : ""
    }<button class="primary wide">บันทึกข้อมูลรถ</button><div class="error" id="modal-error" hidden></div></form>`,
  );
}
let signatureDirty = false;
function signatureSetup() {
  const canvas = $("#signature");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let down = false;
  signatureDirty = false;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#172339";
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * canvas.width) / r.width,
      ((e.clientY - r.top) * canvas.height) / r.height,
    ];
  };
  canvas.onpointerdown = (e) => {
    down = true;
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(...pos(e));
  };
  canvas.onpointermove = (e) => {
    if (down) {
      ctx.lineTo(...pos(e));
      ctx.stroke();
      signatureDirty = true;
    }
  };
  canvas.onpointerup = canvas.onpointercancel = () => (down = false);
}
function formData(form) {
  return Object.fromEntries(new FormData(form));
}
function fileData(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (
      file.size > 10 * 1024 * 1024 ||
      !["application/pdf", "image/png"].includes(file.type)
    )
      return reject(Error("รองรับ PDF / PNG ขนาดไม่เกิน 10 MB"));
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(Error("อ่านไฟล์ไม่ได้"));
    r.readAsDataURL(file);
  });
}
function showError(e, selector) {
  const el = $(selector);
  if (el) {
    el.textContent = e.message;
    el.hidden = false;
  } else toast(e.message);
}
function csv(name, headers, rows) {
  const cell = (s) => {
    let v = String(s ?? "");
    if (/^[=+@\-\t\r]/.test(v)) v = "'" + v;
    return '"' + v.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    [
      "\uFEFF" +
        [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action,
    id = el.dataset.id;
  try {
    if (
      [
        "home",
        "cars",
        "terms",
        "contact",
        "bookings",
        "newbooking",
        "users",
        "fleet",
        "promos",
        "reports",
        "inspect",
        "inspections",
        "outbox",
      ].includes(action)
    ) {
      if (["bookings", "outbox"].includes(action) && !state.user) return auth();
      return await go(action);
    }
    if (action === "workspace")
      return go(
        { admin: "reports", staff: "newbooking", inspector: "inspect" }[
          state.user.role
        ],
      );
    if (action === "login" || action === "register") return auth(action);
    if (action === "close") return modal.close();
    if (action === "demo-login") {
      const r = el.dataset.role;
      $("#auth-form [name=email]").value = r + "@tim.test";
      $("#auth-form [name=password]").value = "Demo1234!";
      return;
    }
    if (action === "logout") {
      await api("logout", {});
      state.user = null;
      sessionStorage.removeItem("tim-page");
      return go("home");
    }
    if (action === "choose") {
      if (!state.user) return auth();
      if (state.user.role === "inspector")
        return toast("บัญชีตรวจสภาพไม่มีสิทธิ์สร้างการจอง");
      if (state.user.role !== "customer") {
        await go("newbooking");
        $("#booking-form [name=carId]").value = id;
        return;
      }
      const c = state.cars.find((c) => c.id === id);
      openDialog(
        `<div class="modalhead"><h2>ตรวจสอบการเช่า</h2>${btn("✕", "close")}</div><h3>${esc(c.name)}</h3><form id="customer-booking"><input type="hidden" name="carId" value="${id}">${field("รับรถ · เวลาไทย", "start", state.start, "datetime-local", "required")}${field("คืนรถ · เวลาไทย", "end", state.end, "datetime-local", "required")}${field("สถานที่รับ–คืน", "location", state.location, "text", "required")}${field("รหัสส่วนลด (ถ้ามี)", "code")}${btn("ตรวจสอบราคา", "quote-customer", "wide")}<div id="quote-result"></div><button class="primary wide" style="margin-top:20px">ยืนยันรถและช่วงเวลา →</button><div class="error" id="modal-error" hidden></div></form>`,
      );
      return;
    }
    if (action === "quote-booking" || action === "quote-customer") {
      const f =
          action === "quote-booking"
            ? $("#booking-form")
            : $("#customer-booking"),
        b = formData(f);
      b.start = iso(b.start);
      b.end = iso(b.end);
      try {
        $("#quote-result").innerHTML = summary(await api("quote", b));
      } catch (e) {
        $("#quote-result").innerHTML =
          `<div class="error">${esc(e.message)}</div>`;
      }
      return;
    }
    if (action === "checkout") {
      state.selected = id;
      sessionStorage.setItem("tim-selected", id);
      return go("checkout");
    }
    if (action === "edit-booking") {
      const b = state.bookings.find((b) => b.id === id);
      openDialog(
        `<div class="modalhead"><h2>แก้ไขการจอง ${esc(id)}</h2>${btn("✕", "close")}</div><form id="edit-booking-form"><input type="hidden" name="id" value="${esc(id)}">${select(
          "รถ",
          "carId",
          state.cars.map((c) => [c.id, c.name]),
          b.car_id,
        )}${field("รับรถ · เวลาไทย", "start", b.start.slice(0, 16), "datetime-local", "required")}${field("คืนรถ · เวลาไทย", "end", b.end.slice(0, 16), "datetime-local", "required")}${field("สถานที่นัดหมาย", "location", b.location, "text", "required")}${field("รหัสส่วนลด (กรอกใหม่ถ้าต้องการ)", "code")}<p>การแก้ไขจะคำนวณราคาใหม่และให้ลงนามสัญญาใหม่</p><button class="primary wide">บันทึกการจอง</button><div id="modal-error" class="error" hidden></div></form>`,
      );
      return;
    }
    if (action === "clear-signature") {
      const c = $("#signature");
      c.getContext("2d").clearRect(0, 0, c.width, c.height);
      signatureDirty = false;
      return;
    }
    if (action === "confirmation") {
      state.confirmation = await api(`bookings/${id}/confirmation`);
      state.selected = id;
      sessionStorage.setItem("tim-selected", id);
      return go("confirmation");
    }
    if (action === "print") return window.print();
    if (action === "print-contract") {
      window.open(`/api/bookings/${id}/documents/contract.pdf`, "_blank");
      return;
    }
    if (action === "legacy-print-contract") {
      state.confirmation = await api(`bookings/${id}/confirmation`);
      openDialog(
        `<div class="modalhead"><h2>สัญญาเช่ารถ ${esc(id)}</h2>${btn("✕", "close")}</div><p>ลูกค้า ${esc(state.confirmation.customer.name)}<br>รถ ${esc(state.confirmation.car.name)}<br>รับ ${date(state.confirmation.start)}<br>คืน ${date(state.confirmation.end)}<br>สถานที่ ${esc(state.confirmation.location)}<br>ยอดสุทธิ ${money(state.confirmation.total)}</p><p>นำใบขับขี่และบัตรประจำตัวมาแสดง รับคืนรถตามเวลาและสถานที่ที่ระบุ ห้ามให้เช่าช่วง แจ้งความเสียหายทันที และคืนรถในสภาพพร้อมระดับน้ำมันเดิม</p><p>ลงชื่อผู้เช่า __________________________</p><p>เอกสารสำหรับการทดสอบเท่านั้น</p>${btn("พิมพ์ / บันทึก PDF", "print-modal", "primary")}`,
      );
      return;
    }
    if (action === "print-modal") {
      app.innerHTML = `<main class="container"><div class="panel">${modal.innerHTML}</div></main>`;
      modal.close();
      window.print();
      render();
      return;
    }
    if (action === "cancel-booking") {
      openDialog(
        `<h2>ยกเลิกรายการรอชำระ?</h2><p>${esc(id)} · ยกเลิกแล้วรถจะกลับมาให้จองในช่วงเวลานี้</p><div class="actionsrow">${btn("กลับ", "close")}${btn("ยืนยันยกเลิก", "confirm-cancel", "primary", `data-id="${id}"`)}</div>`,
      );
      return;
    }
    if (action === "confirm-cancel") {
      await api(`bookings/${id}/cancel`, {});
      modal.close();
      toast("ยกเลิกรายการแล้ว");
      return go("bookings");
    }
    if (action === "handover" || action === "return") {
      await api(`bookings/${id}/${action}`, {});
      toast(
        action === "handover"
          ? "บันทึกส่งมอบรถแล้ว"
          : "รับคืนรถแล้ว รถอยู่ระหว่างรอตรวจสภาพ",
      );
      return go("bookings");
    }
    if (action === "edit-user") return userDialog(id);
    if (action === "edit-promo") return promoDialog(id);
    if (action === "edit-car") return carDialog(id);
    if (action === "inspect-car") {
      state.inspectCar = id;
      return go("inspect");
    }
    if (action === "export-users")
      return csv(
        "customers.csv",
        ["รหัส", "ชื่อ", "อีเมล", "โทรศัพท์", "บทบาท", "ใช้งาน"],
        state.users.map((u) => [
          u.id,
          u.name,
          u.email,
          u.phone,
          u.role,
          u.active,
        ]),
      );
    if (action === "export-report")
      return csv(
        "booking-report.csv",
        ["หมายเลขจอง", "รถ", "รับรถ", "คืนรถ", "สถานะ", "ยอดสุทธิบาท"],
        state.report.rows.map((b) => [
          b.id,
          b.car_name,
          b.start,
          b.end,
          statusName[b.status],
          (b.total / 100).toFixed(2),
        ]),
      );
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (!(f instanceof HTMLFormElement)) return;
  e.preventDefault();
  const b = formData(f),
    submit = f.querySelector("button:not([type=button])");
  if (submit) submit.disabled = true;
  try {
    if (f.id === "auth-form") {
      if (state.auth === "register") {
        if (b.password !== b.confirm)
          throw Error("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
        await api("register", b);
      }
      state.user = await api("login", b);
      modal.close();
      toast("เข้าสู่ระบบแล้ว");
      await go(
        state.user.role === "customer"
          ? "cars"
          : { admin: "reports", staff: "newbooking", inspector: "inspect" }[
              state.user.role
            ],
      );
    }
    if (f.id === "search-form") {
      if (new Date(b.end) <= new Date(b.start))
        throw Error("วันคืนรถต้องอยู่หลังวันรับรถ");
      state.start = b.start;
      state.end = b.end;
      state.location = b.location;
      state.studySearchDone = true;
      await go("cars");
    }
    if (f.id === "customer-booking" || f.id === "booking-form") {
      b.start = iso(b.start);
      b.end = iso(b.end);
      const r = await api("bookings", b);
      state.start = b.start.slice(0, 16);
      state.end = b.end.slice(0, 16);
      state.selected = r.id;
      sessionStorage.setItem("tim-selected", r.id);
      if (modal.open) modal.close();
      toast("สร้างรายการจองแล้ว กรุณาลงนามสัญญา");
      await go("checkout");
    }
    if (f.id === "contract-form") {
      const document = await fileData($("#contract-file").files[0]);
      const signature = signatureDirty
        ? $("#signature").toDataURL("image/png")
        : null;
      await api(`bookings/${state.selected}/contract`, {
        signature,
        document,
        accepted: !!b.accepted,
      });
      toast("บันทึกสัญญาแล้ว");
      await go("checkout");
    }
    if (f.id === "payment-form") {
      await api(`bookings/${state.selected}/payment`, b);
      state.confirmation = await api(`bookings/${state.selected}/confirmation`);
      toast("จำลองชำระเงินสำเร็จ ใบยืนยันอยู่ในกล่องอีเมลทดสอบ");
      await go("confirmation");
    }
    if (f.id === "user-form") {
      b.active = !!b.active;
      await api("users", b);
      modal.close();
      const me = await api("me");
      state.user = me.user;
      if (!state.user) {
        toast("สิทธิ์บัญชีเปลี่ยน กรุณาเข้าสู่ระบบใหม่");
        await go("home");
      } else {
        toast("บันทึกผู้ใช้แล้ว");
        await go("users");
      }
    }
    if (f.id === "promo-form") {
      b.active = !!b.active;
      await api("promos", b);
      modal.close();
      toast("บันทึกโปรโมชันแล้ว");
      await go("promos");
    }
    if (f.id === "car-form") {
      if (b.rate) b.rate = Math.round(Number(b.rate) * 100);
      await api("cars", b);
      modal.close();
      toast("บันทึกข้อมูลรถแล้ว");
      await go("fleet");
    }
    if (f.id === "edit-booking-form") {
      b.start = iso(b.start);
      b.end = iso(b.end);
      await api(`bookings/${b.id}`, b);
      modal.close();
      toast("แก้ไขรายการจองแล้ว กรุณาลงนามสัญญาใหม่");
      await go("bookings");
    }
    if (f.id === "inspection-form") {
      b.checks = checks.map((_, i) => b["check" + i]);
      const photos = await readInspectionPhotos(f);
      const r = await api("inspections", b);
      if (photos.length)
        await api(`inspections/${r.id}/photos`, { files: photos });
      toast(`บันทึกผลตรวจแล้ว ค่าเสียหาย ${money(r.damage)}`);
      await go("inspections");
    }
    if (f.id === "report-form") {
      state.reportStart = b.start;
      state.reportEnd = b.end;
      await go("reports");
    }
  } catch (err) {
    showError(
      err,
      f.id === "auth-form"
        ? "#auth-error"
        : modal.open
          ? "#modal-error"
          : "#form-error",
    );
  } finally {
    if (submit && submit.isConnected) submit.disabled = false;
  }
});
document.addEventListener("change", (e) => {
  const n = e.target.name;
  if (n === "carType") {
    state.filter = e.target.value;
    render();
  }
  if (n === "carId" && e.target.closest("#inspection-form")) {
    state.inspectCar = e.target.value;
    render();
  }
  if (/^check\d$/.test(n)) {
    const costs = [150000, 200000, 250000, 50000, 100000, 120000, 80000],
      b = formData($("#inspection-form"));
    const damaged = checks
      .map((name, i) => ({
        name,
        cost: costs[i],
        bad: b["check" + i] === "damage",
      }))
      .filter((x) => x.bad);
    $("#damage-result").innerHTML =
      damaged
        .map(
          (x) =>
            `<div class="totals"><span>${x.name}</span><b>${money(x.cost)}</b></div>`,
        )
        .join("") +
      `<div class="total"><b>รวมค่าเสียหาย</b><strong>${money(damaged.reduce((s, x) => s + x.cost, 0))}</strong></div>`;
  }
});
document.addEventListener("input", (e) => {
  if (["carSearch", "userSearch"].includes(e.target.name)) {
    state.search = e.target.value;
    clearTimeout(state.searchTimer);
    const pos = e.target.selectionStart,
      n = e.target.name;
    state.searchTimer = setTimeout(() => {
      render();
      const el = document.querySelector(`[name="${n}"]`);
      el?.focus();
      el?.setSelectionRange(pos, pos);
    }, 250);
  }
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      modal.close();
  }
});
let paymentPoll = null;
function carArt(c, hero = false) {
  const file = hero
    ? "hero"
    : c?.name?.includes("Fortuner")
      ? "fortuner"
      : c?.type === "EV"
        ? "ev"
        : c?.type === "Sedan"
          ? "sedan"
          : "suv";
  return `<img class="vehicle-photo" src="/assets/${file}.png" alt="ภาพประกอบ ${esc(c?.name || "รถเช่าบนเส้นทางท่องเที่ยว")}" ${hero ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
}
function render() {
  clearInterval(paymentPoll);
  paymentPoll = null;
  if (location.pathname === "/pay") {
    renderPayPage();
    return;
  }
  legacyRender();
  if (state.user?.role === "admin" && $(".sidebar nav"))
    $(".sidebar nav").insertAdjacentHTML(
      "beforeend",
      '<a class="button" style="background:#1c344b;color:white;border:0;width:100%;margin-top:8px" href="/evidence">หลักฐานข้อกำหนด</a>',
    );
  renderStudy();
  if (
    state.page === "checkout" &&
    state.gateway?.bookingId === state.selected
  ) {
    paymentPoll = setInterval(async () => {
      try {
        const r = await api(`bookings/${state.selected}/payment-status`);
        if (["confirmed", "active", "completed"].includes(r.status)) {
          clearInterval(paymentPoll);
          state.confirmation = await api(
            `bookings/${state.selected}/confirmation`,
          );
          state.gateway = null;
          toast("รับผลชำระเงินทดสอบแล้ว และส่งอีเมลไปกล่องทดสอบแล้ว");
          await go("confirmation");
        } else if (r.status !== "pending") {
          clearInterval(paymentPoll);
          toast("รายการจองหมดอายุหรือถูกยกเลิก");
          await go("bookings");
        } else {
          const c = $("#payment-countdown");
          if (c)
            c.textContent =
              "เหลือเวลา " +
              Math.max(
                0,
                Math.ceil((state.gateway.expires - Date.now()) / 60000),
              ) +
              " นาที";
        }
      } catch {}
    }, 1500);
  }
}
function checkout() {
  const b = state.bookings.find((x) => x.id === state.selected);
  if (!b) return '<div class="container empty">ไม่พบรายการจอง</div>';
  let html = legacyCheckout();
  const signed = b.signed || b.has_document,
    g = state.gateway?.bookingId === b.id ? state.gateway : null;
  const content = `<form id="gateway-start-form">${
    state.user.role === "customer"
      ? '<input type="hidden" name="method" value="qr">'
      : select(
          "วิธีชำระเงิน",
          "method",
          [
            ["qr", "QR Code"],
            ["cash", "เงินสด"],
            ["card", "บัตรเครดิต"],
          ],
          g?.method || "qr",
        )
  }<div class="payment-demo-label">DEMO PAY · ระบบชำระเงินทดสอบ</div>${g ? `<div class="qrtest"><img src="${g.qr}" alt="QR สำหรับเปิดหน้าชำระเงินทดสอบ" width="240" height="240"><p id="payment-countdown">หมดอายุ ${date(new Date(g.expires))}</p><strong class="price">${money(g.amount)}</strong></div><a class="button primary wide" href="${esc(g.url)}">เปิดหน้าชำระเงินทดสอบ ↗</a><p class="statusnote">เมื่อยืนยันในหน้าทดสอบแล้ว หน้านี้จะอัปเดตอัตโนมัติ QR นี้เปิดหน้าทดสอบในเครื่องที่รันระบบ ไม่ใช่ QR โอนเงินจริง</p>` : ""}<button class="${g ? "" : "primary"} wide" ${signed ? "" : "disabled"}>${g ? "สร้างรายการชำระเงินใหม่" : "สร้าง QR / เปิดชำระเงินทดสอบ"}</button><p class="statusnote">${signed ? "✓ บันทึกสัญญาแล้ว" : "กรุณาบันทึกสัญญาก่อนชำระเงิน"}</p></form>`;
  html = html.replace(/<form id="payment-form">[\s\S]*?<\/form>/, content);
  if (signed)
    html = html.replace(
      "<h2>สัญญาเช่ารถ</h2>",
      `<h2>สัญญาเช่ารถ <span class="badge green">บันทึกแล้ว</span></h2><div class="document-links">${btn("ดาวน์โหลดสัญญา PDF", "download-contract", "", `data-id="${b.id}"`)}${b.has_document ? `<a class="button" href="/api/bookings/${b.id}/original-contract">ไฟล์ที่อัปโหลด</a>` : ""}</div>`,
    );
  return html;
}
async function renderPayPage() {
  const token = new URLSearchParams(location.search).get("token");
  if (!/^[a-f0-9]{48}$/.test(token || "")) {
    app.innerHTML =
      '<main class="container"><h1>ไม่พบรายการชำระเงิน</h1></main>';
    return;
  }
  try {
    const s = await api("demo-pay/" + token);
    state.paySession = s;
    const done = s.status === "success",
      pending = s.status === "pending" && s.expires > Date.now();
    app.innerHTML = `<header class="topnav">${brand()}<span class="badge orange">DEMO PAY · ไม่ใช่ธนาคารจริง</span></header><main class="pay-page"><section class="panel"><div class="successmark">${done ? "✓" : "▣"}</div><h1>${done ? "ชำระเงินทดสอบสำเร็จ" : pending ? "ยืนยันการชำระเงินทดสอบ" : s.status === "failed" ? "การชำระเงินไม่สำเร็จ" : "รายการหมดอายุ"}</h1><p>${esc(s.bookingId)}</p><strong class="pay-amount">${money(s.amount)}</strong><p>${{ qr: "QR Code", cash: "เงินสด", card: "บัตรเครดิต" }[s.method]} · เลขอ้างอิง ${esc(s.id)}</p>${pending ? `<form id="test-payment-form"><input type="hidden" name="token" value="${token}">${s.method === "cash" ? field("จำนวนเงินสดที่รับ (บาท)", "cashReceived", s.amount / 100, "number", 'min="0" step="0.01" required') : s.method === "card" ? field("เลขท้ายบัตรทดสอบ 4 หลัก", "last4", "4242", "text", 'pattern="[0-9]{4}" maxlength="4" required') : ""}<div class="notice">ใช้สำหรับการสาธิตเท่านั้น ไม่ต้องกรอกข้อมูลบัญชี บัตรจริง หรือโอนเงิน</div><button class="primary wide" style="margin-top:20px">ยืนยันชำระเงินทดสอบ</button>${btn("ทดสอบกรณีชำระเงินไม่สำเร็จ", "payment-fail", "wide", `data-token="${token}" style="margin-top:12px"`)}<div id="payment-error" class="error" hidden></div></form>` : `<div class="notice">${done ? "ระบบบันทึกหมายเลขชำระเงินและส่งใบยืนยันพร้อมเอกสารไปยังกล่องอีเมลทดสอบแล้ว" : "กลับสู่การจองเพื่อสร้างรายการชำระเงินใหม่"}</div>`}<a class="button wide" href="/?booking=${s.bookingId}" style="margin-top:20px">กลับสู่การจอง</a></section></main>`;
  } catch (e) {
    app.innerHTML = `<main class="container"><h1>ไม่สามารถเปิดรายการชำระเงิน</h1><p>${esc(e.message)}</p><a href="/">กลับหน้าแรก</a></main>`;
  }
}
function usersView() {
  const users = state.users.filter(
    (u) =>
      !!u.archived === !!state.showArchived &&
      (u.name + u.email + u.id)
        .toLowerCase()
        .includes(state.search.toLowerCase()),
  );
  return `<div class="sectionhead"><div><h1>จัดการลูกค้าและสิทธิ์ผู้ใช้งาน</h1><p>เพิ่ม แก้ไข ลบจากรายการใช้งาน และกู้คืนบัญชี พร้อมรักษาประวัติการจอง</p></div>${btn("＋ เพิ่มผู้ใช้งาน", "edit-user", "primary")}</div><div class="panel"><div class="toolbar">${field("ค้นหาชื่อ อีเมล หรือรหัส", "userSearch", state.search)}${btn(state.showArchived ? "ดูบัญชีใช้งาน" : "ดูบัญชีที่ลบ", "toggle-archives")}${btn("ส่งออก CSV", "export-users")}</div><div class="tablewrap"><table><thead><tr><th>ชื่อ / อีเมล</th><th>รหัส</th><th>โทรศัพท์</th><th>บทบาท</th><th>สถานะ</th><th>ดำเนินการ</th></tr></thead><tbody>${users.map((u) => `<tr><td><strong>${esc(u.name)}</strong>${esc(u.email)}</td><td>${esc(u.id)}</td><td>${esc(u.phone)}</td><td>${roleName[u.role]}</td><td>${badge(u.active ? "ใช้งาน" : u.archived ? "ลบจากรายการแล้ว" : "ระงับบัญชี")}</td><td>${u.archived ? btn("กู้คืนบัญชี", "restore-user", "", `data-id="${u.id}"`) : `${btn("แก้ไข", "edit-user", "", `data-id="${u.id}"`)}${u.id !== state.user.id ? btn("ลบจากรายการ", "archive-user", "", `data-id="${u.id}"`) : ""}`}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">ไม่พบผู้ใช้งาน</td></tr>'}</tbody></table></div><p class="statusnote">รวม ${users.length} รายการ</p></div>`;
}
function fleetView() {
  let h = legacyFleetView();
  if (state.user.role === "admin")
    h = h.replace(
      '<div class="grid3">',
      `${btn("＋ เพิ่มรถ", "create-car", "primary")}<div class="grid3" style="margin-top:24px">`,
    );
  return h;
}
function promosView() {
  return (
    legacyPromosView() +
    `<section class="panel" style="margin-top:24px"><h2>อัตราค่าเช่าตามประเภทรถและสภาพ</h2><p>ปรับราคาในตาราง แล้วเลือกนำราคาไปใช้กับรถทั้งหมด การจองที่สร้างแล้วคงยอดเดิม</p><form id="pricing-form"><div class="tablewrap"><table><thead><tr><th>ประเภทรถ</th><th>ดีเยี่ยม (บาท/วัน)</th><th>ดี (บาท/วัน)</th><th>ปานกลาง (บาท/วัน)</th></tr></thead><tbody>${["SUV", "Sedan", "EV"].map((t) => `<tr><th>${t}</th>${["excellent", "good", "fair"].map((c) => `<td><input aria-label="ราคา ${t} ${c}" type="number" min="1" step="0.01" required name="${t}_${c}" value="${(state.pricing.find((r) => r.type === t && r.condition === c)?.rate || 0) / 100}"></td>`).join("")}</tr>`).join("")}</tbody></table></div><label style="margin-top:20px"><input type="checkbox" name="applyToFleet">นำราคาใหม่ไปใช้กับรถทุกคันตามประเภทและสภาพ</label><button class="primary">บันทึกตารางราคา</button></form></section>`
  );
}
function maintenanceView() {
  return `<div class="sectionhead"><div><h1>บำรุงรักษาและซ่อมรถ</h1><p>นัดหมาย งานซ่อม อู่ที่ติดต่อ และประวัติผลดำเนินการ</p></div>${btn("＋ นัดหมายบำรุงรักษา", "new-maintenance", "primary")}</div><div class="panel tablewrap"><table><thead><tr><th>รายการ / รถ</th><th>วันนัด</th><th>อู่ / รายละเอียด</th><th>ค่าใช้จ่าย</th><th>สถานะ</th><th>ดำเนินการ</th></tr></thead><tbody>${(state.maintenance || []).map((m) => `<tr><td><strong>${esc(m.id)}</strong>${esc(m.car_name)}</td><td>${esc(m.scheduled)}</td><td style="white-space:pre-wrap;min-width:200px">${esc(m.vendor || "ยังไม่ระบุอู่")}<br>${esc(m.notes)}</td><td>${money(m.cost)}</td><td>${badge(m.status === "completed" ? "completed" : "รอดำเนินการ")}</td><td>${m.status !== "completed" ? btn("บันทึกซ่อมเสร็จ", "complete-maintenance", "", `data-id="${m.id}"`) : "ต้องตรวจรถก่อนเปิดเช่า"}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">ยังไม่มีรายการบำรุงรักษา</td></tr>'}</tbody></table></div>`;
}
function auditView() {
  return `<h1>ประวัติการดำเนินการ</h1><p>หลักฐานการชำระเงิน การจัดการข้อมูล และการบำรุงรักษา 200 รายการล่าสุด</p><div class="panel tablewrap"><table><thead><tr><th>เวลา</th><th>ผู้ดำเนินการ</th><th>เหตุการณ์</th><th>รายการอ้างอิง</th><th>รายละเอียด</th></tr></thead><tbody>${(state.audit || []).map((x) => `<tr><td>${date(x.created)}</td><td>${esc(x.actor_name || "ระบบชำระเงินทดสอบ")}</td><td>${esc(x.action)}</td><td>${esc(x.entity)}</td><td>${esc(x.details)}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">ยังไม่มีประวัติ</td></tr>'}</tbody></table></div>`;
}
function inspectionHistory() {
  return legacyInspectionHistory();
}
function readAsData(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(Error("อ่านไฟล์ไม่ได้"));
    r.readAsDataURL(file);
  });
}
async function readInspectionPhotos(form) {
  const files = Array.from(form.querySelector("[name=photos]")?.files || []);
  if (files.length > 5) throw Error("เพิ่มรูปได้ไม่เกิน 5 รูป");
  for (const f of files)
    if (
      !["image/png", "image/jpeg"].includes(f.type) ||
      f.size > 2 * 1024 * 1024
    )
      throw Error("รองรับ PNG/JPEG รูปละไม่เกิน 2 MB");
  return Promise.all(
    files.map(async (f) => ({ name: f.name, data: await readAsData(f) })),
  );
}
function docButtons(b) {
  return `<div class="document-links"><a class="button" href="/api/bookings/${b.id}/documents/contract.pdf" target="_blank">↓ สัญญา PDF</a><a class="button" href="/api/bookings/${b.id}/documents/confirmation.pdf" target="_blank">↓ ใบยืนยัน PDF</a><a class="button" href="/api/bookings/${b.id}/documents/receipt.pdf" target="_blank">↓ ใบเสร็จ PDF</a></div>`;
}
const originalConfirmation = confirmation;
confirmation = function () {
  const b = state.confirmation;
  const paid = b && ["confirmed", "active", "completed"].includes(b.status);
  let html = originalConfirmation();
  if (b && !paid) {
    html = html.replace(
      '<div class="successmark">✓</div>',
      '<div class="successmark" style="background:#fff6e7;color:#ae6e13">!</div>',
    );
    if (b.status !== "pending")
      html = html
        .replace("ยืนยันการจองแล้ว!", esc(statusName[b.status] || b.status))
        .replace(
          "ใบยืนยันถูกบันทึกไว้ในกล่องอีเมลทดสอบของคุณแล้ว",
          "รายการนี้ยกเลิกแล้วหรือหมดอายุ กรุณาสร้างการจองใหม่",
        );
  }
  return html.replace(
    '<div class="actionsrow">',
    `${paid ? docButtons(b) : ""}<div class="actionsrow">`,
  );
};
const originalOutbox = outboxView;
outboxView = function () {
  let html = originalOutbox();
  for (const m of state.outbox)
    html = html.replace(
      btn("ดูใบยืนยัน", "confirmation", "", `data-id="${m.booking_id}"`),
      `${btn("ดูใบยืนยัน", "confirmation", "", `data-id="${m.booking_id}"`)} <a class="button" href="/api/outbox/${m.id}.eml">↓ อีเมลพร้อมไฟล์แนบ (.eml)</a><p class="statusnote">✓ ส่งเข้ากล่องทดสอบแล้ว · เอกสารแนบ 3 ฉบับ</p>`,
    );
  return html;
};
const originalBookingTable = bookingTable;
bookingTable = function () {
  let html = originalBookingTable();
  if (["staff", "admin"].includes(state.user.role))
    for (const b of state.bookings.filter((b) => b.status === "confirmed"))
      html = html.replace(
        btn("ใบยืนยัน", "confirmation", "", `data-id="${b.id}"`),
        btn("ใบยืนยัน", "confirmation", "", `data-id="${b.id}"`) +
          btn(
            "ยกเลิก / คืนเงินทดสอบ",
            "refund-booking",
            "",
            `data-id="${b.id}"`,
          ),
      );
  return html;
};
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action,
    id = el.dataset.id;
  try {
    if (a === "maintenance" || a === "audit") return go(a);
    if (a === "download-contract") {
      window.open(`/api/bookings/${id}/documents/contract.pdf`, "_blank");
      return;
    }
    if (a === "payment-fail") {
      await api("demo-pay/" + el.dataset.token, { outcome: "failed" });
      return renderPayPage();
    }
    if (a === "toggle-archives") {
      state.showArchived = !state.showArchived;
      render();
      return;
    }
    if (a === "archive-user") {
      openDialog(
        `<h2>ลบบัญชีออกจากรายการใช้งาน?</h2><p>บัญชี ${esc(id)} จะเข้าสู่ระบบไม่ได้ เก็บประวัติการจองไว้และกู้คืนบัญชีได้</p><div class="actionsrow">${btn("กลับ", "close")}${btn("ยืนยันลบจากรายการ", "confirm-archive-user", "primary", `data-id="${id}"`)}</div>`,
      );
      return;
    }
    if (a === "confirm-archive-user" || a === "restore-user") {
      await api(
        `users/${id}/${a === "restore-user" ? "restore" : "archive"}`,
        {},
      );
      if (modal.open) modal.close();
      toast(
        a === "restore-user" ? "กู้คืนบัญชีแล้ว" : "ลบบัญชีออกจากรายการแล้ว",
      );
      return go("users");
    }
    if (a === "create-car") {
      openDialog(
        `<div class="modalhead"><h2>เพิ่มรถใหม่</h2>${btn("✕", "close")}</div><form id="create-car-form">${field("รหัสรถ", "id", "", "text", 'required pattern="[A-Z0-9-]{3,30}" placeholder="CAR-005"')}${field("ยี่ห้อและรุ่น", "name", "", "text", "required")}${select(
          "ประเภท",
          "type",
          [
            ["SUV", "SUV"],
            ["Sedan", "ซีดาน"],
            ["EV", "รถไฟฟ้า"],
          ],
        )}${field("ค่าเช่า (บาท/วัน)", "rate", 1200, "number", 'min="1" step="0.01" required')}${select(
          "สภาพรถ",
          "condition",
          [
            ["excellent", "ดีเยี่ยม"],
            ["good", "ดี"],
            ["fair", "ปานกลาง"],
          ],
        )}<p>รถใหม่เริ่มต้นในสถานะรอตรวจสภาพ</p><button class="primary wide">เพิ่มรถ</button><div id="modal-error" class="error" hidden></div></form>`,
      );
      return;
    }
    if (a === "new-maintenance") {
      openDialog(
        `<div class="modalhead"><h2>นัดหมายบำรุงรักษา</h2>${btn("✕", "close")}</div><form id="maintenance-form">${select(
          "รถ",
          "carId",
          state.cars.map((c) => [c.id, c.name]),
        )}${field("วันนัดหมาย", "scheduled", new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }), "date", "required")}${field("อู่ / ผู้ติดต่อ", "vendor")}${field("ค่าใช้จ่ายประมาณการ (บาท)", "cost", 0, "number", 'min="0" step="0.01" required')}<label>รายละเอียด<textarea name="notes" required></textarea></label><button class="primary wide">บันทึกนัดหมาย</button><div id="modal-error" class="error" hidden></div></form>`,
      );
      return;
    }
    if (a === "complete-maintenance") {
      openDialog(
        `<div class="modalhead"><h2>บันทึกงานซ่อมเสร็จ</h2>${btn("✕", "close")}</div><form id="complete-maintenance-form"><input type="hidden" name="id" value="${esc(id)}"><label>ผลการซ่อม<textarea name="notes" required></textarea></label><p>รถจะอยู่ในสถานะรอตรวจ ต้องบันทึกผลตรวจผ่านก่อนเปิดให้เช่า</p><button class="primary wide">บันทึกผล</button><div id="modal-error" class="error" hidden></div></form>`,
      );
      return;
    }
    if (a === "inspection-detail") {
      const item = state.inspections.find((i) => i.id === id),
        photos = await api(`inspections/${id}/photos`),
        results = JSON.parse(item.checks);
      openDialog(
        `<div class="modalhead"><h2>ผลตรวจ ${esc(item.car_name)}</h2>${btn("✕", "close")}</div><p>${esc(item.date)} · ค่าเสียหาย ${money(item.damage)}</p>${checks.map((label, i) => `<div class="totals"><span>${label}</span><b>${results[i] === "pass" ? "✓ ผ่าน" : "✕ บกพร่อง"}</b></div>`).join("")}<p>${esc(item.notes)}</p><div class="photo-grid">${photos.map((p) => `<a href="/api/inspections/${id}/photos/${p.id}" target="_blank"><img src="/api/inspections/${id}/photos/${p.id}" alt="${esc(p.name)}"></a>`).join("") || "<p>ไม่ได้แนบรูป</p>"}</div>`,
      );
      return;
    }
    if (a === "refund-booking") {
      openDialog(
        `<h2>ยกเลิกและคืนเงินทดสอบ</h2><p>${esc(id)}</p><form id="refund-form"><input type="hidden" name="id" value="${esc(id)}"><label>เหตุผล<textarea name="reason" required></textarea></label><p>ยกเลิกรายการและบันทึกคืนเงินในระบบทดสอบ ไม่มีการโอนเงินจริง</p><button class="primary wide">ยืนยันยกเลิกและคืนเงินทดสอบ</button><div id="modal-error" class="error" hidden></div></form>`,
      );
      return;
    }
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener("submit", async (e) => {
  const f = e.target,
    b = f instanceof HTMLFormElement ? formData(f) : null;
  if (
    !b ||
    ![
      "gateway-start-form",
      "test-payment-form",
      "pricing-form",
      "create-car-form",
      "maintenance-form",
      "complete-maintenance-form",
      "refund-form",
    ].includes(f.id)
  )
    return;
  e.preventDefault();
  const button = f.querySelector("button:not([type=button])");
  button.disabled = true;
  try {
    if (f.id === "gateway-start-form") {
      const r = await api(`bookings/${state.selected}/payment-session`, b);
      state.gateway = { ...r, bookingId: state.selected };
      render();
    }
    if (f.id === "test-payment-form") {
      await api("demo-pay/" + b.token, {
        outcome: "success",
        cashReceived: b.cashReceived
          ? Math.round(+b.cashReceived * 100)
          : undefined,
        last4: b.last4,
      });
      renderPayPage();
    }
    if (f.id === "pricing-form") {
      const rules = [];
      for (const type of ["SUV", "Sedan", "EV"])
        for (const condition of ["excellent", "good", "fair"])
          rules.push({
            type,
            condition,
            rate: Math.round(+b[type + "_" + condition] * 100),
          });
      await api("pricing", { rules, applyToFleet: !!b.applyToFleet });
      toast("บันทึกตารางราคาแล้ว");
      await go("promos");
    }
    if (f.id === "create-car-form") {
      b.rate = Math.round(+b.rate * 100);
      await api("cars/create", b);
      modal.close();
      toast("เพิ่มรถแล้ว");
      await go("fleet");
    }
    if (f.id === "maintenance-form") {
      b.cost = Math.round(+b.cost * 100);
      await api("maintenance", b);
      modal.close();
      toast("บันทึกนัดหมายแล้ว");
      await go("maintenance");
    }
    if (f.id === "complete-maintenance-form") {
      await api(`maintenance/${b.id}/complete`, b);
      modal.close();
      toast("บันทึกซ่อมเสร็จแล้ว กรุณาตรวจรถก่อนเปิดเช่า");
      await go("maintenance");
    }
    if (f.id === "refund-form") {
      await api(`bookings/${b.id}/cancel`, b);
      modal.close();
      toast("ยกเลิกและบันทึกคืนเงินทดสอบแล้ว");
      await go("bookings");
    }
  } catch (err) {
    showError(
      err,
      f.id === "test-payment-form"
        ? "#payment-error"
        : modal.open
          ? "#modal-error"
          : "#form-error",
    );
  } finally {
    if (button.isConnected) button.disabled = false;
  }
});

let studyTimer = null;
function renderStudy() {
  if (!state.study) return;
  const s = state.study,
    banner = document.createElement("section");
  banner.className = "notice";
  banner.style.cssText = "margin:16px auto;max-width:1100px;padding:20px";
  banner.innerHTML = `<b>ทดสอบผู้ใช้ใหม่ · โจทย์ค้นหารถ SUV ที่ว่าง</b><p>รับรถ ${date(iso(s.start))} คืนรถ ${date(iso(s.end))} แล้วเลือกแสดงเฉพาะรถ SUV</p><b id="study-clock"></b><p id="study-result">จับเวลาอยู่ เป้าหมายไม่เกิน 5 นาที ไม่ต้องสร้างการจอง</p>`;
  app.prepend(banner);
  const update = () => {
    const clock = $("#study-clock");
    if (clock)
      clock.textContent =
        "ใช้เวลา " +
        Math.floor((s.elapsedMs ?? Date.now() - s.started) / 1000) +
        " วินาที";
  };
  update();
  if (!studyTimer && !s.finished) studyTimer = setInterval(update, 1000);
  if (s.finished) {
    clearInterval(studyTimer);
    studyTimer = null;
    $("#study-result").textContent = s.passed
      ? "ค้นหาสำเร็จภายใน 5 นาที บันทึกผลแล้ว"
      : "ค้นหาสำเร็จ แต่เกิน 5 นาที บันทึกผลตามจริงแล้ว";
  }
  if (
    !s.finished &&
    !state.studySubmitting &&
    state.studySearchDone &&
    state.page === "cars" &&
    state.filter === "SUV" &&
    state.start === s.start &&
    state.end === s.end
  ) {
    state.studySubmitting = true;
    api(`usability/${s.token}/finish`, {
      start: state.start,
      end: state.end,
      type: "SUV",
    })
      .then((r) => {
        Object.assign(s, r, { finished: true });
        renderStudyResult();
      })
      .catch((e) => toast(e.message))
      .finally(() => (state.studySubmitting = false));
  }
}
function renderStudyResult() {
  clearInterval(studyTimer);
  studyTimer = null;
  const s = state.study;
  if ($("#study-clock"))
    $("#study-clock").textContent =
      "ใช้เวลา " + Math.floor(s.elapsedMs / 1000) + " วินาที";
  if ($("#study-result"))
    $("#study-result").textContent = s.passed
      ? "ค้นหาสำเร็จภายใน 5 นาที บันทึกผลแล้ว"
      : "ค้นหาสำเร็จ แต่เกิน 5 นาที บันทึกผลตามจริงแล้ว";
}
try {
  state.user = (await api("me")).user;
  const saved = sessionStorage.getItem("tim-page");
  if (saved && state.user && !["confirmation", "checkout"].includes(saved))
    state.page = saved;
  state.selected = sessionStorage.getItem("tim-selected");
  if (saved === "checkout" && state.selected && state.user)
    state.page = "checkout";
  const study = new URLSearchParams(location.search).get("study");
  if (study) {
    state.study = await api("usability/" + study);
    state.page = "home";
  }
  await load();
  const resumed = state.bookings.find((b) => b.id === state.selected);
  if (state.user && resumed && ["checkout", "confirmation"].includes(saved)) {
    if (["confirmed", "active", "completed"].includes(resumed.status)) {
      state.confirmation = await api(
        "bookings/" + resumed.id + "/confirmation",
      );
      state.page = "confirmation";
    } else if (resumed.status !== "pending") state.page = "bookings";
  }
  const returned = new URLSearchParams(location.search).get("booking");
  if (returned && state.user) {
    state.confirmation = await api("bookings/" + returned + "/confirmation");
    state.selected = returned;
    sessionStorage.setItem("tim-selected", returned);
    sessionStorage.setItem("tim-page", "confirmation");
    state.page = "confirmation";
    history.replaceState({}, "", "/");
  }
  render();
} catch (e) {
  app.innerHTML = `<div class="container"><h1>ไม่สามารถเชื่อมต่อระบบ</h1><p>${esc(e.message)}</p><p>กรุณาตรวจสอบว่าเซิร์ฟเวอร์กำลังทำงาน</p></div>`;
}
