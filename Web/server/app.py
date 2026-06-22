"""
FastAPI backend สำหรับถอดเสียงภาษาไทยด้วยโมเดล Wav2Vec2 (CTC) ของคุณเอง

- โหลดโมเดลจากโฟลเดอร์ Model หนึ่งครั้งตอนเริ่มเซิร์ฟเวอร์
- รับไฟล์เสียง WAV (16kHz mono) ที่ POST /transcribe แล้วคืนข้อความภาษาไทย
- เสิร์ฟไฟล์หน้าเว็บ (index.html ฯลฯ) ให้ด้วย จะได้ใช้งานจาก origin เดียวกัน

รันด้วย:  python -m uvicorn app:app --host 127.0.0.1 --port 8000
"""

import csv
import datetime
import io
import os
import sqlite3
import sys
import wave
from pathlib import Path
from typing import Optional

# กันปัญหา console บน Windows (cp1252) พิมพ์ภาษาไทยไม่ได้
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

import numpy as np
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

# ---------------------------------------------------------------------------
# ที่อยู่ไฟล์
# ---------------------------------------------------------------------------
HERE = Path(__file__).resolve()
WEB_DIR = HERE.parent.parent                       # .../WebAppProject/Web
# โฟลเดอร์โมเดลอยู่ที่ Desktop/Model (เปลี่ยนได้ด้วย env var MODEL_DIR)
DEFAULT_MODEL_DIR = HERE.parents[3] / "Model"      # .../Desktop/Model
MODEL_DIR = Path(os.environ.get("MODEL_DIR", DEFAULT_MODEL_DIR))

TARGET_SR = 16000  # โมเดลต้องการ 16kHz

# ---------------------------------------------------------------------------
# โหลดโมเดล (ครั้งเดียวตอนเริ่ม)
# ---------------------------------------------------------------------------
print(f"[startup] กำลังโหลดโมเดลจาก: {MODEL_DIR}")
if not MODEL_DIR.exists():
    raise RuntimeError(
        f"ไม่พบโฟลเดอร์โมเดลที่ {MODEL_DIR} "
        f"— ตั้งค่า env var MODEL_DIR ให้ชี้ไปที่โฟลเดอร์โมเดลด้วย"
    )

processor = Wav2Vec2Processor.from_pretrained(str(MODEL_DIR))
model = Wav2Vec2ForCTC.from_pretrained(str(MODEL_DIR))
model.eval()
device = "cuda" if torch.cuda.is_available() else "cpu"
model.to(device)
print(f"[startup] โหลดโมเดลสำเร็จ ใช้อุปกรณ์: {device}")

# ---------------------------------------------------------------------------
# แอป
# ---------------------------------------------------------------------------
app = FastAPI(title="Thai Speech-to-Text API")

# เผื่อกรณีเปิดหน้าเว็บจาก origin อื่น (เช่น Live Server) ให้เรียก API ได้
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def read_wav(raw: bytes):
    """อ่าน WAV ออกมาเป็น float32 mono ที่ 16kHz"""
    with wave.open(io.BytesIO(raw), "rb") as w:
        n_channels = w.getnchannels()
        sampwidth = w.getsampwidth()
        framerate = w.getframerate()
        frames = w.readframes(w.getnframes())

    if sampwidth == 2:
        data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    elif sampwidth == 4:
        data = np.frombuffer(frames, dtype=np.int32).astype(np.float32) / 2147483648.0
    elif sampwidth == 1:
        data = (np.frombuffer(frames, dtype=np.uint8).astype(np.float32) - 128) / 128.0
    else:
        raise HTTPException(status_code=400, detail=f"รองรับเฉพาะ WAV 8/16/32-bit (ได้ {sampwidth*8}-bit)")

    # รวมเป็น mono
    if n_channels > 1:
        data = data.reshape(-1, n_channels).mean(axis=1)

    # resample แบบ linear เผื่อไฟล์ไม่ใช่ 16kHz (ปกติฝั่งเว็บแปลงมาให้แล้ว)
    if framerate != TARGET_SR and len(data) > 1:
        duration = len(data) / framerate
        new_len = int(round(duration * TARGET_SR))
        x_old = np.linspace(0.0, duration, num=len(data), endpoint=False)
        x_new = np.linspace(0.0, duration, num=new_len, endpoint=False)
        data = np.interp(x_new, x_old, data).astype(np.float32)

    return data


@torch.no_grad()
def transcribe_audio(audio: np.ndarray) -> str:
    if audio.size == 0:
        return ""
    inputs = processor(audio, sampling_rate=TARGET_SR, return_tensors="pt")
    input_values = inputs.input_values.to(device)
    logits = model(input_values).logits
    pred_ids = torch.argmax(logits, dim=-1)
    return processor.batch_decode(pred_ids)[0].strip()


