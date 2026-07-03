// แปลงเสียง (recorded blob / uploaded file) -> WAV 16kHz mono
// พอร์ตมาจาก script.js เดิม (เป็น JS ล้วน ไม่ผูก DOM จึงใช้ซ้ำใน React ได้ทั้งดุ้น)
export const TARGET_SR = 16000

export async function blobToWav16k(blob) {
  const arrayBuf = await blob.arrayBuffer()
  const AC = window.AudioContext || window.webkitAudioContext
  const tmpCtx = new AC()
  let decoded
  try {
    decoded = await tmpCtx.decodeAudioData(arrayBuf)
  } finally {
    tmpCtx.close()
  }

  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_SR))
  // 1 ช่อง + sample rate 16000 -> Web Audio จะ downmix เป็น mono และ resample ให้เอง
  const offline = new OfflineAudioContext(1, frames, TARGET_SR)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  const ch = rendered.getChannelData(0)

  let peak = 0
  for (let i = 0; i < ch.length; i++) {
    const a = Math.abs(ch[i])
    if (a > peak) peak = a
  }
  console.log(
    `[stt] เสียงที่อ่านได้: ${decoded.duration.toFixed(2)}s @${decoded.sampleRate}Hz ` +
      `${decoded.numberOfChannels}ch -> 16k mono, peak=${peak.toFixed(4)}` +
      (peak < 0.01 ? '  ⚠️ แทบเงียบ!' : ''),
  )
  return encodeWav(ch, TARGET_SR)
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // sub-chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let off = 44
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([view], { type: 'audio/wav' })
}
