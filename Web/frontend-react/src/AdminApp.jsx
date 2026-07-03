import { useCallback, useEffect, useState } from 'react'

const STATUS_LABEL = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ' }
const FILTERS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'pending', label: 'รออนุมัติ' },
  { value: 'approved', label: 'อนุมัติแล้ว' },
  { value: 'rejected', label: 'ปฏิเสธ' },
]
const EMPTY = { items: [], counts: { pending: 0, approved: 0, rejected: 0 }, total: 0 }

export default function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem('adminToken') || '')
  const [user, setUser] = useState(() => localStorage.getItem('adminUser') || '')
  const [authed, setAuthed] = useState(false)
  const [data, setData] = useState(EMPTY)
  const [filter, setFilter] = useState('')
  const [statusMsg, setStatusMsg] = useState('')

  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginErr, setLoginErr] = useState('')

  // อ่านโทเคนจาก localStorage ตรง ๆ ทุกครั้ง (เป็น source of truth) เลี่ยงปัญหา stale closure
  const authFetch = useCallback(async (url, opts = {}) => {
    const t = localStorage.getItem('adminToken') || ''
    const res = await fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), 'X-Admin-Token': t },
    })
    if (res.status === 401) {
      localStorage.removeItem('adminToken')
      setToken('')
      setAuthed(false)
      throw new Error('unauthorized')
    }
    return res
  }, [])

  const load = useCallback(
    async (status = filter) => {
      setStatusMsg('⏳ กำลังโหลด...')
      try {
        const url = '/suggest/list' + (status ? `?status=${encodeURIComponent(status)}` : '')
        const res = await authFetch(url)
        if (!res.ok) throw new Error('HTTP ' + res.status)
        setData(await res.json())
        setAuthed(true)
        setStatusMsg('')
      } catch (err) {
        if (err.message === 'unauthorized') return
        setStatusMsg('❌ โหลดไม่ได้ — เปิด backend หรือยัง? (' + err.message + ')')
      }
    },
    [authFetch, filter],
  )

  // โหลดครั้งแรกถ้ามีโทเคนเก็บไว้ (ถ้าโทเคนหมดอายุ -> 401 -> เด้งไปหน้า login)
  useEffect(() => {
    if (localStorage.getItem('adminToken')) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doLogin = async () => {
    setLoginErr('')
    try {
      const fd = new FormData()
      fd.append('username', loginUser.trim())
      fd.append('password', loginPass)
      const res = await fetch('/admin/login', { method: 'POST', body: fd })
      if (res.status === 401) {
        setLoginErr('❌ ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
        return
      }
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const d = await res.json()
      localStorage.setItem('adminToken', d.token)
      localStorage.setItem('adminUser', loginUser.trim())
      setToken(d.token)
      setUser(loginUser.trim())
      setLoginPass('')
      load(filter)
    } catch (err) {
      setLoginErr('❌ เข้าสู่ระบบไม่ได้ — เปิด backend หรือยัง? (' + err.message + ')')
    }
  }

  const logout = () => {
    localStorage.removeItem('adminToken')
    localStorage.removeItem('adminUser')
    setToken('')
    setUser('')
    setAuthed(false)
    setStatusMsg('')
  }

  const changeFilter = (value) => {
    setFilter(value)
    load(value)
  }

  const setItemStatus = async (id, status) => {
    try {
      const fd = new FormData()
      fd.append('status', status)
      const res = await authFetch(`/suggest/${id}/status`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      load()
    } catch (err) {
      if (err.message === 'unauthorized') return
      setStatusMsg('❌ อัปเดตสถานะไม่ได้ (' + err.message + ')')
    }
  }

  const del = async (id) => {
    if (!window.confirm(`ลบรายการ #${id} ? (ลบไฟล์เสียงด้วย ถ้ามี)`)) return
    try {
      const res = await authFetch(`/suggest/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      load()
    } catch (err) {
      if (err.message === 'unauthorized') return
      setStatusMsg('❌ ลบไม่ได้ (' + err.message + ')')
    }
  }

  const resetAll = async () => {
    if (
      !window.confirm(
        '⚠️ ลบทุกรายการ + ไฟล์เสียงทั้งหมด แล้วรีเซ็ตเลข id ให้เริ่มที่ 1 ใหม่?\nการกระทำนี้ย้อนกลับไม่ได้',
      )
    )
      return
    if (window.prompt('ยืนยันอีกครั้ง — พิมพ์คำว่า  ล้าง  แล้วกดตกลง') !== 'ล้าง') {
      setStatusMsg('ยกเลิกการล้างข้อมูลแล้ว')
      return
    }
    try {
      const res = await authFetch('/suggest/reset_all', { method: 'POST' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const d = await res.json()
      setFilter('')
      await load('')
      setStatusMsg(
        `🧹 ล้างข้อมูลทั้งหมดแล้ว (ลบ ${d.deleted_rows} รายการ, ${d.deleted_audio} ไฟล์เสียง) — รายการถัดไปจะเริ่มที่ id 1`,
      )
    } catch (err) {
      if (err.message === 'unauthorized') return
      setStatusMsg('❌ ล้างข้อมูลไม่ได้ (' + err.message + ')')
    }
  }

  // ลิงก์ดาวน์โหลด/เสียง แนบ token เป็น query (require_admin รับทั้ง header และ ?token=)
  const withToken = (path, params = {}) => {
    const qs = new URLSearchParams({ token, ...params })
    return `${path}?${qs.toString()}`
  }
  const csvHref = withToken('/suggest/export.csv', filter ? { status: filter } : {})
  const zipHref = withToken('/suggest/export.zip', filter ? { status: filter } : {})
  const datasetHref = withToken('/suggest/export_dataset.zip') // เฉพาะ approved เสมอ

  if (!authed) {
    return (
      <div className="container">
        <div className="page-head">
          <h1>🛠️ ADMIN</h1>
        </div>
        <div className="login-panel">
          <h2>🔐 เข้าสู่ระบบผู้ดูแล</h2>
          <input
            type="text"
            placeholder="ชื่อผู้ใช้"
            autoComplete="username"
            value={loginUser}
            onChange={(e) => setLoginUser(e.target.value)}
          />
          <input
            type="password"
            placeholder="รหัสผ่าน"
            autoComplete="current-password"
            value={loginPass}
            onChange={(e) => setLoginPass(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doLogin()}
          />
          <button className="btn btn-primary" onClick={doLogin}>
            เข้าสู่ระบบ
          </button>
          {loginErr && <p className="login-err">{loginErr}</p>}
        </div>
      </div>
    )
  }

  const items = data.items || []
  return (
    <div className="container">
      <div className="page-head">
        <h1>🛠️ ADMIN</h1>
        <div className="user-box">
          <div className="user-chip">
            <span className="user-avatar">{user ? user[0] : '·'}</span>
            <span className="uname">{user || '—'}</span>
          </div>
          <button className="btn btn-clear btn-sm" onClick={logout}>
            🚪 ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="warn-banner">
        ⚠️ หน้านี้ลบข้อมูลได้ — อย่าแชร์ชื่อผู้ใช้/รหัสผ่านให้คนอื่น
      </div>

      <div className="metrics">
        <div className="metric total">
          <div className="label">ทั้งหมด</div>
          <div className="value">{data.total}</div>
        </div>
        <div className="metric pending">
          <div className="label">รออนุมัติ</div>
          <div className="value">{data.counts.pending}</div>
        </div>
        <div className="metric approved">
          <div className="label">อนุมัติแล้ว</div>
          <div className="value">{data.counts.approved}</div>
        </div>
        <div className="metric rejected">
          <div className="label">ปฏิเสธ</div>
          <div className="value">{data.counts.rejected}</div>
        </div>
      </div>

      <div className="admin-bar">
        <div className="filter-group" role="group" aria-label="กรองตามสถานะ">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={'filter-btn' + (filter === f.value ? ' active' : '')}
              onClick={() => changeFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          className="icon-action"
          title="รีเฟรชรายการ"
          aria-label="รีเฟรชรายการ"
          onClick={() => load()}
        >
          🔄
        </button>
      </div>

      <div className="action-bar">
        <span className="action-label">⬇️ ดาวน์โหลด</span>
        <a className="btn btn-secondary btn-sm" href={csvHref} title="เฉพาะตาราง CSV ตามตัวกรองที่เลือก">
          📄 CSV
        </a>
        <a className="btn btn-secondary btn-sm" href={zipHref} title="CSV + ไฟล์เสียงทั้งหมด (ตามตัวกรอง)">
          📦 CSV + เสียง
        </a>
        <a
          className="btn btn-secondary btn-sm"
          href={datasetHref}
          title="ZIP พร้อมเทรนใน notebook (train_data.csv + เสียง .wav แยกตามภาค) — เฉพาะที่อนุมัติแล้ว"
        >
          🎓 Dataset เทรน
        </a>
        <span className="spacer" />
        <button
          className="btn btn-danger btn-sm"
          title="ลบทุกรายการ + ไฟล์เสียงทั้งหมด แล้วรีเซ็ตเลข id (ย้อนกลับไม่ได้)"
          onClick={resetAll}
        >
          🧨 ล้างทั้งหมด
        </button>
      </div>

      <div className="status">{statusMsg}</div>

      <div className="table-wrap">
        <table className="admin">
          <thead>
            <tr>
              <th>ประโยคภาษาถิ่น</th>
              <th>คำแปลไทยกลาง</th>
              <th>หมวด</th>
              <th>ภาค/จังหวัด</th>
              <th>เสียง</th>
              <th>สถานะ</th>
              <th>เวลา</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.dialect_text || '—'}</td>
                <td>{it.central_text || '—'}</td>
                <td>{it.category || '—'}</td>
                <td>{[it.region, it.province].filter(Boolean).join(' / ') || '—'}</td>
                <td>
                  {it.audio_path ? (
                    <audio
                      controls
                      preload="none"
                      src={withToken(`/suggest/audio/${encodeURIComponent(it.audio_path)}`)}
                    />
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <span className={'pill ' + it.status}>
                    {STATUS_LABEL[it.status] || it.status}
                  </span>
                </td>
                <td className="time">{(it.created_at || '').replace('T', ' ') || '—'}</td>
                <td>
                  <div className="row-actions">
                    {it.status !== 'approved' && (
                      <button
                        className="mini-btn approve"
                        onClick={() => setItemStatus(it.id, 'approved')}
                      >
                        ✓ อนุมัติ
                      </button>
                    )}
                    {it.status !== 'rejected' && (
                      <button
                        className="mini-btn reject"
                        onClick={() => setItemStatus(it.id, 'rejected')}
                      >
                        ✕ ปฏิเสธ
                      </button>
                    )}
                    <button className="mini-btn del" onClick={() => del(it.id)}>
                      🗑 ลบ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length === 0 && <div className="empty">— ยังไม่มีรายการ —</div>}
    </div>
  )
}
