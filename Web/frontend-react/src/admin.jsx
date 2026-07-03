import React from 'react'
import ReactDOM from 'react-dom/client'
import AdminApp from './AdminApp.jsx'
import './styles.css' // ธีมพื้นฐาน (ตัวแปรสี, .btn, .container ฯลฯ)
import './admin.css' // สไตล์เฉพาะหน้า admin

ReactDOM.createRoot(document.getElementById('admin-root')).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>,
)
