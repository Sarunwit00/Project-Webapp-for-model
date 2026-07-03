import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))

// ตอน dev (npm run dev ที่พอร์ต 5173) ให้ proxy request ที่ยิงไป API ต่าง ๆ
// ไปที่ FastAPI backend (พอร์ต 8000) — หน้าเว็บจึงเรียก path สัมพัทธ์ได้เลยทั้ง dev และ prod
// โดยไม่ต้องพึ่ง CORS
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/transcribe': 'http://127.0.0.1:8000',
      '/suggest': 'http://127.0.0.1:8000',
      // เจาะจงเฉพาะ /admin/login — ถ้าใช้ '/admin' กว้าง ๆ จะไปจับ '/admin.html'
      // (หน้าเว็บ) แล้ว proxy ไป backend แทนที่จะให้ Vite เสิร์ฟหน้า React
      '/admin/login': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
    },
  },
  // เว็บมี 2 หน้า (index = ถอดเสียง, admin = ผู้ดูแล) -> ตั้ง input ให้ build ออกมาทั้งคู่
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        admin: resolve(root, 'admin.html'),
      },
    },
  },
})
