import { useEffect, useRef, useState } from 'react'
import { useRecorder } from '../hooks/useRecorder.js'
import { blobToWav16k } from '../lib/audio.js'

const CATEGORIES = [
  { value: 'การทักทาย/การแนะนำตัว', label: 'การทักทาย / การแนะนำตัว' },
  { value: 'ชีวิตประจำวัน', label: 'ชีวิตประจำวัน' },
  { value: 'อาหารการกิน', label: 'อาหารการกิน' },
  { value: 'การเดินทาง', label: 'การเดินทาง' },
  { value: 'อารมณ์/ความรู้สึก', label: 'อารมณ์ / ความรู้สึก' },
  { value: 'เวลา/ฤดูกาล', label: 'เวลา / ฤดูกาล' },
  { value: 'สุขภาพ', label: 'สุขภาพ' },
  { value: 'คำอุทาน', label: 'คำอุทาน' },
]

const REGIONS = [
  { value: 'เหนือ', label: 'ภาคเหนือ' },
  { value: 'อีสาน', label: 'ภาคอีสาน' },
  { value: 'ใต้', label: 'ภาคใต้' },
]

// จังหวัดของแต่ละภาค (เริ่มภาคละ 1 จังหวัด เพิ่มทีหลังได้)
const PROVINCES = {
  เหนือ: ['เชียงใหม่'],
  อีสาน: ['ร้อยเอ็ด'],
  ใต้: ['นครศรีธรรมราช'],
}

export default function SuggestSection() {
  const [dialect, setDialect] = useState('')
  const [central, setCentral] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0].value)
  const [region, setRegion] = useState('เหนือ')
  const [province, setProvince] = useState(PROVINCES['เหนือ'][0])

  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioName, setAudioName] = useState('')

  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fileInputRef = useRef(null)
  const urlRef = useRef(null)

  const setAudio = (blob, displayName) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(blob)
    urlRef.current = url
    setAudioBlob(blob)
    setAudioUrl(url)
    setAudioName(displayName)
  }

  const clearAudio = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setAudioBlob(null)
    setAudioUrl(null)
    setAudioName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // อัดเสียงตัวอย่างด้วยไมค์ (ใช้ hook เดียวกับหน้าถอดเสียง แต่แค่เก็บ blob ไว้ ไม่ส่งถอด)
  const { supported: recSupported, recording, start, stop } = useRecorder((blob) => {
    setAudio(blob, '🎙️ เสียงที่อัด')
    setStatus('')
  })

  // region เปลี่ยน -> รีเซ็ตจังหวัดเป็นตัวแรกของภาคนั้น
  useEffect(() => {
    setProvince(PROVINCES[region][0])
  }, [region])

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  const toggleRecord = async () => {
    if (recording) {
      stop()
      return
    }
    if (!recSupported) {
      setStatus('⚠️ เบราว์เซอร์ไม่รองรับการอัดเสียง')
      return
    }
    try {
      await start()
      setStatus('🔴 กำลังอัด...')
    } catch {
      setStatus('❌ เข้าถึงไมโครโฟนไม่ได้')
    }
  }

  const submit = async () => {
    setError('')
    const d = dialect.trim()
    const c = central.trim()
    if (!d || !c) {
      setError('❌ กรุณากรอกทั้งประโยคภาษาถิ่นและคำแปลไทยกลาง')
      return
    }
    if (!audioBlob) {
      setError('❌ กรุณาแนบไฟล์เสียงตัวอย่างก่อนส่ง')
      return
    }
    setSubmitting(true)
    setStatus('⏳ กำลังส่ง...')
    try {
      const fd = new FormData()
      fd.append('dialect_text', d)
      fd.append('central_text', c)
      fd.append('category', category)
      fd.append('region', region)
      fd.append('province', province)
      // แปลงเป็น WAV 16kHz ก่อนส่ง — ให้พร้อมเอาไปเทรนต่อได้ทันที (เหมือน vanilla)
      const wav = await blobToWav16k(audioBlob)
      fd.append('audio', wav, 'sample.wav')
      const res = await fetch('/suggest', { method: 'POST', body: fd })
      if (!res.ok) {
        let msg = `ส่งไม่สำเร็จ (${res.status})`
        try {
          const j = await res.json()
          if (j && j.detail) msg = j.detail
        } catch {
          /* ignore */
        }
        throw new Error(msg)
      }
      setStatus('✅ ส่งเรียบร้อย ขอบคุณที่ช่วยพัฒนาโมเดล!')
      setDialect('')
      setCentral('')
      clearAudio()
    } catch (err) {
      console.error(err)
      if (/Failed to fetch|NetworkError|ERR_/i.test(err.message)) {
        setError('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้ — เปิด backend ก่อน (รัน server/run.bat)')
      } else {
        setError('❌ ' + err.message)
      }
      setStatus('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="section">
      <h2>
        4. เสนอประโยคใหม่ <span className="badge">Contribute</span>
      </h2>
      <p className="info">
        ช่วยกันเพิ่มประโยคภาษาถิ่นและคำแปลไทยกลาง เพื่อพัฒนาความแม่นของโมเดล
      </p>

      <div className="field">
        <label htmlFor="suggestDialect">
          ประโยคภาษาถิ่น <span className="req">*</span>
        </label>
        <textarea
          id="suggestDialect"
          className="suggest-input"
          rows="2"
          value={dialect}
          onChange={(e) => setDialect(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="suggestCentral">
          คำแปลไทยกลาง <span className="req">*</span>
        </label>
        <textarea
          id="suggestCentral"
          className="suggest-input"
          rows="2"
          value={central}
          onChange={(e) => setCentral(e.target.value)}
        />
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="suggestCategory">หมวดหมู่</label>
          <select
            id="suggestCategory"
            className="suggest-input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="suggestRegion">ภาค</label>
          <select
            id="suggestRegion"
            className="suggest-input"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="suggestProvince">จังหวัด</label>
          <select
            id="suggestProvince"
            className="suggest-input"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
          >
            {(PROVINCES[region] || []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>
          แนบเสียงตัวอย่าง <span className="req">*</span>
        </label>
        <div className="suggest-audio">
          <button type="button" className="btn btn-secondary" onClick={toggleRecord}>
            {recording ? '⏹ หยุดอัด' : '🎙️ อัดเสียง'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            📁 เลือกไฟล์
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const f = e.target.files[0]
              if (f) setAudio(f, '📎 ' + f.name)
            }}
          />
          <span className="suggest-audio-name">{audioName}</span>
          {audioBlob && (
            <button
              type="button"
              className="icon-btn"
              title="ลบเสียงที่แนบ"
              onClick={clearAudio}
            >
              ✕
            </button>
          )}
        </div>
        {audioUrl && <audio src={audioUrl} controls />}
      </div>

      <div className="controls" style={{ marginTop: 8 }}>
        <button className="btn btn-primary" onClick={submit} disabled={submitting}>
          📨 ส่ง
        </button>
        <span className="status">{status}</span>
      </div>

      {error && (
        <p className="output-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
