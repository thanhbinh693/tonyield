import React from 'react'
import './BottomNav.css'

export default function BottomNav({ tab, setTab, isAdmin }) {
  const tabs = [
    { id: 'home',    label: 'Home',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6"/></svg> },
    { id: 'plans',   label: 'Invest',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg> },
    { id: 'profile', label: 'Profile',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> }] : []),
  ]

  return (
    <nav className="bnav">
      {tabs.map(t => (
        <div key={t.id} className={`ni ${tab===t.id?'on':''} ${t.id==='admin'?'admin-tab':''}`} onClick={() => setTab(t.id)}>
          <div className="ni-ico">{t.icon}</div>
          <span className="ni-lbl">{t.label}</span>
          {tab === t.id && <div className="ni-active-dot"/>}
        </div>
      ))}
    </nav>
  )
}
