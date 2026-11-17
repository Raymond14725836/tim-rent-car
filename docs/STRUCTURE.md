# แผนผังไฟล์โครงการ

เริ่มอ่านภาพรวมและบทบาทของผู้จัดทำที่ [README](../README.md)

| โฟลเดอร์ | เนื้อหา |
| --- | --- |
| `src/` | โค้ดเซิร์ฟเวอร์ กฎธุรกิจ เอกสาร PDF และหน้าหลักฐาน |
| `public/` | หน้าเว็บ CSS JavaScript ภาพ และฟอนต์ |
| `scripts/` | เครื่องมือเปิดระบบ สำรองข้อมูล ตรวจสถานะ HTTPS และทดสอบโหลด |
| `launchers/windows/` | ไฟล์ .cmd สำหรับเปิดและหยุดโปรแกรมบน Windows |
| `tests/` | โค้ดทดสอบระบบ |
| `verification/` | ผลทดสอบและหลักฐานที่บันทึกไว้ |
| `docs/guides/` | คู่มือสาธิต ข้อกำหนด HTTPS และข้อจำกัด |
| `docs/reports/` | รายงาน Portfolio แบบ PDF และ Markdown |
| `docs/examples/` | ตัวอย่าง PDF และอีเมลที่ระบบสร้าง |
| `data/` | ข้อมูลระหว่างใช้งานและไฟล์สำรอง สร้างเมื่อเปิดระบบและไม่เผยแพร่บน GitHub |

## ตำแหน่งไฟล์ที่เปลี่ยน

เอกสาร PDF เดิมอาจแสดงชื่อโฟลเดอร์เก่าในเนื้อหา ตารางนี้แสดงตำแหน่งปัจจุบัน โดยลิงก์ใน PDF ได้ปรับให้ชี้ไปยังตำแหน่งใหม่แล้ว

| ตำแหน่งเดิม | ตำแหน่งปัจจุบัน |
| --- | --- |
| `ACCEPTANCE-PLAN.md` | `docs/guides/ACCEPTANCE-PLAN.md` |
| `ASSETS.md` | `docs/guides/ASSETS.md` |
| `DEMO-GUIDE.md` | `docs/guides/DEMO-GUIDE.md` |
| `HTTPS-LOCAL.md` | `docs/guides/HTTPS-LOCAL.md` |
| `INTERNET-DEMO.md` | `docs/guides/INTERNET-DEMO.md` |
| `REQUIREMENTS.md` | `docs/guides/REQUIREMENTS.md` |
| `SUBMISSION-STATUS.md` | `docs/guides/SUBMISSION-STATUS.md` |
| `Start-HTTPS-Test.cmd` | `launchers/windows/Start-HTTPS-Test.cmd` |
| `Start-Internet-Demo.cmd` | `launchers/windows/Start-Internet-Demo.cmd` |
| `Start-Tim-Rent-Car.cmd` | `launchers/windows/Start-Tim-Rent-Car.cmd` |
| `Stop-Internet-Demo.cmd` | `launchers/windows/Stop-Internet-Demo.cmd` |
| `availability.mjs` | `src/availability.mjs` |
| `backup.mjs` | `scripts/backup.mjs` |
| `docs/PORTFOLIO-REPORT.md` | `docs/reports/PORTFOLIO-REPORT.md` |
| `docs/portfolio-report-th.pdf` | `docs/reports/portfolio-report-th.pdf` |
| `documents.mjs` | `src/documents.mjs` |
| `evidence.mjs` | `src/evidence.mjs` |
| `examples/` | `docs/examples/` |
| `features.mjs` | `src/features.mjs` |
| `launch.mjs` | `scripts/launch.mjs` |
| `server.mjs` | `src/server.mjs` |
| `supervisor.mjs` | `scripts/supervisor.mjs` |

## รายการไฟล์ทั้งหมด

รายการนี้ไม่รวม node_modules ข้อมูลระหว่างใช้งาน และไฟล์ส่วนตัว

```text
docs/
  examples/
    confirmation-email.eml
    confirmation.pdf
    contract.pdf
    receipt.pdf
  guides/
    ACCEPTANCE-PLAN.md
    ASSETS.md
    DEMO-GUIDE.md
    HTTPS-LOCAL.md
    INTERNET-DEMO.md
    REQUIREMENTS.md
    SUBMISSION-STATUS.md
  reports/
    portfolio-report-th.pdf
    PORTFOLIO-REPORT.md
  Project-Software (1).pdf
  STRUCTURE.md
launchers/
  windows/
    Start-HTTPS-Test.cmd
    Start-Internet-Demo.cmd
    Start-Tim-Rent-Car.cmd
    Stop-Internet-Demo.cmd
public/
  assets/
    ev.png
    fortuner.png
    hero.png
    sedan.png
    suv.png
  fonts/
    NotoSansThai.ttf
    OFL.txt
  app.js
  evidence.html
  evidence.js
  index.html
  style.css
  usability.html
  usability.js
scripts/
  backup.mjs
  benchmark.mjs
  internet-share.mjs
  launch.mjs
  load-journeys.mjs
  local-tls.mjs
  share-gate.mjs
  supervisor.mjs
  test-recovery.mjs
src/
  availability.mjs
  documents.mjs
  evidence.mjs
  features.mjs
  server.mjs
tests/
  share-gate.test.mjs
  system.test.mjs
verification/
  backup.json
  car-layout.json
  internet-share.json
  load-100-journeys-initial.json
  load-100-journeys.json
  load-request-samples.json
  performance.json
  recovery-test.json
  tests.txt
.gitignore
package-lock.json
package.json
README.md
```
