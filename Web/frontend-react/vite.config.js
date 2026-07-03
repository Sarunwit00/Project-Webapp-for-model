import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ตอน dev (npm run dev ที่พอร์ต 5173) ให้ proxy request ที่ยิงไป /transcribe, /health
// ไปที่ FastAPI backend (พอร์ต 8000) — หน้าเว็บจึงเรียก path สัมพัทธ์ '/transcribe' ได้เลย
// ทั้งตอน dev และตอน build ไป prod (ที่ backend เสิร์ฟไฟล์เอง) โดยไม่ต้องพึ่ง CORS
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/transcribe': 'http://127.0.0.1:8000',
      '/suggest': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
    },
  },
  // build ออกมาให้พร้อมเอาไปวางใน backend (ดู README) — ปรับ base ได้ตามที่เสิร์ฟจริง
  build: { outDir: 'dist' },
})
