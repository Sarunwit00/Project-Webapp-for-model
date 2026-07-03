import { blobToWav16k } from './audio.js'

// ส่งเสียงไป backend แล้วรับผลกลับ
// คืน { text, seconds, peak, confidence, distinct, unreliable }
// ยิงไป path สัมพัทธ์ '/transcribe' — ตอน dev Vite proxy ไป backend:8000 ให้ (ดู vite.config.js)
export async function transcribe(blob) {
  const wav = await blobToWav16k(blob)
  const fd = new FormData()
  fd.append('file', wav, 'audio.wav')
  const res = await fetch('/transcribe', { method: 'POST', body: fd })
  if (!res.ok) {
    let msg = `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`
    try {
      const j = await res.json()
      if (j && j.detail) msg = j.detail
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res.json()
}
