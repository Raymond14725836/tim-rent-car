# ภาพและฟอนต์

ภาพสร้างด้วย built-in image_gen และบันทึกในโปรเจกต์ ไม่ใช่ภาพถ่ายรถจริงหรือไฟล์จาก Figma ใช้ประกอบโครงการเพื่อการศึกษา รายละเอียดอาจต่างจากรถจริง

| ไฟล์ | การใช้งาน |
| --- | --- |
| public/assets/hero.png | รถสีเงินบนถนนชายฝั่ง |
| public/assets/suv.png | ภาพประกอบ Toyota Yaris Cross |
| public/assets/sedan.png | ภาพประกอบ Honda Civic |
| public/assets/ev.png | ภาพประกอบ BYD Dolphin |
| public/assets/fortuner.png | ภาพประกอบ Toyota Fortuner |

## พรอมป์ต์ภาพหลัก

Use case: photorealistic-natural. Asset type: car rental website hero photo. Wide landscape photograph 1536x1024. A clean silver compact crossover SUV similar in silhouette to a Toyota Yaris Cross, parked on a quiet coastal road in southern Thailand. Front three-quarter view, full vehicle visible, right-hand drive, no readable registration, turquoise Andaman sea and distant limestone islands on left, palms and a curved road on right. Soft natural morning sunlight, muted refined blue-green and warm stone palette, realistic commercial travel photography. No people, no text, no watermark, no graphic UI. Car is in lower right center, beautiful scenery above, vehicle occupies about half width. This is a vehicle rental university project illustration.

## พรอมป์ต์รถ 3 แบบ

ใช้แยก 3 ครั้ง แทน subject เป็น white Toyota Yaris Cross compact crossover SUV, dark graphite Honda Civic sedan และ pale blue BYD Dolphin electric hatchback ตามลำดับ

Use case: product-mockup. Asset type: university car-rental website vehicle catalog photo. A photorealistic {subject}, full vehicle visible, front three-quarter view from driver side, centered with generous breathing room. Parked on light warm gray concrete ground against a minimalist beige architectural wall with faint tree shadows. Natural soft daylight, sophisticated realistic automotive photography, 1536x1024 landscape. No people, no text, no watermarks, no readable license plate. Vehicle wheels fully visible, neutral consistent catalog styling.

## พรอมป์ต์ Fortuner

Use case: product-mockup. Car rental vehicle catalog photo. A white Toyota Fortuner seven-seat large SUV, current classic Fortuner shape, tall rugged body, full vehicle visible centered front three-quarter view with generous breathing room. Light warm gray concrete ground, minimalist beige architectural wall with subtle tree shadows, soft daylight. Photorealistic consistent commercial automotive photography, landscape 1536x1024. No people, no text, no watermark, no readable plate.

## ฟอนต์และไลบรารี

Noto Sans Thai อยู่ใน public/fonts/NotoSansThai.ttf พร้อม OFL.txt จาก [Google Fonts](https://github.com/google/fonts/tree/main/ofl/notosansthai) ใช้กับหน้าเว็บและ PDF แบบออฟไลน์

QR ใช้ [node-qrcode](https://github.com/tehnorm/node-qrcode) และ PDF ใช้ [PDFKit](https://pdfkit.org/) รุ่นแพ็กเกจล็อกไว้ใน package-lock.json
