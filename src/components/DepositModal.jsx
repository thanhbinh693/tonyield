import React, { useState, useEffect } from 'react'
import './Modal.css'

const colorMap = { gold: '#f0b429', blue: '#3b9eff', purple: '#8b5cf6' }

function detectPlan(plans, amount) {
  const amt = parseFloat(amount) || 0
  if (!amt) return null
  const eligible = plans.filter(p => amt >= p.min && (!p.max || amt <= p.max))
  if (eligible.length === 0) return null
  return eligible[eligible.length - 1]
}

export default function DepositModal({ plans, defaultPlan, onClose, showToast, onSubmit, walletConnected, onConnectWallet, userBalance }) {
  const [amount, setAmount] = useState(defaultPlan ? String(defaultPlan.min) : '')
  const [step, setStep]     = useState(walletConnected ? 'deposit' : 'connect')
  const [loading, setLoading] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('wallet') // 'wallet' | 'balance'

  const autoPlan = detectPlan(plans, amount)
  const amt = parseFloat(amount) || 0
  const activeDaysPerWeek = autoPlan ? (autoPlan.activeDays || [1,2,3,4,5]).length : 5
  const activeDaysInTerm = autoPlan
    ? Math.round((autoPlan.activeDays || [1,2,3,4,5]).length / 7 * (autoPlan.duration || 30))
    : 22
  const daily   = autoPlan && amt ? (amt * autoPlan.rate / 100).toFixed(3) : null
  const weekly  = daily ? (parseFloat(daily) * activeDaysPerWeek).toFixed(3) : null
  const monthly = daily ? (parseFloat(daily) * activeDaysInTerm).toFixed(3) : null
  const amountValid = autoPlan && amt >= autoPlan.min && (!autoPlan.max || amt <= autoPlan.max)

  // If wallet connects while modal is open, advance to deposit step
  useEffect(() => {
    if (walletConnected && step === 'connect') setStep('deposit')
  }, [walletConnected])

  const handleConnectWallet = async () => {
    setLoading(true)
    try {
      await onConnectWallet()
      // step will update via useEffect once walletConnected flips
    } catch (e) {
      showToast('Connection failed. Try again.', 'err')
    }
    setLoading(false)
  }

  const handleConfirm = async () => {
    if (paymentMethod === 'wallet' && !walletConnected) { setStep('connect'); return }
    if (!amountValid) {
      showToast(autoPlan ? `Amount out of range for ${autoPlan.name}` : `Min ${plans[0]?.min || 10} TON required`, 'err')
      return
    }
    if (paymentMethod === 'balance') {
      const bal = parseFloat(userBalance) || 0
      if (amt > bal) {
        showToast(`Insufficient balance. Available: ${bal.toFixed(2)} TON`, 'err')
        return
      }
    }
    setLoading(true)
    try {
      const ok = await onSubmit(autoPlan.id, amt, paymentMethod)
      if (ok !== false) onClose()
    } finally {
      setLoading(false)
    }
  }

  const planColor     = autoPlan ? colorMap[autoPlan.color] : '#888'
  const planTextColor = autoPlan?.color === 'gold' ? '#080b12' : '#fff'

  return (
    <div className="overlay" onClick={e => e.target.classList.contains('overlay') && onClose()}>
      <div className="sheet">
        <div className="handle"/>

        {/* ── Step: Connect Wallet ── */}
        {step === 'connect' && (
          <div className="wallet-connect-wrap">
            <div className="wc-icon">💎</div>
            <h2 className="sheet-title" style={{marginTop:8}}>Connect TON Wallet</h2>
            <p className="wc-desc">
              Connect your TON wallet to deposit and invest. This is required to send funds securely.
            </p>
            <div className="wc-features">
              <div className="wc-feat"><span className="wc-check">✓</span> One-time setup only</div>
              <div className="wc-feat"><span className="wc-check">✓</span> Secured by TON Connect</div>
              <div className="wc-feat"><span className="wc-check">✓</span> No private keys stored</div>
            </div>
            <button className="sheet-btn main" style={{background:'#3b9eff',color:'#fff',marginTop:24}}
              onClick={handleConnectWallet} disabled={loading}>
              {loading ? 'Connecting...' : '🔗 Connect TON Wallet'}
            </button>
            <button className="sheet-btn ghost" onClick={onClose}>Cancel</button>
          </div>
        )}

        {/* ── Step: Deposit ── */}
        {step === 'deposit' && (
          <>
            <h2 className="sheet-title">Deposit & Invest</h2>

            {/* Payment Method Toggle */}
            <div style={{display:'flex',gap:8,marginBottom:14}}>
              <button
                onClick={() => setPaymentMethod('wallet')}
                style={{
                  flex:1, padding:'9px 12px', borderRadius:10, border:'none', cursor:'pointer',
                  fontSize:13, fontWeight:600,
                  background: paymentMethod==='wallet' ? '#3b9eff' : 'var(--s2)',
                  color: paymentMethod==='wallet' ? '#fff' : 'var(--muted)',
                  transition:'all 0.15s'
                }}>
                💎 Wallet
              </button>
              <button
                onClick={() => setPaymentMethod('balance')}
                style={{
                  flex:1, padding:'9px 12px', borderRadius:10, border:'none', cursor:'pointer',
                  fontSize:13, fontWeight:600,
                  background: paymentMethod==='balance' ? '#9b6dff' : 'var(--s2)',
                  color: paymentMethod==='balance' ? '#fff' : 'var(--muted)',
                  transition:'all 0.15s'
                }}>
                ◎ Balance ({(parseFloat(userBalance)||0).toFixed(2)} TON)
              </button>
            </div>

            {/* Wallet connected indicator */}
            {paymentMethod === 'wallet' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--s2)', border: '1px solid var(--border2)',
              borderRadius: 10, padding: '8px 12px', marginBottom: 14, fontSize: 12
            }}>
              <div style={{width:7,height:7,borderRadius:'50%',background:'var(--green)',flexShrink:0}}/>
              <span style={{color:'var(--muted)'}}>Wallet connected — transaction will open your wallet app</span>
            </div>
            )}
            {paymentMethod === 'balance' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--s2)', border: '1px solid var(--border2)',
              borderRadius: 10, padding: '8px 12px', marginBottom: 14, fontSize: 12
            }}>
              <div style={{width:7,height:7,borderRadius:'50%',background:'#9b6dff',flexShrink:0}}/>
              <span style={{color:'var(--muted)'}}>Reinvest from balance — no wallet transaction needed</span>
            </div>
            )}

            {/* Auto plan badge */}
            <div className="auto-plan-row">
              {autoPlan ? (
                <div className="auto-plan-badge" style={{background: planColor, color: planTextColor}}>
                  <span className="apb-dot">◎</span>
                  <span>{autoPlan.name} — {autoPlan.rate}%/{autoPlan.profitIntervalMinutes ? `${autoPlan.profitIntervalMinutes}min` : 'interval'} · {autoPlan.duration}{autoPlan.durationUnit === 'hours' ? 'hr' : 'd'}</span>
                  <span className="apb-tag">AUTO</span>
                </div>
              ) : (
                <div className="auto-plan-badge empty">
                  <span>Enter amount → plan auto-selected</span>
                </div>
              )}
            </div>

            {/* Range guide */}
            <div className="plan-range-guide">
              {plans.map(p => (
                <div key={p.id} className={`prg-item ${autoPlan?.id === p.id ? 'active ' + p.color : ''}`}>
                  <div className="prg-tier">{p.tier}</div>
                  <div className="prg-range">{p.min}–{p.max || '∞'} TON</div>
                  <div className="prg-rate">{p.rate}%</div>
                </div>
              ))}
            </div>

            <div className="sheet-field">
              <label className="sf-label">Amount (TON)</label>
              <div className="sf-input-wrap">
                <input className="sheet-input" type="number" placeholder={`Min ${plans[0]?.min || 10} TON`}
                  value={amount} onChange={e => setAmount(e.target.value)} autoFocus/>
                <span className="sf-unit">TON</span>
              </div>
              <div className="quick-row">
                {[10, 100, 200, 500].map(v => (
                  <div key={v} className="qr-btn" onClick={() => setAmount(String(v))}>{v}</div>
                ))}
              </div>
            </div>

            {/* Estimated returns */}
            {amt > 0 && autoPlan && (
              <div className="est-box">
                <div className="est-title">Estimated Returns</div>
                <div className="er-grid">
                  <div className="er-item">
                    <div className="er-val" style={{color: planColor}}>{daily ? '+'+daily : '—'}</div>
                    <div className="er-lbl">Per day</div>
                  </div>
                  <div className="er-item">
                    <div className="er-val" style={{color: planColor}}>{weekly ? '+'+weekly : '—'}</div>
                    <div className="er-lbl">Per week ({activeDaysPerWeek}d)</div>
                  </div>
                  <div className="er-item">
                    <div className="er-val" style={{color: planColor}}>{monthly ? '+'+monthly : '—'}</div>
                    <div className="er-lbl">{autoPlan?.duration || 30}d ({activeDaysInTerm} active)</div>
                  </div>
                </div>
                <div className="er-note">{autoPlan?.profitIntervalMinutes || 5}min interval · {autoPlan?.duration || 1}{autoPlan?.durationUnit === 'hours' ? 'hr' : 'd'} term · principal returned on completion</div>
              </div>
            )}

            <button
              className="sheet-btn main"
              style={amountValid ? {background: planColor, color: planTextColor} : {}}
              onClick={handleConfirm}
              disabled={loading || !amt}
            >
              {loading
                ? (paymentMethod === 'balance' ? 'Processing...' : 'Opening wallet...')
                : amt
                  ? paymentMethod === 'balance'
                    ? `Reinvest ${amt} TON from Balance →`
                    : `Send ${amt} TON via Wallet →`
                  : 'Enter amount to continue'}
            </button>
            <button className="sheet-btn ghost" onClick={onClose}>Cancel</button>
          </>
        )}
      </div>
    </div>
  )
}
