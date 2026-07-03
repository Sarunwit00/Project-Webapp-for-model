import { useEffect, useRef, useState } from 'react'

export default function UploadSection({ busy, onTranscribe }) {
  const [file, setFile] = useState(null)
  const [fileUrl, setFileUrl] = useState(null)
  const [dragover, setDragover] = useState(false)
  const inputRef = useRef(null)
  const urlRef = useRef(null)

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  const handleFile = (f) => {
    if (!f) return
    const ok =
      f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|webm|aac|flac)$/i.test(f.name)
    if (!ok) {
      alert('กรุณาเลือกไฟล์เสียงเท่านั้น')
      return
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(f)
    urlRef.current = url
    setFile(f)
    setFileUrl(url)
  }

  const clearFile = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setFile(null)
    setFileUrl(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="section">
      <h2>
        2. อัปโหลดไฟล์เสียง <span className="badge">File</span>
      </h2>

      <div
        className={'dropzone' + (dragover ? ' dragover' : '')}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragover(true)
        }}
        onDragLeave={() => setDragover(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragover(false)
          if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0])
        }}
      >
        <div className="icon">📁</div>
        <p>
          <strong>คลิกเพื่อเลือกไฟล์</strong> หรือ ลากไฟล์มาวาง
        </p>
        <p style={{ fontSize: 13 }}>รองรับ .mp3, .wav, .m4a</p>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files.length && handleFile(e.target.files[0])}
        />
      </div>

      {file && (
        <div className="file-name">
          📎 {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
        </div>
      )}

      {fileUrl && (
        <div className="audio-row">
          <audio src={fileUrl} controls />
          <button
            className="icon-btn"
            title="ลบไฟล์เสียง"
            aria-label="ลบไฟล์เสียง"
            onClick={clearFile}
          >
            ✕
          </button>
        </div>
      )}

      {file && (
        <div className="controls" style={{ marginTop: 12 }}>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => onTranscribe(file)}
          >
            🤖 ถอดเสียงด้วยโมเดล
          </button>
        </div>
      )}
    </div>
  )
}
