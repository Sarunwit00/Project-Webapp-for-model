import { useCallback, useRef, useState } from 'react'
import { transcribe } from './lib/api.js'
import RecordSection from './components/RecordSection.jsx'
import UploadSection from './components/UploadSection.jsx'
import OutputSection from './components/OutputSection.jsx'

export default function App() {
  const [output, setOutput] = useState('')
  const [outputError, setOutputError] = useState('')
  const [status, setStatus] = useState('พร้อมบันทึก')
  const [busy, setBusy] = useState(false)
  const stopSpeakRef = useRef(null) // OutputSection ฝากฟังก์ชันหยุดอ่านออกเสียงไว้ที่นี่

  // ถอดเสียง 1 ครั้ง — ใช้ร่วมกันทั้งอัดเสียงและอัปโหลดไฟล์
  const runTranscription = useCallback(async (blob) => {
    if (!blob) return
    setBusy(true)
    setOutputError('')
    stopSpeakRef.current?.() // หยุดอ่านออกเสียงผลเก่า ก่อนถอดไฟล์ใหม่
    setOutput('') // ล้างผลถอดครั้งก่อน — แสดงเฉพาะข้อความของไฟล์ล่าสุด
    setStatus('⏳ กำลังถอดเสียงด้วยโมเดล...')
    try {
      const data = await transcribe(blob)
      const text = data.text || ''
      if (data.unreliable) {
        // โมเดลพ่นข้อความออกมาก็จริง แต่เป็นตัวอักษรซ้ำ ๆ (เสียงไม่ตรงกับที่เทรน) -> แปลไม่ได้
        setOutputError('❌ ไม่สามารถแปลได้ — เสียงไม่ตรงกับที่โมเดลเรียนรู้')
        setStatus('⚠️ เสียงนี้แปลไม่ได้ — ลองพูดชัด ๆ/ใกล้ไมค์ หรือเช็กว่าเป็นคำที่เทรนไว้')
      } else if (text) {
        setOutput(text)
        setStatus('✅ ถอดเสียงเสร็จแล้ว')
      } else if ((data.peak || 0) < 0.01) {
        setOutputError('❌ ไม่สามารถถอดข้อความได้')
        setStatus('⚠️ แทบไม่มีเสียง — เช็กไมโครโฟน/อุปกรณ์อัด หรือพูดดังขึ้น')
      } else {
        setOutputError('❌ ไม่สามารถถอดข้อความได้')
        setStatus('⚠️ ได้ยินเสียงแต่โมเดลถอดไม่ออก (ลองพูดชัด ๆ/ยาวขึ้น)')
      }
    } catch (err) {
      console.error(err)
      if (/Failed to fetch|NetworkError|ERR_/i.test(err.message)) {
        setStatus('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้ — เปิด backend ก่อน (รัน server/run.bat)')
      } else {
        setStatus('❌ ' + err.message)
      }
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div className="container">
      <h1>🎙️ แปลงเสียงภาษาถิ่นเป็นข้อความภาษาไทย</h1>
      <p className="subtitle">เวอร์ชัน React + Vite (ตัวอย่างพอร์ตหน้าถอดเสียง)</p>

      <RecordSection
        status={status}
        setStatus={setStatus}
        busy={busy}
        onTranscribe={runTranscription}
      />

      <UploadSection busy={busy} onTranscribe={runTranscription} />

      <OutputSection
        text={output}
        error={outputError}
        onClear={() => {
          setOutput('')
          setOutputError('')
        }}
        registerStop={(fn) => {
          stopSpeakRef.current = fn
        }}
      />
    </div>
  )
}
