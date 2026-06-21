@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "cloudflared.exe" (
  echo กำลังดาวน์โหลด cloudflared ครั้งแรก...
  curl.exe -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)

echo.
echo *** สำคัญ: เปิด backend ด้วย run.bat ก่อน แล้วค่อยรันไฟล์นี้ ***
echo กำลังเปิด tunnel สาธารณะไปที่ http://127.0.0.1:8000 ...
echo เมื่อขึ้นลิงก์ https://xxxxx.trycloudflare.com ให้ copy ไปส่งให้คนอื่นเข้าได้เลย
echo (ลิงก์จะเปลี่ยนใหม่ทุกครั้งที่เปิด / ปิด tunnel = กด Ctrl+C หรือปิดหน้าต่างนี้)
echo.
cloudflared.exe tunnel --url http://127.0.0.1:8000
