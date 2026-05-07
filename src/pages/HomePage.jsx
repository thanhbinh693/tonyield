import React, { useState, useEffect, useRef } from 'react'
import { DAY_NAMES_FULL } from '../utils/config'
import './HomePage.css'

const TODAY_DOW = new Date().getDay()

function isPlanActiveToday(inv) {
  const days = inv.activeDays || [1,2,3,4,5]
  return days.includes(TODAY_DOW)
}

function getNextActiveDay(inv) {
  const days = (inv.activeDays || [1,2,3,4,5]).slice().sort((a,b)=>a-b)
  if (days.length === 0) return null
  // find next day after TODAY_DOW
  const next = days.find(d => d > TODAY_DOW) ?? days[0]
  return DAY_NAMES_FULL[next]
}

// ─── Plan Progress Ring + Ripple Wave ────────────────────────────────────────
function PlanRing({ inv, onActivate, onCollect }) {
  const [remaining, setRemaining] = useState(0)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, inv.nextProfitTime - Date.now())
      setRemaining(left)
      setExpired(left === 0)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [inv.nextProfitTime])

  const h = Math.floor(remaining / 3600000)
  const m = Math.floor((remaining % 3600000) / 60000)
  const s = Math.floor((remaining % 60000) / 1000)
  const fmt = n => String(n).padStart(2, '0')

  const planPct = Math.min(1, (inv.progress || 0) / 100)
  // Resolve intervalMs: priority profitIntervalMs > Minutes > Hours > default 24h
  const intervalMs = inv.intervalMs  // pre-computed by myInvestments
    || inv.profitIntervalMs
    || (inv.profitIntervalMinutes ? inv.profitIntervalMinutes * 60_000 : 0)
    || (inv.profitIntervalHours   ? inv.profitIntervalHours   * 3_600_000 : 0)
    || 86_400_000
  const dayPct = Math.min(1, 1 - remaining / intervalMs)

  const R_outer = 42, R_mid = 34, R_inner = 26
  const C = r => 2 * Math.PI * r
  const arc = (r, pct) => {
    const c = C(r)
    const filled = Math.max(0.01, pct) * c
    return `${filled.toFixed(2)} ${c.toFixed(2)}`
  }

  const colorMap = { gold: '#f5a623', blue: '#3d9be9', purple: '#9b6dff' }
  const ringColor = '#00d4ff'  // cosmic blue override for all plans
  const ringColorDim = '#00d4ff30'
  const ringColorMid = '#00aaff'
  const activeToday = isPlanActiveToday(inv)
  const nextActiveDay = getNextActiveDay(inv)

  // Not yet activated → show Activate button (or waiting if inactive day)
  if (!inv.activated) {
    if (!activeToday) {
      // Deposited on inactive day → show waiting state
      return (
        <div className="rings-wrap waiting">
          <svg viewBox="0 0 100 100" className="rings-svg">
            <circle cx="50" cy="50" r={R_outer} className="ring-track" strokeWidth="3.5"/>
            <circle cx="50" cy="50" r={R_mid}   className="ring-track" strokeWidth="2.5"/>
            <circle cx="50" cy="50" r={R_outer} fill="none" stroke={ringColor} strokeWidth="3.5"
              strokeDasharray={arc(R_outer, 0.15)} strokeLinecap="round" opacity="0.2"
              transform="rotate(-90 50 50)"/>
            <text x="50" y="48" className="ring-time-h" style={{fontSize:'8px'}}>Wait</text>
            <text x="50" y="59" className="ring-time-s" style={{fontSize:'7px'}}>{nextActiveDay}</text>
          </svg>
          <div className="waiting-label">Waiting for<br/>active day</div>
        </div>
      )
    }
    return (
      <div className="rings-wrap expired">
        <svg viewBox="0 0 100 100" className="rings-svg">
          <circle cx="50" cy="50" r={R_outer} className="ring-track" strokeWidth="3.5"/>
          <circle cx="50" cy="50" r={R_mid}   className="ring-track" strokeWidth="2.5"/>
          <circle cx="50" cy="50" r={R_inner} className="ring-track" strokeWidth="2"/>
          <circle cx="50" cy="50" r={R_outer} fill="none" stroke={ringColor} strokeWidth="3.5"
            strokeDasharray={arc(R_outer, 0.3)} strokeLinecap="round" opacity="0.25"
            transform="rotate(-90 50 50)"/>
        </svg>
        <button className="activate-btn" onClick={() => onActivate(inv.id)}>
          <span className="activate-icon">▶</span>
          <span>Activate</span>
        </button>
      </div>
    )
  }

  // Activated but today is inactive day → show paused state
  if (!activeToday) {
    return (
      <div className="rings-wrap paused">
        <svg viewBox="0 0 100 100" className="rings-svg">
          <circle cx="50" cy="50" r={R_outer} className="ring-track" strokeWidth="3.5"/>
          <circle cx="50" cy="50" r={R_mid}   className="ring-track" strokeWidth="2.5"/>
          <circle cx="50" cy="50" r={R_inner} className="ring-track" strokeWidth="2"/>
          <circle cx="50" cy="50" r={R_outer} fill="none" stroke={ringColor} strokeWidth="3.5"
            strokeDasharray={arc(R_outer, planPct)} strokeLinecap="round" opacity="0.35"
            transform="rotate(-90 50 50)"/>
          <text x="50" y="46" className="ring-time-h" style={{fontSize:'9px',opacity:.6}}>Pause</text>
          <text x="50" y="58" className="ring-time-s" style={{fontSize:'8px',opacity:.6}}>off</text>
        </svg>
        <div className="paused-label">Resumes<br/>{nextActiveDay}</div>
      </div>
    )
  }

  if (expired) return null

  return (
    <div className="rings-wrap">
      <svg viewBox="0 0 100 100" className="rings-svg" style={{overflow:'visible'}}>
        <defs>
          <filter id="ringGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="ringGlowStrong" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {/* Track rings - dark subtle */}
        <circle cx="50" cy="50" r={R_outer} fill="none" stroke="#0d2a4a" strokeWidth="3.5"/>
        <circle cx="50" cy="50" r={R_mid}   fill="none" stroke="#0d2a4a" strokeWidth="2.5"/>
        <circle cx="50" cy="50" r={R_inner} fill="none" stroke="#0d2a4a" strokeWidth="2"/>
        {/* Dim glow backdrop */}
        <circle cx="50" cy="50" r={R_outer} fill="none" stroke="#00d4ff" strokeWidth="3.5"
          strokeDasharray={arc(R_outer, 1)} strokeLinecap="round" opacity="0.07"/>
        <circle cx="50" cy="50" r={R_mid}   fill="none" stroke="#00aaff" strokeWidth="2.5"
          strokeDasharray={arc(R_mid, 1)}   strokeLinecap="round" opacity="0.07"/>
        <circle cx="50" cy="50" r={R_inner} fill="none" stroke="#00d4ff" strokeWidth="2"
          strokeDasharray={arc(R_inner, 1)} strokeLinecap="round" opacity="0.07"/>
        {/* Outer ring — plan progress — bright cyan */}
        <circle cx="50" cy="50" r={R_outer} fill="none" stroke="#00d4ff" strokeWidth="3.5"
          strokeDasharray={arc(R_outer, planPct)} strokeLinecap="round"
          filter="url(#ringGlow)" opacity="0.95">
          <animateTransform attributeName="transform" type="rotate"
            from="-90 50 50" to="270 50 50" dur="20s" repeatCount="indefinite"/>
        </circle>
        {/* Mid ring — day progress — electric blue */}
        <circle cx="50" cy="50" r={R_mid} fill="none" stroke="#00aaff" strokeWidth="2.5"
          strokeDasharray={arc(R_mid, dayPct)} strokeLinecap="round"
          filter="url(#ringGlow)" opacity="0.85">
          <animateTransform attributeName="transform" type="rotate"
            from="-90 50 50" to="-450 50 50" dur="14s" repeatCount="indefinite"/>
        </circle>
        {/* Inner ring — spin accent — bright cyan */}
        <circle cx="50" cy="50" r={R_inner} fill="none" stroke="#00eeff" strokeWidth="2"
          strokeDasharray={arc(R_inner, 0.35)} strokeLinecap="round"
          filter="url(#ringGlowStrong)" opacity="0.9">
          <animateTransform attributeName="transform" type="rotate"
            from="-90 50 50" to="270 50 50" dur="5s" repeatCount="indefinite"/>
        </circle>
        {/* Pulse ripples */}
        <circle cx="50" cy="50" r="16" fill="none" stroke="#00d4ff" strokeWidth="1.5" opacity="0">
          <animate attributeName="r" values="16;50;16" dur="3.5s" begin="0s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.5;0;0.5" dur="3.5s" begin="0s" repeatCount="indefinite"/>
        </circle>
        <circle cx="50" cy="50" r="16" fill="none" stroke="#00aaff" strokeWidth="1" opacity="0">
          <animate attributeName="r" values="16;50;16" dur="3.5s" begin="1.2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.3;0;0.3" dur="3.5s" begin="1.2s" repeatCount="indefinite"/>
        </circle>
        <text x="50" y="46" className="ring-time-h">{fmt(h)}:{fmt(m)}</text>
        <text x="50" y="57" className="ring-time-s">{fmt(s)}s</text>
      </svg>
    </div>
  )
}

