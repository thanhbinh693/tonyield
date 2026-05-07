import React, { useState } from 'react'
import './ProfilePage.css'

// ─── Disconnect Wallet Modal ──────────────────────────────────────────────────
function DisconnectModal({ walletAddr, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)
  const short = walletAddr ? walletAddr.slice(0,6)+'...'+walletAddr.slice(-4) : 'UQBx...kX9f'

  const handle = () => {
    setLoading(true)
    setTimeout(() => { onConfirm(); setLoading(false); onClose() }, 700)
  }

  return (
    <div className="overlay" onClick={e => e.target.classList.contains('overlay') && onClose()}>
      <div className="sheet">
        <div className="handle"/>
        <h2 className="sheet-title">Disconnect Wallet</h2>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:48,marginBottom:12}}>💎</div>
          <div style={{color:'var(--muted)',fontSize:13,lineHeight:1.6}}>
            You are about to disconnect your TON wallet from TONYield.<br/>
            You can reconnect anytime to make deposits.
          </div>
        </div>
        <div style={{
          background:'var(--card2)',borderRadius:12,padding:'12px 16px',
          marginBottom:20,border:'1px solid var(--border)'
        }}>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:4}}>Connected wallet</div>
          <div style={{fontSize:14,color:'var(--blue)',fontFamily:'monospace'}}>{short}</div>
        </div>
        <div className="warning-bar" style={{marginBottom:20}}>
          ⚠ Active investments will remain running. Only deposits will require reconnection.
        </div>
        <button className="sheet-btn main" style={{background:'var(--red)',color:'#fff'}}
          onClick={handle} disabled={loading}>
          {loading ? 'Disconnecting...' : '⊗ Disconnect Wallet'}
        </button>
        <button className="sheet-btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