@app.get("/health")
def health():
    return {"status": "ok", "device": device, "model_dir": str(MODEL_DIR)}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="ไฟล์เสียงว่างเปล่า")
    try:
        audio = read_wav(raw)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"อ่านไฟล์เสียงไม่ได้: {exc}")

    dur = audio.size / TARGET_SR
    peak = float(np.abs(audio).max()) if audio.size else 0.0
    rms = float(np.sqrt(np.mean(audio ** 2))) if audio.size else 0.0
    print(f"[transcribe] {file.filename}: {dur:.2f}s samples={audio.size} peak={peak:.4f} rms={rms:.4f}")

    text = transcribe_audio(audio)
    print(f"[transcribe] -> {text!r}")
    return {"text": text, "seconds": round(dur, 2), "peak": round(peak, 4)}


# ---------------------------------------------------------------------------
# เสนอคำศัพท์ใหม่ (crowdsource ภาษาถิ่น -> ไทยกลาง)
# ---------------------------------------------------------------------------
DB_PATH = HERE.parent / "suggestions.db"
AUDIO_DIR = HERE.parent / "suggestions_audio"
AUDIO_DIR.mkdir(exist_ok=True)

ALLOWED_AUDIO_EXT = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".aac", ".flac"}


def init_suggestions_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS suggestions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            dialect_text TEXT NOT NULL,
            central_text TEXT NOT NULL,
            category     TEXT,
            region       TEXT,
            province     TEXT,
            audio_path   TEXT,
            status       TEXT DEFAULT 'pending',
            created_at   TEXT
        )
        """
    )
    conn.commit()
    conn.close()


init_suggestions_db()


@app.post("/suggest")
async def suggest(
    dialect_text: str = Form(""),
    central_text: str = Form(""),
    category: str = Form(""),
    region: str = Form(""),
    province: str = Form(""),
    audio: Optional[UploadFile] = File(None),
):
    dialect_text = dialect_text.strip()
    central_text = central_text.strip()
    if not dialect_text or not central_text:
        raise HTTPException(
            status_code=400,
            detail="กรุณากรอกทั้งประโยคภาษาถิ่นและคำแปลไทยกลาง",
        )

    created_at = datetime.datetime.now().isoformat(timespec="seconds")
    conn = sqlite3.connect(str(DB_PATH))
    try:
        cur = conn.execute(
            "INSERT INTO suggestions "
            "(dialect_text, central_text, category, region, province, status, created_at) "
            "VALUES (?, ?, ?, ?, ?, 'pending', ?)",
            (dialect_text, central_text, category, region, province, created_at),
        )
        new_id = cur.lastrowid

        audio_path = None
        if audio is not None and audio.filename:
            raw = await audio.read()
            if raw:
                ext = Path(audio.filename).suffix.lower()
                if ext not in ALLOWED_AUDIO_EXT:
                    ext = ".wav"
                audio_path = f"{new_id}{ext}"
                (AUDIO_DIR / audio_path).write_bytes(raw)
                conn.execute(
                    "UPDATE suggestions SET audio_path = ? WHERE id = ?",
                    (audio_path, new_id),
                )

        conn.commit()
        total = conn.execute("SELECT COUNT(*) FROM suggestions").fetchone()[0]
    finally:
        conn.close()

    print(
        f"[suggest] #{new_id} {dialect_text!r} -> {central_text!r} "
        f"({region}/{province}, audio={audio_path})"
    )
    return {"ok": True, "id": new_id, "total": total}


@app.get("/suggest/count")
def suggest_count():
    conn = sqlite3.connect(str(DB_PATH))
    total = conn.execute("SELECT COUNT(*) FROM suggestions").fetchone()[0]
    conn.close()
    return {"total": total}


@app.get("/suggest/export.csv")
def suggest_export():
    conn = sqlite3.connect(str(DB_PATH))
    rows = conn.execute(
        "SELECT id, dialect_text, central_text, category, region, province, "
        "audio_path, status, created_at FROM suggestions ORDER BY id"
    ).fetchall()
    conn.close()

    buf = io.StringIO()
    buf.write("﻿")  # BOM ให้ Excel เปิดภาษาไทยไม่เพี้ยน
    writer = csv.writer(buf)
    writer.writerow([
        "id", "dialect_text", "central_text", "category",
        "region", "province", "audio_path", "status", "created_at",
    ])
    writer.writerows(rows)

    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=suggestions.csv"},
    )


# เสิร์ฟหน้าเว็บ (ต้อง mount ท้ายสุด เพราะ "/" จะ match ทุก path)
app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")