const txIcon  = { profit:'◎', deposit:'↓', withdraw:'↑', referral:'⊕' }
const txClass = { profit:'p',  deposit:'d', withdraw:'w', referral:'r'  }

const statusBadge = (s) => {
  const map = { completed:'badge-ok', approved:'badge-ok', done:'badge-ok', rejected:'badge-err', failed:'badge-err' }
  const lbl = { completed:'Done', approved:'Done', done:'Done', rejected:'Failed', failed:'Failed' }
  return <span className={`tx-badge ${map[s]||''}`}>{lbl[s]||s}</span>
}

function getDayLabel(ts) {
  if (!ts) return 'Unknown'
  const d = new Date(ts)
  const today = new Date(); today.setHours(0,0,0,0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1)
  const day = new Date(d); day.setHours(0,0,0,0)
  if (day.getTime() === today.getTime()) return 'Today'
  if (day.getTime() === yesterday.getTime()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
}

function groupTxByDay(txs) {
  const groups = []
  const seen = {}
  txs.forEach(tx => {
    const ts = tx.createdAt || Date.now()
    const label = getDayLabel(ts)
    if (!seen[label]) { seen[label] = []; groups.push({ label, items: seen[label] }) }
    seen[label].push(tx)
  })
  return groups
}

export default function HomePage({ user, investments, transactions, plans, config, referral, onDeposit, onWithdraw, setTab, setIsAdmin, isAdmin, isAdminView, activateInvestment, collectProfit }) {
  const logoRef = useRef(null)
  const pressRef = useRef(null)
  const [showAllTx, setShowAllTx] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)

  // Determine today's inactive plans
  const inactivePlans = (plans || []).filter(p => !(p.activeDays || [1,2,3,4,5]).includes(TODAY_DOW))
  const hasInactiveToday = inactivePlans.length > 0
  const todayLabel = DAY_NAMES_FULL[TODAY_DOW]

  // long-press logo → toggle admin view
  const handlePressStart = () => {
    pressRef.current = setTimeout(() => { setIsAdmin(v => !v) }, 1800)
  }
  const handlePressEnd = () => clearTimeout(pressRef.current)

  return (
    <div className="page">
      {/* Header */}
      <div className="hp-header">
        <div className="brand">
          <div className="brand-logo-wrap" ref={logoRef}
            onMouseDown={handlePressStart} onMouseUp={handlePressEnd}
            onTouchStart={handlePressStart} onTouchEnd={handlePressEnd}>
            <div className="brand-logo-fire">
              {/* Fire SVG centered on T */}
              <svg className="fire-svg" viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg">
                {/* Outer glow */}
                <defs>
                  <radialGradient id="fireGlow" cx="50%" cy="65%" r="50%">
                    <stop offset="0%" stopColor="#ff6a00" stopOpacity="0.9"/>
                    <stop offset="40%" stopColor="#ff3d00" stopOpacity="0.5"/>
                    <stop offset="100%" stopColor="#ff0000" stopOpacity="0"/>
                  </radialGradient>
                  <radialGradient id="coreGlow" cx="50%" cy="60%" r="40%">
                    <stop offset="0%" stopColor="#fff5a0" stopOpacity="1"/>
                    <stop offset="50%" stopColor="#ffb300" stopOpacity="0.8"/>
                    <stop offset="100%" stopColor="#ff4500" stopOpacity="0"/>
                  </radialGradient>
                  <filter id="blur1" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5"/>
                  </filter>
                  <filter id="blur2" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur stdDeviation="5"/>
                  </filter>
                </defs>
                {/* Background wide glow - extends outside box */}
                <ellipse cx="30" cy="52" rx="28" ry="18" fill="url(#fireGlow)" filter="url(#blur2)" opacity="0.9">
                  <animate attributeName="ry" values="18;22;16;20;18" dur="2.1s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.9;0.6;1;0.7;0.9" dur="2.1s" repeatCount="indefinite"/>
                </ellipse>
                {/* Main flame body left */}
                <path d="M22 58 Q16 45 20 35 Q14 42 12 52 Q8 38 18 28 Q15 34 19 40 Q20 25 28 18 Q24 30 26 38 Q30 22 30 10 Q34 22 34 38 Q36 30 32 18 Q40 25 41 40 Q45 34 42 28 Q52 38 48 52 Q46 42 40 35 Q44 45 38 58 Z" 
                  fill="#ff4500" opacity="0.7">
                  <animate attributeName="d" 
                    values="M22 58 Q16 45 20 35 Q14 42 12 52 Q8 38 18 28 Q15 34 19 40 Q20 25 28 18 Q24 30 26 38 Q30 22 30 10 Q34 22 34 38 Q36 30 32 18 Q40 25 41 40 Q45 34 42 28 Q52 38 48 52 Q46 42 40 35 Q44 45 38 58 Z;M24 58 Q17 46 21 34 Q13 43 11 53 Q7 37 19 27 Q16 33 20 41 Q21 24 29 16 Q25 29 27 37 Q31 21 30 9 Q35 23 33 39 Q37 29 31 17 Q41 24 42 41 Q47 33 43 27 Q53 37 49 53 Q47 43 41 34 Q45 46 36 58 Z;M22 58 Q16 45 20 35 Q14 42 12 52 Q8 38 18 28 Q15 34 19 40 Q20 25 28 18 Q24 30 26 38 Q30 22 30 10 Q34 22 34 38 Q36 30 32 18 Q40 25 41 40 Q45 34 42 28 Q52 38 48 52 Q46 42 40 35 Q44 45 38 58 Z"
                    dur="0.8s" repeatCount="indefinite"/>
                </path>
                {/* Inner bright flame */}
                <path d="M26 56 Q22 46 25 38 Q21 43 22 50 Q19 39 26 32 Q24 38 26 43 Q28 30 30 22 Q32 30 34 43 Q36 38 34 32 Q41 39 38 50 Q39 43 35 38 Q38 46 34 56 Z"
                  fill="#ffb300" opacity="0.85">
                  <animate attributeName="d"
                    values="M26 56 Q22 46 25 38 Q21 43 22 50 Q19 39 26 32 Q24 38 26 43 Q28 30 30 22 Q32 30 34 43 Q36 38 34 32 Q41 39 38 50 Q39 43 35 38 Q38 46 34 56 Z;M27 56 Q23 47 26 37 Q20 44 21 51 Q18 38 27 31 Q25 37 27 44 Q29 29 30 20 Q31 29 33 44 Q35 37 33 31 Q42 38 39 51 Q40 44 36 37 Q39 47 33 56 Z;M26 56 Q22 46 25 38 Q21 43 22 50 Q19 39 26 32 Q24 38 26 43 Q28 30 30 22 Q32 30 34 43 Q36 38 34 32 Q41 39 38 50 Q39 43 35 38 Q38 46 34 56 Z"
                    dur="0.6s" repeatCount="indefinite"/>
                </path>
                {/* Core white-yellow */}
                <ellipse cx="30" cy="48" rx="6" ry="9" fill="url(#coreGlow)" filter="url(#blur1)">
                  <animate attributeName="ry" values="9;11;8;10;9" dur="0.5s" repeatCount="indefinite"/>
                </ellipse>
              </svg>
              {/* The T letter */}
              <span className="brand-logo-T">T</span>
            </div>
          </div>
          <div className="brand-name">TON<em>Yield</em></div>
        </div>
        <div className="header-right">
          {isAdmin && !isAdminView && (
            <div className="admin-badge enter-admin" onClick={() => setIsAdmin(true)} title="Enter Admin Panel">
              🛡 ADMIN
            </div>
          )}
          {isAdminView && (
            <div className="admin-badge active-admin" onClick={() => setTab('admin')}>
              ▶ Panel
            </div>
          )}
          <div className="notif-btn">🔔</div>
        </div>
      </div>

      {/* Balance Hero */}
      <div className="bal-hero">
        <div className="bal-tag">Total Portfolio</div>
        <div className="bal-num">{user?.balance?.toFixed(2)} <span>TON</span></div>
        <div className="bal-profit">
          <span className="green-dot" /><span className="green">+{user?.todayProfit?.toFixed(2)} TON today</span>
        </div>
        <div className="bal-btns">
          <button className="bb dep" onClick={onDeposit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
            Deposit
          </button>
          <button className="bb wit" onClick={onWithdraw}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
            Withdraw
          </button>
        </div>
      </div>

      {/* Status row */}
      <div className="status-row">
        <div className="status-pill">
          {hasInactiveToday
            ? <><div className="sp-dot orange"/><div><div className="sp-label">Today: {todayLabel}</div><div className="sp-val" style={{color:'var(--gold)'}}>Some plans paused</div></div></>
            : <><div className="sp-dot green"/><div><div className="sp-label">Today profit</div><div className="sp-val" style={{color:'var(--green)'}}>+{user?.todayProfit?.toFixed(2)} TON</div></div></>
          }
        </div>
        <div className="status-pill">
          <div className="sp-dot blue"/>
          <div>
            <div className="sp-label">Active plans</div>
            <div className="sp-val">{investments.length} running</div>
          </div>
        </div>
      </div>

      {/* Inactive day banner */}
      {hasInactiveToday && (
        <div className="inactive-day-banner">
          <span className="idb-icon">⏸</span>
          <div className="idb-text">
            <div className="idb-title">{todayLabel} — Some plans paused</div>
            <div className="idb-sub">
              {inactivePlans.map(p => p.name).join(', ')} paused today · Collect only
            </div>
          </div>
        </div>
      )}

      {/* Investments with plan rings */}
      <div className="sec">
        <div className="sec-hdr">
          <div className="sec-title">My Investments</div>
          <div className="sec-link" onClick={() => setTab('plans')}>+ Invest more</div>
        </div>
        {investments.length === 0 && (
          <div className="empty-state">
            <div className="es-icon">◎</div>
            <div className="es-text">No active investments</div>
            <button className="es-btn" onClick={() => setTab('plans')}>Start investing</button>
          </div>
        )}
        {investments.map(inv => {
          const activeToday = isPlanActiveToday(inv)
          return (
            <div key={inv.id} className={`inv-card ${inv.planColor} ${!activeToday ? 'inv-paused' : ''}`}>
              {!activeToday && (
                <div className="inv-pause-ribbon">⏸ Paused today · {getNextActiveDay(inv)}</div>
              )}
              <div className="inv-main">
                <div className="inv-left">
                  <div className="inv-badge-row">
                    <span className={`inv-badge ${inv.planColor}`}>{inv.plan}</span>
                  </div>
                  {inv.invoiceId && (
                    <div className="inv-id-row">
                      <span className="inv-id-lbl">Basis ID</span>
                      <span className="inv-id-val">{inv.invoiceId}</span>
                    </div>
                  )}
                  <div className="inv-amount">{inv.amount} <span>TON</span></div>
                  <div className="inv-rate">
                    {(() => {
                      const ms = inv.intervalMs
                        || inv.profitIntervalMs
                        || (inv.profitIntervalMinutes ? inv.profitIntervalMinutes * 60_000 : 0)
                        || (inv.profitIntervalHours   ? inv.profitIntervalHours   * 3_600_000 : 0)
                        || 86_400_000
                      if (ms < 3_600_000)  return `${inv.rate}% / ${Math.round(ms/60_000)}min`
                      if (ms < 86_400_000) return `${inv.rate}% / ${Math.round(ms/3_600_000)}hr`
                      return `${inv.rate}% / day`
                    })()}
                  </div>
                  <div className="inv-earned-row">
                    <span className="inv-earned-lbl">Profit ID {inv.invoiceId || '—'}</span>
                    <span className="inv-earned">+{(inv.earned||0).toFixed(2)} TON</span>
                  </div>
                  <div className="pbar-wrap">
                    <div className="pbar"><div className={`pbar-fill ${inv.planColor}`} style={{width:`${inv.progress}%`}}/></div>
                    <div className="pbar-meta">{inv.progress}% · {inv.timeLeftLabel}</div>
                  </div>
                </div>
                <div className="inv-right">
                  <PlanRing inv={inv} onActivate={activateInvestment} onCollect={collectProfit} />
                  <div className="inv-countdown-label">
                    {!activeToday ? 'Paused today' : 'Next profit'}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Referral mini */}
      <div className="sec">
        <div className="ref-mini" onClick={() => setTab('profile')}>
          <div className="rm-left">
            <div className="rm-icon">⊕</div>
            <div>
              <div className="rm-label">Invite friends · Earn {config?.referralRate ?? 5}%</div>
              <div className="rm-sub">{referral?.friends ?? 0} friends joined · {(referral?.commission ?? 0).toFixed(2)} TON earned</div>
            </div>
          </div>
          <div className="rm-arrow">›</div>
        </div>
      </div>

      {/* Transactions */}
      <div className="sec">
        <div className="sec-hdr">
          <div className="sec-title">Transaction History</div>
        </div>
        {transactions.length === 0 && (
          <div className="tx-empty">No transactions yet</div>
        )}
        {transactions.length > 0 && (() => {
          const groups = groupTxByDay(transactions)
          const activeDay = selectedDay || groups[0]?.label
          const activeItems = groups.find(g => g.label === activeDay)?.items || []
          return (
            <>
              {/* Day tab strip — swipe left/right */}
              <div className="tx-day-strip">
                {groups.map(g => (
                  <button
                    key={g.label}
                    className={`tx-day-tab ${activeDay === g.label ? 'active' : ''}`}
                    onClick={() => setSelectedDay(g.label)}
                  >{g.label}</button>
                ))}
              </div>
              {/* Transactions for selected day */}
              <div className="tx-list card">
                {activeItems.map(tx => (
                  <div key={tx.id} className="tx-row">
                    <div className={`tx-ico ${txClass[tx.type]}`}>{txIcon[tx.type]}</div>
                    <div className="tx-inf">
                      <div className="tx-n">{tx.label}</div>
                      {tx.invoiceId && <div className="tx-id">ID {tx.invoiceId}</div>}
                    </div>
                    <div className="tx-right">
                      <div className={`tx-a ${tx.amount > 0 ? 'pos' : 'neg'}`}>{tx.amount > 0 ? '+' : ''}{Math.abs(tx.amount).toFixed(2)}</div>
                      {statusBadge(tx.status)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        })()}
      </div>
      <div style={{height:8}}/>
    </div>
  )
}