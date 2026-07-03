import { useCallback, useEffect, useRef, useState } from 'react'

// อ่านออกเสียงข้อความด้วย Web Speech API (พอร์ตจาก script.js เดิม)
// คืน { supported, speaking, toggle, stop }
export function useSpeech() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  const supported = !!synth && typeof SpeechSynthesisUtterance !== 'undefined'
  const [speaking, setSpeaking] = useState(false)
  const utterRef = useRef(null)

  useEffect(() => {
    if (supported) synth.getVoices() // วอร์มรายชื่อเสียงไว้ก่อน (บางเบราว์เซอร์โหลด async)
  }, [supported, synth])

  const stop = useCallback(() => {
    if (synth && synth.speaking) synth.cancel()
    setSpeaking(false)
  }, [synth])

  const speak = useCallback(
    (text) => {
      const t = (text || '').trim()
      if (!supported || !t) return
      const utter = new SpeechSynthesisUtterance(t)
      utter.lang = 'th-TH'
      const voices = synth.getVoices()
      const thai = voices.find((v) => (v.lang || '').toLowerCase().startsWith('th'))
      if (thai) utter.voice = thai
      utter.onend = () => setSpeaking(false)
      utter.onerror = () => setSpeaking(false)
      utterRef.current = utter
      setSpeaking(true)
      synth.speak(utter)
    },
    [supported, synth],
  )

  // กดซ้ำระหว่างอ่าน = หยุด
  const toggle = useCallback(
    (text) => {
      if (synth && synth.speaking) stop()
      else speak(text)
    },
    [synth, speak, stop],
  )

  return { supported, speaking, toggle, stop }
}
