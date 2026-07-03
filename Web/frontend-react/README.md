# หน้าเว็บ (React + Vite) — ธีม Glassmorphism

หน้าเว็บหลักของโปรเจกต์ (ถอดเสียง + หน้า admin) เขียนด้วย React ธีมกระจก
สลับสว่าง/มืดอัตโนมัติตามระบบ ใช้ **backend FastAPI ตัวเดิม** — เรียก `POST /transcribe`
แล้วอ่าน `{text, unreliable, ...}` โดยตรง (เวอร์ชัน vanilla เดิมถูกถอดออกแล้ว)

## รันตอนพัฒนา (dev)

ต้องเปิด **2 อย่างพร้อมกัน**:

1. **Backend** (โมเดล) — ที่โฟลเดอร์ `Web/server/` ดับเบิลคลิก `run.bat` (เปิดที่ `http://127.0.0.1:8000`)
2. **React dev server** — ที่โฟลเดอร์นี้:

   ```bash
   npm install      # ครั้งแรกครั้งเดียว
   npm run dev
   ```

   เปิด `http://localhost:5173`

Vite ถูกตั้ง proxy ให้แล้ว (ดู `vite.config.js`) — request ที่ยิงไป `/transcribe` จะถูกส่งต่อ
ไปที่ backend `:8000` อัตโนมัติ จึงไม่ต้องพึ่ง CORS และเรียก path สัมพัทธ์ได้เหมือน prod

## build ไป production

วิธีง่ายสุด: **ดับเบิลคลิก `Web/server/run.bat`** — มันจะ `npm install` (ครั้งแรก) + `npm run build`
ให้อัตโนมัติก่อนเปิดเซิร์ฟเวอร์ แล้ว `app.py` เสิร์ฟ `frontend-react/dist/` เป็นหน้าเว็บจริง

หรือ build เองก็ได้:

```bash
npm run build      # ได้ผลลัพธ์ในโฟลเดอร์ dist/ (ทั้ง index.html และ admin.html)
```

`app.py` ชี้ไปที่ `frontend-react/dist/` โดยตรง — เปลี่ยนที่อยู่ได้ด้วย env `FRONTEND_DIR`

## โครงสร้าง

เว็บมี 2 หน้า: `index.html` (ถอดเสียง) และ `admin.html` (ผู้ดูแล)

```
src/
  main.jsx                 จุดเริ่มหน้า index (mount App)
  App.jsx                  state กลาง + runTranscription() ที่ใช้ร่วมกัน
  admin.jsx                จุดเริ่มหน้า admin (mount AdminApp)
  AdminApp.jsx             หน้าผู้ดูแล: login, ตาราง, กรอง, อนุมัติ/ปฏิเสธ/ลบ, ดาวน์โหลด
  styles.css               ธีมเดิม (คลาสเดียวกับ Web/style.css)
  admin.css                สไตล์เฉพาะหน้า admin
  lib/
    audio.js               แปลงเสียง -> WAV 16kHz (พอร์ตตรง ๆ จาก script.js)
    api.js                 fetch /transcribe
  hooks/
    useRecorder.js         อัดเสียงไมค์ + แถบวัดระดับเสียง
    useSpeech.js           อ่านออกเสียง (TTS)
  components/
    RecordSection.jsx      ส่วนที่ 1 อัดเสียง
    UploadSection.jsx      ส่วนที่ 2 อัปโหลดไฟล์
    OutputSection.jsx      ส่วนที่ 3 ผลลัพธ์ + อ่านออกเสียง/ล้าง
    SuggestSection.jsx     ส่วนที่ 4 เสนอประโยคใหม่
```

> พอร์ตครบทั้งหน้าถอดเสียง (ส่วนที่ 1–4) และหน้า admin เทียบเท่าเวอร์ชัน vanilla แล้ว
> ยกเว้น logic เก็บ session ตอนรีโหลด/ออกจากหน้า (pagehide/pageshow ใน admin.html เดิม)
> ที่ทำให้ง่ายลง — โทเคนเก็บใน localStorage ตรง ๆ
