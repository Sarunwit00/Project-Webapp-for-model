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
import secrets
import sqlite3
import sys
import wave
import zipfile
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
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
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


# ---------------------------------------------------------------------------
# บัญชีผู้ดูแลหน้า admin (username + password)
# ที่มา: env ADMIN_USER/ADMIN_PASS > ไฟล์ .admin_login (บรรทัด1=user, บรรทัด2=pass)
# ---------------------------------------------------------------------------
ADMIN_LOGIN_FILE = HERE.parent / ".admin_login"
ADMIN_USER = os.environ.get("ADMIN_USER", "").strip()
ADMIN_PASS = os.environ.get("ADMIN_PASS", "").strip()
if (not ADMIN_USER or not ADMIN_PASS) and ADMIN_LOGIN_FILE.exists():
    _lines = ADMIN_LOGIN_FILE.read_text(encoding="utf-8").splitlines()
    if not ADMIN_USER and len(_lines) >= 1:
        ADMIN_USER = _lines[0].strip()
    if not ADMIN_PASS and len(_lines) >= 2:
        ADMIN_PASS = _lines[1].strip()
if not ADMIN_USER:
    ADMIN_USER = "admin"
if not ADMIN_PASS:
    ADMIN_PASS = secrets.token_urlsafe(9)
    ADMIN_LOGIN_FILE.write_text(f"{ADMIN_USER}\n{ADMIN_PASS}\n", encoding="utf-8")
    print(f"[admin] สร้างบัญชี admin ใหม่ -> user: {ADMIN_USER}  pass: {ADMIN_PASS}")
print(f"[admin] บัญชี admin: ดู/แก้ได้ที่ {ADMIN_LOGIN_FILE} (บรรทัด1=username, บรรทัด2=password)")

# โทเคนใช้งานหลังล็อกอิน (สุ่มใหม่ทุกครั้งที่เปิดเซิร์ฟเวอร์)
ADMIN_TOKEN = secrets.token_urlsafe(24)


def require_admin(x_admin_token: str = Header(""), token: str = ""):
    """ตรวจโทเคนที่ได้หลังล็อกอิน รับได้ทั้ง header X-Admin-Token และ query ?token="""
    provided = x_admin_token or token
    if not secrets.compare_digest(provided, ADMIN_TOKEN):
        raise HTTPException(status_code=401, detail="ต้องเข้าสู่ระบบผู้ดูแลก่อน")


@app.post("/admin/login")
def admin_login(username: str = Form(""), password: str = Form("")):
    ok = secrets.compare_digest(username, ADMIN_USER) and secrets.compare_digest(password, ADMIN_PASS)
    if not ok:
        raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    return {"ok": True, "token": ADMIN_TOKEN}


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

    # ไฟล์เสียงตัวอย่าง "บังคับ" ต้องแนบมาด้วย
    audio_bytes = await audio.read() if (audio is not None and audio.filename) else b""
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="กรุณาแนบไฟล์เสียงตัวอย่าง")

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

        ext = Path(audio.filename).suffix.lower()
        if ext not in ALLOWED_AUDIO_EXT:
            ext = ".wav"
        audio_path = f"{new_id}{ext}"
        (AUDIO_DIR / audio_path).write_bytes(audio_bytes)
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


@app.get("/suggest/export.csv", dependencies=[Depends(require_admin)])
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


@app.get("/suggest/export.zip", dependencies=[Depends(require_admin)])
def suggest_export_zip():
    """ดาวน์โหลดทุกอย่างในไฟล์เดียว: suggestions.csv + ไฟล์เสียงทั้งหมด (โฟลเดอร์ audio/)"""
    conn = sqlite3.connect(str(DB_PATH))
    rows = conn.execute(
        "SELECT id, dialect_text, central_text, category, region, province, "
        "audio_path, status, created_at FROM suggestions ORDER BY id"
    ).fetchall()
    conn.close()

    # สร้าง CSV (เหมือน /suggest/export.csv)
    csv_buf = io.StringIO()
    csv_buf.write("﻿")  # BOM ให้ Excel เปิดภาษาไทยไม่เพี้ยน
    writer = csv.writer(csv_buf)
    writer.writerow([
        "id", "dialect_text", "central_text", "category",
        "region", "province", "audio_path", "status", "created_at",
    ])
    writer.writerows(rows)

    # ห่อ CSV + ไฟล์เสียงทุกอันไว้ใน ZIP เดียว
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("suggestions.csv", csv_buf.getvalue())
        for row in rows:
            audio_name = row[6]  # คอลัมน์ audio_path
            if not audio_name:
                continue
            audio_file = AUDIO_DIR / audio_name
            if audio_file.is_file():
                zf.write(audio_file, f"audio/{audio_name}")

    return Response(
        content=zip_buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=suggestions_export.zip"},
    )


