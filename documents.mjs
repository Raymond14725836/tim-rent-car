import PDFDocument from "pdfkit";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const amount = (n) =>
  "฿ " +
  (n / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const when = (s) =>
  new Date(s).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
export async function rentalPdf({
  kind,
  booking: b,
  customer: u,
  car: c,
  payment: p,
}) {
  const titles = {
    contract: "สัญญาเช่ารถ",
    confirmation: "ใบยืนยันการจอง",
    receipt: "ใบเสร็จรับเงินทดสอบ",
  };
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: {
      Title: `Tim Rent Car ${titles[kind]} ${b.id}`,
      Author: "Tim Rent Car",
      Subject: "เอกสารสำหรับโครงการเพื่อการศึกษา",
    },
  });
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    doc.on("data", (d) => chunks.push(d));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.font(join(root, "public/fonts/NotoSansThai.ttf"));
  doc.fontSize(23).fillColor("#111a2d").text("Tim Rent Car", 48, 44);
  doc
    .fontSize(10)
    .fillColor("#64748b")
    .text("ศาลายา นครปฐม · โครงการเพื่อการศึกษา", 48, 80);
  doc.fontSize(20).fillColor("#111a2d").text(titles[kind], 48, 119);
  doc
    .fontSize(10)
    .fillColor("#64748b")
    .text(`เลขที่ ${kind === "receipt" ? "RCT-" : ""}${b.id}`, 48, 153);
  doc.moveTo(48, 181).lineTo(547, 181).strokeColor("#dfe6ef").stroke();
  let y = 200;
  const row = (label, value) => {
    doc.fontSize(10).fillColor("#64748b").text(label, 48, y, { width: 130 });
    doc.fillColor("#111a2d").text(String(value ?? "—"), 186, y, { width: 360 });
    y = Math.max(y + 28, doc.y + 8);
  };
  row("ผู้เช่า", u.name);
  row("อีเมล", u.email);
  row("หมายเลขโทรศัพท์", u.phone);
  row("รถที่เช่า", `${c.name} (${c.id})`);
  row("วันเวลารับรถ", when(b.start));
  row("วันเวลาคืนรถ", when(b.end));
  row("สถานที่รับ–คืนรถ", b.location);
  doc
    .moveTo(48, y + 3)
    .lineTo(547, y + 3)
    .strokeColor("#dfe6ef")
    .stroke();
  y += 21;
  row(`ค่าเช่า ${b.days} วัน`, amount(b.base));
  row("ส่วนลด", `− ${amount(b.discount)}`);
  row("ภาษีมูลค่าเพิ่ม 7%", amount(b.tax));
  doc.fontSize(14).fillColor("#111a2d").text("ยอดสุทธิ", 48, y);
  doc
    .fillColor("#2560ee")
    .text(amount(b.total), 350, y, { width: 197, align: "right" });
  y += 40;
  if (kind === "contract") {
    doc.fontSize(10).fillColor("#111a2d").text("เงื่อนไขและข้อตกลง", 48, y);
    y += 24;
    doc
      .fontSize(9)
      .fillColor("#475569")
      .text(
        "ผู้เช่าต้องแสดงใบขับขี่และบัตรประจำตัวที่ยังไม่หมดอายุ ใช้รถตามกฎหมาย ห้ามให้เช่าช่วง รับและคืนรถตามสถานที่และเวลาที่ระบุ คืนรถพร้อมระดับน้ำมันและสภาพเดิม แจ้งความเสียหายหรืออุบัติเหตุทันที ค่าเสียหายคำนวณจากผลตรวจสภาพรถ ประกันภัยเป็นไปตามเงื่อนไขที่ตกลงก่อนส่งมอบ",
        { width: 499, lineGap: 3 },
      );
    y = doc.y + 15;
    if (b.signature?.startsWith("data:image/png;base64,")) {
      doc.fontSize(9).text("ลายเซ็นผู้เช่าที่บันทึกในระบบ", 48, y);
      try {
        doc.image(
          Buffer.from(b.signature.split(",")[1], "base64"),
          48,
          y + 21,
          { fit: [240, 72] },
        );
      } catch {
        doc.text("ลายเซ็นไม่สามารถแสดงได้", 48, y + 22);
      }
      y += 100;
    } else
      doc
        .fontSize(9)
        .text(
          b.document
            ? "ผู้เช่าได้อัปโหลดสัญญาที่ลงนามแล้ว (ดาวน์โหลดต้นฉบับจากระบบ)"
            : "ลงชื่อผู้เช่า _______________________________",
          48,
          y,
        );
  } else {
    row(
      "สถานะ",
      p
        ? "ชำระเงินทดสอบสำเร็จ"
        : b.status === "pending"
          ? "รอชำระเงิน"
          : "ยืนยันการจอง",
    );
    if (p) {
      row(
        "วิธีชำระเงิน",
        { qr: "QR Code ทดสอบ", cash: "เงินสดทดสอบ", card: "บัตรเครดิตทดสอบ" }[
          p.method
        ],
      );
      row("เลขอ้างอิงการชำระ", p.id);
    }
    doc
      .fontSize(9)
      .fillColor("#475569")
      .text(
        "กรุณานำใบขับขี่ บัตรประจำตัว และเอกสารยืนยันมาแสดงที่จุดรับรถ",
        48,
        y + 4,
        { width: 499, lineGap: 3 },
      );
  }
  doc
    .fontSize(8)
    .fillColor("#64748b")
    .text(
      "เอกสารสำหรับส่งและสาธิตโครงการ ไม่มีการเรียกเก็บเงินจริง และไม่ใช่ใบกำกับภาษี",
      48,
      771,
      { width: 499, align: "center" },
    );
  doc.end();
  return result;
}
export function emailMessage({ message, attachments }) {
  const boundary = "tim-rent-" + message.id;
  const lines = [
    `From: Tim Rent Car <no-reply@tim.test>`,
    `To: ${String(message.recipient).replace(/[\r\n]/g, "")}`,
    `Subject: =?UTF-8?B?${Buffer.from(message.subject).toString("base64")}?=`,
    `Date: ${new Date(message.created).toUTCString()}`,
    `Message-ID: <${message.id}@tim.test>`,
    "MIME-Version: 1.0",
    "X-Tim-Rent-Mode: academic-demo",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(message.body)
      .toString("base64")
      .match(/.{1,76}/g)
      .join("\r\n"),
  ];
  for (const a of attachments)
    lines.push(
      `--${boundary}`,
      `Content-Type: application/pdf; name="${a.name}"`,
      `Content-Disposition: attachment; filename="${a.name}"`,
      "Content-Transfer-Encoding: base64",
      "",
      a.data
        .toString("base64")
        .match(/.{1,76}/g)
        .join("\r\n"),
    );
  lines.push(`--${boundary}--`, "");
  return Buffer.from(lines.join("\r\n"));
}
