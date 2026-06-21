@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"

if not exist ".venv" (
  echo [1/3] กำลังสร้าง virtual environment...
  python -m venv .venv
)

call .venv\Scripts\activate.bat

echo [2/3] กำลังติดตั้ง/ตรวจสอบ dependencies (ครั้งแรกอาจนานหน่อย ดาวน์โหลด ~1GB)...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo [3/3] เปิดเซิร์ฟเวอร์ที่ http://127.0.0.1:8000  (กด Ctrl+C เพื่อหยุด)
python -m uvicorn app:app --host 127.0.0.1 --port 8000
