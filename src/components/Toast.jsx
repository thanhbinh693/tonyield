import React, { useEffect, useState } from 'react'
import './Toast.css'

export default function Toast({ msg, type }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])
  return (
    <div className={`toast ${type} ${visible ? 'in' : ''}`}>
      <span className="toast-icon">{type === 'ok' ? '✓' : '✗'}</span>
      <span>{msg}</span>
    </div>
  )
}
