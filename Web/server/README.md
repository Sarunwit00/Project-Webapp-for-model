# Backend ถอดเสียงภาษาไทย (Wav2Vec2)

เซิร์ฟเวอร์ FastAPI ที่โหลดโมเดล `Wav2Vec2ForCTC` ของคุณ แล้วถอดไฟล์เสียงเป็นข้อความภาษาไทย
หน้าเว็บ (`../index.html`) จะส่งเสียงมาที่นี่เพื่อถอดข้อความ

## โครงสร้าง

```
Desktop/
├─ Model/                     ← โมเดลของคุณ (model.safetensors, config.json, ...)
└─ WebAppProject/Web/
   ├─ index.html, style.css, script.js   ← หน้าเว็บ
   └─ server/
      ├─ app.py               ← เซิร์ฟเวอร์ FastAPI
      ├─ requirements.txt
      └─ run.bat              ← ดับเบิลคลิกเพื่อรัน (Windows)
```

## วิธีรัน (ง่ายสุด)

ดับเบิลคลิก **`run.bat`** — สคริปต์จะสร้าง virtual environment, ติดตั้ง dependencies
(ครั้งแรกดาวน์โหลด ~1GB เพราะมี PyTorch) แล้วเปิดเซิร์ฟเวอร์

จากนั้นเปิดเบราว์เซอร์ไปที่ **http://127.0.0.1:8000**

## วิธีรัน (ด้วยมือ)

```bash
cd WebAppProject/Web/server
python -m venv .venv
.venv\Scripts\activate           # Windows
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

## API

| Method | Path          | รายละเอียด                                            |
|--------|---------------|------------------------------------------------------|
| GET    | `/health`     | เช็กสถานะ + อุปกรณ์ (cpu/cuda) + ที่อยู่โมเดล          |
| POST   | `/transcribe` | อัปโหลดไฟล์ WAV (16kHz mono) → คืน `{"text": "..."}` |
| GET    | `/`           | เสิร์ฟหน้าเว็บ                                          |

ตัวอย่างทดสอบด้วย curl:

```bash
curl -F "file=@test.wav" http://127.0.0.1:8000/transcribe
```

## หมายเหตุ

- ถ้าโฟลเดอร์โมเดลอยู่ที่อื่น ตั้งค่า env var ก่อนรัน:
  `set MODEL_DIR=D:\path\to\Model`
- รันบน CPU ได้เลย (ช้ากว่านิดหน่อย) ถ้ามี GPU + CUDA จะใช้ GPU อัตโนมัติ
- หน้าเว็บแปลงเสียงเป็น WAV 16kHz ให้ในเบราว์เซอร์ก่อนส่ง เซิร์ฟเวอร์จึงไม่ต้องใช้ ffmpeg
