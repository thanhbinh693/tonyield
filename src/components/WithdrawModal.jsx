import React, { useState, useEffect } from 'react'
import { useTonWallet, toUserFriendlyAddress } from '@tonconnect/ui-react'

import './Modal.css'


/**
 * Convert any TON address format to friendly format.
 * - mainnet: UQ... (bounceable=false, testOnly=false)
 * - testnet: kQ... (bounceable=false, testOnly=true)
 *
 * toUserFriendlyAddress(addr, bounceable, testOnly)
 */
function toFriendlyAddr(rawAddr, isTestnet) {
  if (!rawAddr) return ''
  try {
    return toUserFriendlyAddress(rawAddr, isTestnet)
  } catch {
    return ''
  }
}

function isValidTonAddress(addr) {
  if (!addr || typeof addr !== 'string') return false
  // mainnet: UQ.../EQ... | testnet: kQ.../0Q...
  // base64url alphabet includes A-Z a-z 0-9 _ - and trailing = padding
  return /^[UEk0][Qq][A-Za-z0-9_\-]+=?$/.test(addr.trim())
}

/**
 * WithdrawModal — Automatic flow via backend
 *
 * Wallet address always taken DIRECTLY from TonConnect (live) — do not use cached walletAddr.
 * If wallet is no longer connected, user must reconnect.
 */