# ---------------------------------------------------------------------------
# จัดการรายการที่เสนอเข้ามา (สำหรับหน้า admin)
# ---------------------------------------------------------------------------
VALID_STATUS = {"pending", "approved", "rejected"}


@app.get("/suggest/list", dependencies=[Depends(require_admin)])
def suggest_list(status: str = ""):
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        if status in VALID_STATUS:
            rows = conn.execute(
                "SELECT * FROM suggestions WHERE status = ? ORDER BY id DESC", (status,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM suggestions ORDER BY id DESC").fetchall()
        counts = {
            s: conn.execute(
                "SELECT COUNT(*) FROM suggestions WHERE status = ?", (s,)
            ).fetchone()[0]
            for s in VALID_STATUS
        }
        total = conn.execute("SELECT COUNT(*) FROM suggestions").fetchone()[0]
    finally:
        conn.close()
    return {"items": [dict(r) for r in rows], "counts": counts, "total": total}


@app.post("/suggest/{sid}/status", dependencies=[Depends(require_admin)])
def suggest_set_status(sid: int, status: str = Form(...)):
    if status not in VALID_STATUS:
        raise HTTPException(status_code=400, detail="สถานะไม่ถูกต้อง")
    conn = sqlite3.connect(str(DB_PATH))
    try:
        cur = conn.execute(
            "UPDATE suggestions SET status = ? WHERE id = ?", (status, sid)
        )
        conn.commit()
        changed = cur.rowcount
    finally:
        conn.close()
    if not changed:
        raise HTTPException(status_code=404, detail="ไม่พบรายการที่ระบุ")
    return {"ok": True, "id": sid, "status": status}


@app.delete("/suggest/{sid}", dependencies=[Depends(require_admin)])
def suggest_delete(sid: int):
    conn = sqlite3.connect(str(DB_PATH))
    try:
        row = conn.execute(
            "SELECT audio_path FROM suggestions WHERE id = ?", (sid,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="ไม่พบรายการที่ระบุ")
        conn.execute("DELETE FROM suggestions WHERE id = ?", (sid,))
        conn.commit()
    finally:
        conn.close()
    if row[0]:
        audio_file = AUDIO_DIR / row[0]
        if audio_file.exists():
            try:
                audio_file.unlink()
            except OSError:
                pass
    return {"ok": True, "id": sid}


@app.get("/suggest/audio/{name}", dependencies=[Depends(require_admin)])
def suggest_audio(name: str):
    target = (AUDIO_DIR / name).resolve()
    if target.parent != AUDIO_DIR.resolve() or not target.is_file():
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์เสียง")
    return FileResponse(str(target))


# เสิร์ฟหน้าหลัก + admin แบบห้าม cache (เบราว์เซอร์จะได้เห็นเวอร์ชันล่าสุดเสมอ)
@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
def index_page():
    resp = FileResponse(str(WEB_DIR / "index.html"), media_type="text/html")
    resp.headers["Cache-Control"] = "no-store, must-revalidate"
    return resp


@app.get("/admin.html", include_in_schema=False)
def admin_page():
    resp = FileResponse(str(WEB_DIR / "admin.html"), media_type="text/html")
    resp.headers["Cache-Control"] = "no-store, must-revalidate"
    return resp


# เสิร์ฟหน้าเว็บ (ต้อง mount ท้ายสุด เพราะ "/" จะ match ทุก path)
app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")