// ─── ProfilePage ──────────────────────────────────────────────────────────────
export default function ProfilePage({ user, referral, config, showToast, setIsAdmin, isAdmin, walletConnected, disconnectWallet }) {
  const [showDisconnect, setShowDisconnect] = useState(false)

  const refRate = config?.referralRate ?? 5

  const copyRef = () => {
    const link = referral.code?.startsWith('http')
      ? referral.code
      : `https://t.me/TONYieldBot?start=${referral.code}`
    navigator.clipboard?.writeText(link).catch(() => {})
    showToast('Referral link copied!')
  }

  const handleDisconnect = () => {
    if (disconnectWallet) disconnectWallet()
    showToast('Wallet disconnected')
  }

  const menu = [
    { icon: '◎', color: 'gold',  label: 'TON Wallet',        sub: user?.walletAddr ? (user.walletAddr.slice(0,8)+'...') : 'Not connected', action: () => showToast('Wallet settings') },
    { icon: '⊙', color: 'green', label: 'Support',           sub: '24/7 live chat',     action: () => showToast('Support opened') },
    { icon: '⊗', color: 'red',   label: 'Disconnect Wallet', sub: 'Unlink TON Connect', danger: true, action: () => setShowDisconnect(true) },
  ]

  return (
    <div className="page">
      <div style={{height:18}}/>

      <div className="prof-hero card">
        <div className="prof-hero-glow"/>
        <div className="avatar-svg-wrap">
          <svg viewBox="0 0 100 100" width="100" height="100" style={{overflow:'visible'}}>
            <defs>
              <filter id="profRingGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="2.5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="profRingGlowOuter" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="4" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            {/* Track rings */}
            <circle cx="50" cy="50" r="46" fill="none" stroke="#0d2a4a" strokeWidth="2"/>
            <circle cx="50" cy="50" r="39" fill="none" stroke="#0d2a4a" strokeWidth="2"/>
            <circle cx="50" cy="50" r="32" fill="none" stroke="#0d2a4a" strokeWidth="1.5"/>
            {/* Dim backdrop full rings */}
            <circle cx="50" cy="50" r="46" fill="none" stroke="#00d4ff" strokeWidth="2" opacity="0.06" strokeDasharray="289"/>
            <circle cx="50" cy="50" r="39" fill="none" stroke="#00aaff" strokeWidth="2" opacity="0.06" strokeDasharray="245"/>
            <circle cx="50" cy="50" r="32" fill="none" stroke="#00d4ff" strokeWidth="1.5" opacity="0.06" strokeDasharray="201"/>
            {/* Outer ring — cyan — spinning arc */}
            <circle cx="50" cy="50" r="46" fill="none" stroke="#00d4ff" strokeWidth="2.2"
              strokeDasharray="110 179" strokeLinecap="round" filter="url(#profRingGlowOuter)" opacity="0.95">
              <animateTransform attributeName="transform" type="rotate"
                from="0 50 50" to="360 50 50" dur="8s" repeatCount="indefinite"/>
            </circle>
            {/* Mid ring — electric blue — reverse */}
            <circle cx="50" cy="50" r="39" fill="none" stroke="#00aaff" strokeWidth="2"
              strokeDasharray="80 164" strokeLinecap="round" filter="url(#profRingGlow)" opacity="0.88">
              <animateTransform attributeName="transform" type="rotate"
                from="0 50 50" to="-360 50 50" dur="6s" repeatCount="indefinite"/>
            </circle>
            {/* Inner ring — bright cyan — fast spin */}
            <circle cx="50" cy="50" r="32" fill="none" stroke="#00eeff" strokeWidth="1.8"
              strokeDasharray="55 146" strokeLinecap="round" filter="url(#profRingGlow)" opacity="0.9">
              <animateTransform attributeName="transform" type="rotate"
                from="0 50 50" to="360 50 50" dur="3.5s" repeatCount="indefinite"/>
            </circle>
            {/* Ripple pulse */}
            <circle cx="50" cy="50" r="46" fill="none" stroke="#00d4ff" strokeWidth="1.5" opacity="0">
              <animate attributeName="r" values="46;68;46" dur="3s" begin="0s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.4;0;0.4" dur="3s" begin="0s" repeatCount="indefinite"/>
            </circle>
            <circle cx="50" cy="50" r="46" fill="none" stroke="#00aaff" strokeWidth="1" opacity="0">
              <animate attributeName="r" values="46;68;46" dur="3s" begin="1.1s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.25;0;0.25" dur="3s" begin="1.1s" repeatCount="indefinite"/>
            </circle>
            {/* Avatar circle */}
            <circle cx="50" cy="50" r="26" fill="var(--s2)"/>
            <text x="50" y="57" textAnchor="middle"
              style={{fontSize:24,fontWeight:600,fill:'var(--text)',fontFamily:'var(--font-display)'}}>
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </text>
          </svg>
        </div>
        <div className="prof-name">@{user?.username || 'username'}</div>
        <div className="prof-id">ID #{user?.id} · Member since Apr 2025</div>
        <div className="prof-stats">
          <div className="ps-item">
            <div className="ps-val">{user?.balance?.toFixed(1)}</div>
            <div className="ps-label">Balance</div>
          </div>
          <div className="ps-item">
            <div className="ps-val" style={{color:'var(--green)'}}>{user?.todayProfit?.toFixed(2)}</div>
            <div className="ps-label">Today</div>
          </div>
          <div className="ps-item">
            <div className="ps-val" style={{color:'var(--blue)'}}>{referral?.friends}</div>
            <div className="ps-label">Referrals</div>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="admin-hint" onClick={() => setIsAdmin(true)}>
          🛡 Admin Panel · Tap to enter
        </div>
      )}

      <div className="ref-full card">
        <div className="rf-header">
          <div>
            <div className="rf-title">Referral Program</div>
            <div className="rf-sub">Earn {refRate}% of every deposit your friends make</div>
          </div>
          <div className="rf-badge">{refRate}%</div>
        </div>
        <div className="rf-code-box">
          <span className="rf-code">{referral?.code}</span>
          <button className="copy-btn" onClick={copyRef}>Copy link</button>
        </div>
        <div className="rf-stats">
          <div className="rfs-item">
            <div className="rfs-val">{referral?.friends}</div>
            <div className="rfs-label">Friends joined</div>
          </div>
          <div className="rfs-item">
            <div className="rfs-val">{referral?.commission} TON</div>
            <div className="rfs-label">Commission earned</div>
          </div>
        </div>
      </div>

      <div className="menu-list card">
        {menu.map((item, i) => (
          <div key={i} className="menu-item" onClick={item.action}>
            <div className={`mi-icon ${item.color}`}>{item.icon}</div>
            <div className="mi-info">
              <div className="mi-label" style={item.danger ? {color:'var(--red)'} : {}}>{item.label}</div>
              <div className="mi-sub">{item.sub}</div>
            </div>
            <div className="mi-right">›</div>
          </div>
        ))}
      </div>

      <div className="app-version">TONYield v2.0 · {new Date().getFullYear()}</div>
      <div style={{height:8}}/>

      {showDisconnect && (
        <DisconnectModal
          walletAddr={user?.walletAddr}
          onClose={() => setShowDisconnect(false)}
          onConfirm={handleDisconnect}
        />
      )}
    </div>
  )
}