export default function WithdrawModal({
  balance, config, onClose, showToast,
  onSubmit, walletConnected, onConnectWallet, user
}) {
  const [amount,    setAmount]    = useState('')
  const [step,      setStep]      = useState(walletConnected ? 'amount' : 'connect')
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Always get live address from TonConnect — do NOT use user.walletAddr to avoid stale data
  const tonWallet  = useTonWallet()
  // Derive isTestnet from config so it updates when admin switches network
  const isTestnet  = (config?.tonNetwork || 'testnet') === 'testnet'
  // Convert immediately to friendly format based on current network
  const walletAddr = toFriendlyAddr(tonWallet?.account?.address || '', isTestnet)

  const minW     = config?.minWithdraw || 5
  const amt      = parseFloat(amount) || 0
  const validAmt = amt >= minW && amt <= balance

  // Auto-advance when wallet just connected
  useEffect(() => {
    if (walletConnected && step === 'connect') setStep('amount')
  }, [walletConnected])

  const handleConnect = async () => {
    setLoading(true)
    try { await onConnectWallet() }
    catch { showToast('Connection failed. Try again.', 'err') }
    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!validAmt) {
      showToast(amt < minW ? `Min: ${minW} TON` : 'Insufficient balance', 'err')
      return
    }
    // Check live wallet from TonConnect — do not use cached address
    if (!walletAddr) {
      showToast('Wallet not connected. Please connect your TON wallet first.', 'err')
      setStep('connect')
      return
    }
    if (!isValidTonAddress(walletAddr)) {
      showToast('Invalid wallet address detected. Please reconnect your wallet.', 'err')
      return
    }
    setLoading(true)
    // Pass wallet address DIRECTLY from TonConnect live — do not fallback to cached
    const ok = await onSubmit(amt, walletAddr)
    setLoading(false)
    if (ok !== false) {
      setSubmitted(true)
      setTimeout(() => onClose(), 2800)
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="overlay" onClick={e => e.target.classList.contains('overlay') && onClose()}>
        <div className="sheet" style={{ padding: '56px 24px 40px', textAlign: 'center' }}>
          <div className="handle" />
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 className="sheet-title" style={{ marginBottom: 8 }}>Request Submitted!</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>
            Your withdrawal of <b>{amt} TON</b> is being processed.<br />
            Funds will arrive to your wallet in a few minutes.
          </p>
          <div style={{
            background: 'var(--card)', borderRadius: 12, padding: '12px 16px',
            margin: '20px 0', fontSize: 12, color: 'var(--muted)',
            wordBreak: 'break-all', textAlign: 'left',
          }}>
            <div style={{ marginBottom: 4, fontWeight: 600, color: 'var(--text)' }}>Sending to:</div>
            {walletAddr}
          </div>
          <button className="sheet-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="overlay" onClick={e => e.target.classList.contains('overlay') && onClose()}>
      <div className="sheet" style={{ paddingBottom: 40 }}>
        <div className="handle" />

        {/* ── Step 1: Connect wallet ────────────────────────────────────── */}
        {step === 'connect' && (
          <div className="wallet-connect-wrap">
            <div className="wc-icon">💎</div>
            <h2 className="sheet-title" style={{ marginTop: 8 }}>Connect TON Wallet</h2>
            <p className="wc-desc">
              Connect your TON wallet so we know where to send your funds.<br />
              <b>You won't need to sign or send any transaction.</b>
            </p>
            <div className="wc-features">
              <div className="wc-feat"><span className="wc-check">✓</span> One-time setup only</div>
              <div className="wc-feat"><span className="wc-check">✓</span> No transaction signing needed</div>
              <div className="wc-feat"><span className="wc-check">✓</span> Platform sends TON to you automatically</div>
            </div>
            <button
              className="sheet-btn main"
              style={{ background: '#3b9eff', color: '#fff', marginTop: 24 }}
              onClick={handleConnect}
              disabled={loading}
            >
              {loading ? 'Connecting...' : '🔗 Connect TON Wallet'}
            </button>
            <button className="sheet-btn ghost" onClick={onClose}>Cancel</button>
          </div>
        )}

        {/* ── Step 2: Enter amount ──────────────────────────────────────── */}
        {step === 'amount' && (
          <>
            <h2 className="sheet-title">Withdraw TON</h2>

            {/* Balance */}
            <div className="bal-display">
              <div className="bd-label">Available Balance</div>
              <div className="bd-val">{balance?.toFixed(2)} <span>TON</span></div>
            </div>

            {/* Destination wallet — LIVE from TonConnect, NOT cached */}
            <div style={{
              background: 'var(--card)', borderRadius: 12, padding: '10px 14px',
              marginBottom: 14, border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>
                💎 Connected wallet (funds will be sent here)
              </div>
              {walletAddr ? (
                <>
                  <div style={{ fontSize: 13, color: 'var(--blue)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {`${walletAddr.slice(0, 14)}...${walletAddr.slice(-8)}`}
                  </div>
                  {/* Warning if current wallet differs from previously saved address */}
                  {user?.walletAddr && user.walletAddr !== walletAddr && (
                    <div style={{ fontSize: 11, color: '#f5a623', marginTop: 5 }}>
                      ⚠ This wallet differs from your previously saved address
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--red)' }}>
                  ⚠ Wallet not connected — please go back and connect
                </div>
              )}
            </div>

            <div className="info-bar" style={{ marginBottom: 14 }}>
              ℹ Min: <b>{minW} TON</b>. Sent automatically — no confirmation needed.
            </div>

            {/* Amount input */}
            <div className="sheet-field">
              <label className="sf-label">Amount (TON)</label>
              <div className="sf-input-wrap">
                <input
                  className="sheet-input"
                  type="number"
                  placeholder={`Min ${minW} TON`}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
                <span className="sf-unit">TON</span>
              </div>
              <div className="quick-row">
                {[10, 50, 100].filter(v => v <= balance).map(v => (
                  <div key={v} className="qr-btn" onClick={() => setAmount(String(v))}>{v}</div>
                ))}
                <div className="qr-btn" onClick={() => setAmount(String(balance?.toFixed(2)))}>Max</div>
              </div>
            </div>

            {/* Summary */}
            {amt > 0 && (
              <div className="step-summary">
                <div className="ss-row">
                  <span>You receive</span>
                  <span className="green">{amt.toFixed(2)} TON</span>
                </div>
                <div className="ss-row">
                  <span>Network fee</span>
                  <span style={{ color: 'var(--muted)' }}>Covered by platform</span>
                </div>
                <div className="ss-row">
                  <span>Processing time</span>
                  <span style={{ color: 'var(--muted)' }}>~1–2 minutes</span>
                </div>
              </div>
            )}

            <button
              className="sheet-btn main"
              style={{ background: validAmt ? 'var(--blue)' : 'var(--card)',
                       color: validAmt ? '#fff' : 'var(--muted)' }}
              onClick={handleSubmit}
              disabled={!amt || loading}
            >
              {loading ? 'Submitting...' : 'Withdraw →'}
            </button>
            <button className="sheet-btn ghost" onClick={onClose}>Cancel</button>
          </>
        )}
      </div>
    </div>
  )
}
