# หน้าถอดเสียง — เวอร์ชัน React + Vite (ตัวอย่าง)

พอร์ตหน้าถอดเสียง (อัดเสียง / อัปโหลดไฟล์ / แสดงผล + อ่านออกเสียง) จากเวอร์ชัน
vanilla (`Web/index.html` + `Web/script.js`) มาเป็น React โดย **ใช้ backend FastAPI ตัวเดิม**
ไม่ต้องแก้อะไรฝั่งเซิร์ฟเวอร์ — เรียก `POST /transcribe` แล้วอ่าน `{text, unreliable, ...}` เหมือนเดิม

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

```bash
npm run build      # ได้ผลลัพธ์ในโฟลเดอร์ dist/ (ทั้ง index.html และ admin.html)
```

จากนั้นแค่ **รีสตาร์ท backend** — `app.py` ตรวจเจอ `frontend-react/dist/` อัตโนมัติ
แล้วเสิร์ฟเวอร์ชัน React ให้เอง (ถ้ายังไม่ได้ build จะ fallback ไปเวอร์ชัน vanilla ที่ `Web/`
จึงไม่พังแน่นอน). บังคับเลือกโฟลเดอร์เองได้ด้วย env `FRONTEND_DIR`:

```bash
set FRONTEND_DIR=C:\Users\Sarunwit\Desktop\WebAppProject\Web   REM กลับไปใช้ vanilla
```

(เวอร์ชัน vanilla เดิมที่ `Web/` ยังอยู่ครบ ไม่ได้ถูกแตะ — ใช้เป็นตัวเทียบได้)

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
