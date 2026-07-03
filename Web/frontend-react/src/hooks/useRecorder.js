import { useCallback, useEffect, useRef, useState } from 'react'

// ครอบตรรกะการอัดเสียงด้วยไมโครโฟน + แถบวัดระดับเสียงสด (พอร์ตจาก script.js เดิม)
// onComplete(blob) จะถูกเรียกเมื่อหยุดอัด พร้อม blob ของเสียงที่ได้
export function useRecorder(onComplete) {
  const supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== 'undefined' &&
    !!window.MediaRecorder

  const [recording, setRecording] = useState(false)
  const [meterLevel, setMeterLevel] = useState(0) // 0..1

  // เก็บ onComplete ล่าสุดไว้ใน ref กัน stale closure ใน callback ของ MediaRecorder
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const meter = useRef({ ctx: null, analyser: null, data: null, raf: null, level: 0 })

  const stopMeter = useCallback(() => {
    const m = meter.current
    if (m.raf) cancelAnimationFrame(m.raf)
    m.raf = null
    m.analyser = null
    m.data = null
    if (m.ctx) {
      m.ctx.close().catch(() => {})
      m.ctx = null
    }
    m.level = 0
    setMeterLevel(0)
  }, [])

  const startMeter = useCallback((stream) => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      const ctx = new AC()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser) // ไม่ต่อไป destination เพื่อกันเสียงหอน
      const data = new Float32Array(analyser.fftSize)
      const m = meter.current
      m.ctx = ctx
      m.analyser = analyser
      m.data = data
      m.level = 0

      const draw = () => {
        if (!m.analyser) return
        m.analyser.getFloatTimeDomainData(m.data)
        let peak = 0
        for (let i = 0; i < m.data.length; i++) {
          const a = Math.abs(m.data[i])
          if (a > peak) peak = a
        }
        const target = Math.min(1, peak * 1.4)
        // attack เร็ว / release ช้า ให้แถบดูนุ่ม
        m.level = target > m.level ? target : m.level + (target - m.level) * 0.2
        setMeterLevel(m.level)
        m.raf = requestAnimationFrame(draw)
      }
      draw()
    } catch (err) {
      console.warn('meter error', err)
    }
  }, [])

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const rec = new MediaRecorder(stream)
      recorderRef.current = rec
      chunksRef.current = []

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || 'audio/webm',
        })
        stream.getTracks().forEach((t) => t.stop())
        onCompleteRef.current?.(blob)
      }

      rec.start()
      startMeter(stream)
      setRecording(true)
    } catch (err) {
      console.error(err)
      throw err
    }
  }, [startMeter])

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    stopMeter()
    setRecording(false)
  }, [stopMeter])

  // เก็บกวาดตอน component ถูก unmount ระหว่างยังอัด/มิเตอร์ทำงานอยู่
  useEffect(() => {
    return () => {
      stopMeter()
      const rec = recorderRef.current
      if (rec && rec.state !== 'inactive') rec.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [stopMeter])

  return { supported, recording, meterLevel, start, stop }
}
