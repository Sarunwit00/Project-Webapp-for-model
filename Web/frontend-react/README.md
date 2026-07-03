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
npm run build      # ได้ผลลัพธ์ในโฟลเดอร์ dist/
```

จากนั้นให้ FastAPI เสิร์ฟโฟลเดอร์ `dist/` แทน `Web/` เช่น แก้ `app.py`:

```python
app.mount("/", StaticFiles(directory=str(HERE.parent.parent / "frontend-react" / "dist"),
                           html=True), name="web")
```

(เวอร์ชัน vanilla เดิมที่ `Web/` ยังอยู่ครบ ไม่ได้ถูกแตะ — ใช้เป็นตัวเทียบได้)

## โครงสร้าง

```
src/
  main.jsx                 จุดเริ่ม (mount React)
  App.jsx                  state กลาง + runTranscription() ที่ใช้ร่วมกัน
  styles.css               ธีมเดิม (คลาสเดียวกับ Web/style.css)
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
```

> หมายเหตุ: ตัวอย่างนี้พอร์ตเฉพาะหน้าถอดเสียง (ส่วนที่ 1–3) ยังไม่รวมฟอร์ม
> "เสนอประโยคใหม่" (ส่วนที่ 4) และหน้า admin
