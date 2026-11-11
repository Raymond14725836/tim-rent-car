# เปิดจากมือถือผ่านอินเทอร์เน็ต

ใช้ Cloudflare Quick Tunnel ส่งต่อเฉพาะระบบสาธิตผ่าน HTTPS ไม่เปิดพอร์ตราวเตอร์หรือปิด Firewall โดย Cloudflare จะจัดการการยืนยันอีเมลด้วย PIN ก่อนเข้าระบบ

## เปิดบนเครื่องที่ตั้งค่าแล้ว

1. ดับเบิลคลิก `Start-Internet-Demo.cmd` แล้วเปิดลิงก์ HTTPS ที่แสดง
2. บนมือถือปิด Wi-Fi เพื่อทดลองผ่าน 4G/5G เปิดลิงก์ แล้วใช้อีเมลที่อนุญาตเพื่อรับ PIN
3. หลังผ่านหน้า Cloudflare จึงเข้าสู่ระบบด้วยบัญชีสาธิตตาม README
4. ปิดด้วย `Stop-Internet-Demo.cmd` หรือ Ctrl+C ในหน้าต่างที่เริ่มระบบ คอมต้องเปิดและไม่พักเครื่องระหว่างใช้งาน

ลิงก์เปลี่ยนทุกครั้งที่เริ่ม tunnel ใหม่ ดูลิงก์ปัจจุบันได้จาก `data/internet-share-status.json` ไม่รับประกัน uptime จึงใช้สำหรับสาธิต ไม่ใช่หลักฐาน uptime 99% รายเดือน

## การตั้งค่าเครื่องใหม่

ติดตั้ง Node.js 24 ขึ้นไปและรัน `npm.cmd ci` ดาวน์โหลด `cloudflared-windows-amd64.exe` จาก [Cloudflare ทางการ](https://developers.cloudflare.com/tunnel/downloads/) เปลี่ยนชื่อเป็น `cloudflared.exe` เก็บใน `data/tools/` และสร้าง `data/internet-share-settings.json` เช่น:

```json
{"allowedMail":"your-email@example.com"}
```

อนุญาตเพื่อนเพิ่มโดยใส่อีเมลคั่นด้วย comma แล้วหยุดและเปิดใหม่ โปรแกรมไม่เปิด tunnel หากไม่กำหนดอีเมล อย่าใช้อีเมล wildcard สำหรับการสาธิตนี้

ข้อมูลของชุดอินเทอร์เน็ตเก็บแยกใน `data/internet-demo` ไม่ใช่ฐานข้อมูลเดิมที่พอร์ต 3003 และไม่ได้อัปโหลดฐานข้อมูลหรือการตั้งค่าอีเมลขึ้น GitHub คุกกี้เข้าสู่ระบบเป็น Secure และ URL ใน QR ใช้ลิงก์ HTTPS ปัจจุบัน

Cloudflare เป็นตัวกลางรับส่งข้อมูลระหว่างผู้ใช้กับเครื่องนี้ ใช้ข้อมูลตัวอย่างและการชำระเงินทดสอบเท่านั้น รายละเอียดบริการ: [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
