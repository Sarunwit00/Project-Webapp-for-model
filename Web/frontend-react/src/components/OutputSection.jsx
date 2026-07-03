import { useEffect } from 'react'
import { useSpeech } from '../hooks/useSpeech.js'

export default function OutputSection({ text, error, onClear, registerStop }) {
  const { supported, speaking, toggle, stop } = useSpeech()

  // ฝากฟังก์ชัน stop ให้ App เรียกหยุดอ่านออกเสียงก่อนถอดไฟล์ใหม่
  useEffect(() => {
    registerStop?.(stop)
    return () => registerStop?.(null)
  }, [registerStop, stop])

  const handleClear = () => {
    stop()
    onClear()
  }

  return (
    <div className="section">
      <h2>
        3. ข้อความภาษาไทยกลาง <span className="badge">Output</span>
      </h2>

      <textarea
        className="text-output"
        placeholder="ข้อความที่ถอดได้จะแสดงที่นี่..."
        value={text}
        readOnly
      />

      {error && (
        <p className="output-error" role="alert">
          {error}
        </p>
      )}

      <div className="controls" style={{ marginTop: 12 }}>
        {supported && (
          <button
            className={'btn btn-secondary' + (speaking ? ' speaking' : '')}
            onClick={() => toggle(text)}
          >
            {speaking ? '⏹ หยุดอ่าน' : '🔊 อ่านออกเสียง'}
          </button>
        )}
        <button className="btn btn-clear" onClick={handleClear}>
          🗑️ ล้างข้อความ
        </button>
      </div>
    </div>
  )
}
