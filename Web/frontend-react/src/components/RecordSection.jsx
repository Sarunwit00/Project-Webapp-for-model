import { useEffect, useRef, useState } from 'react'
import { useRecorder } from '../hooks/useRecorder.js'

const MicIcon = () => (
  <svg className="mic-icon" viewBox="0 0 24 24">
    <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
  </svg>
)

export default function RecordSection({ status, setStatus, busy, onTranscribe }) {
  const [recordedUrl, setRecordedUrl] = useState(null)
  const urlRef = useRef(null)

  const { supported, recording, meterLevel, start, stop } = useRecorder((blob) => {
    // มีเสียงที่อัดเสร็จแล้ว -> โชว์ตัวเล่น + ส่งไปถอด
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(blob)
    urlRef.current = url
    setRecordedUrl(url)
    onTranscribe(blob)
  })

  useEffect(() => {
    if (!supported) setStatus('⚠️ เบราว์เซอร์ไม่รองรับการบันทึกเสียง (ใช้ Chrome/Edge/Firefox)')
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [supported, setStatus])

  const toggleRecord = async () => {
    if (recording) {
      stop()
      setStatus('⏳ กำลังถอดเสียงด้วยโมเดล...')
    } else {
      try {
        await start()
        setStatus('🔴 กำลังบันทึก...')
      } catch (err) {
        setStatus('❌ เข้าถึงไมโครโฟนไม่ได้: ' + err.message)
      }
    }
  }

  const deleteRecording = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setRecordedUrl(null)
    setStatus('ลบไฟล์เสียงที่อัดแล้ว')
  }

  return (
    <div className="section">
      <h2>
        1. บันทึกเสียง <span className="badge">Live</span>
      </h2>
      <div className="controls">
        <button
          className={'btn btn-record' + (recording ? ' recording' : '')}
          onClick={toggleRecord}
          disabled={!supported || busy}
        >
          <MicIcon />
          <span>{recording ? 'หยุดบันทึก' : 'เริ่มบันทึก'}</span>
        </button>
        <span className="status">{status}</span>
      </div>

      {recording && (
        <div className="meter-wrap">
          <span className="meter-label">🎚️ ระดับเสียงไมค์</span>
          <div className="meter">
            <div
              className={'meter-fill' + (meterLevel > 0.92 ? ' clip' : '')}
              style={{ width: (meterLevel * 100).toFixed(1) + '%' }}
            />
          </div>
        </div>
      )}

      <p className="info">
        กดหยุดบันทึกแล้วระบบจะส่งเสียงให้โมเดลถอดเป็นข้อความให้อัตโนมัติ
      </p>

      {recordedUrl && (
        <div className="audio-row">
          <audio src={recordedUrl} controls />
          <button
            className="icon-btn"
            title="ลบไฟล์เสียงที่อัด"
            aria-label="ลบไฟล์เสียงที่อัด"
            onClick={deleteRecording}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
