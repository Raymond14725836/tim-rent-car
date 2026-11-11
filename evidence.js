const esc = (s) =>
  String(s ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
try {
  const r = await fetch("/api/evidence"),
    d = await r.json();
  if (!r.ok) throw Error(d.error + " · กรุณาเข้าสู่ระบบ admin จากหน้าแรกก่อน");
  const load = d.loadTest;
  document.querySelector("#evidence").innerHTML =
    `<section class="panel"><h2>100 ผู้ใช้เสมือนและเวลาตอบสนอง</h2><p>${load ? `${load.completedJourneys}/100 ทำงานครบขั้นตอน · ${load.overall.within3SecondsPercent}% ตอบใน 3 วินาที · P95 ${load.overall.p95Ms} ms · HTTPS ${load.protocols.map((x) => esc(x.negotiated)).join(", ")}` : "ยังไม่มีผลทดสอบ"}</p></section><section class="panel"><h2>ผู้ใช้ใหม่ค้นหารถภายใน 5 นาที</h2><p>${d.humanUsabilityStatus === "awaiting-human-trial" ? "ยังรอผู้ใช้ใหม่ทำแบบทดสอบจริง" : esc(d.humanUsabilityStatus)}</p><pre style="white-space:pre-wrap">${esc(JSON.stringify(d.humanTrials, null, 2))}</pre></section><section class="panel"><h2>ความพร้อมใช้งานรายเดือน 99%</h2><p>ยังยืนยันผลรายเดือนไม่ได้ ข้อมูลด้านล่างเป็นช่วงที่สังเกตจริง ไม่ใช้แทนผลครบเดือน</p><pre style="white-space:pre-wrap">${esc(JSON.stringify(d.availability, null, 2))}</pre></section><section class="panel"><h2>ทดสอบกู้กลับเมื่อโปรแกรมล้ม</h2><pre style="white-space:pre-wrap">${esc(JSON.stringify(d.recoveryTest, null, 2))}</pre></section><section class="panel"><h2>สำรองและกู้คืน</h2><pre style="white-space:pre-wrap">${esc(JSON.stringify(d.backup, null, 2))}</pre></section>`;
  document.querySelector("#download").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }),
    );
    a.download = "requirements-evidence.json";
    a.click();
  };
} catch (e) {
  document.querySelector("#evidence").textContent = e.message;
  document.querySelector("#download").disabled = true;
}
