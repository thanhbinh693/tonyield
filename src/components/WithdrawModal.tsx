import { useState } from 'react'
import { CONFIG, fmtTon } from '../utils/config'

interface Props {
  show: boolean
  availableBalance: number
  walletAddress: string
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

export default function WithdrawModal({ show, availableBalance, walletAddress, onClose, onSuccess, onError }: Props) {
  const [amount, setAmount] = useState('')

  async function handleWithdraw() {
    const amt = parseFloat(amount)
    if (!amt || amt < CONFIG.MIN_WITHDRAW) {
      onError(`Minimum withdrawal: ${CONFIG.MIN_WITHDRAW} TON`)
      return
    }
    if (amt > availableBalance) {
      onError('Insufficient balance')
      return
    }
    try {
      // POST to your backend
      const res = await fetch(`${CONFIG.API_URL}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt }),
      })
      if (!res.ok) throw new Error()
      onClose()
      onSuccess(`Withdrawal of ${fmtTon(amt)} TON submitted!`)
    } catch {
      onError('Withdrawal failed. Please try again.')
    }
  }

  if (!show) return null

  const shortAddr = walletAddress ? `${walletAddress.slice(0,4)}...${walletAddress.slice(-4)}` : 'Not connected'

  return (
    <div className="modal-overlay show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="sheet-handle" />
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
          Withdraw TON
        </div>

        {/* Balance */}
        <div style={{ background: 'var(--s2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>Available balance</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800 }}>
            {fmtTon(availableBalance)} <span style={{ color: 'var(--gold)', fontSize: 16 }}>TON</span>
          </div>
        </div>

        {/* Note */}
        <div style={{ background: '#ff4d4d10', border: '1px solid #ff4d4d20', borderRadius: 9, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#ff8a80', display: 'flex', gap: 8 }}>
          <span>ℹ</span>
          <span>Minimum withdrawal: <b>{CONFIG.MIN_WITHDRAW} TON</b>. Processed automatically within minutes.</span>
        </div>

        {/* Input */}
        <input
          className="input"
          type="number"
          placeholder="Amount in TON..."
          value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{ marginBottom: 10 }}
        />

        {/* Quick amounts */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {[10, 50, 100].map(v => (
            <button key={v} onClick={() => setAmount(String(v))}
              style={{ flex:1, padding:'9px 0', background:'var(--s2)', border:'1px solid var(--border2)', borderRadius:8, color:'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)' }}>
              {v}
            </button>
          ))}
          <button onClick={() => setAmount(String(availableBalance))}
            style={{ flex:1, padding:'9px 0', background:'var(--s2)', border:'1px solid var(--border2)', borderRadius:8, color:'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)' }}>
            All
          </button>
        </div>

        {/* Summary */}
        <div style={{ background: 'var(--s2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12 }}>
            <span style={{ color:'var(--muted)' }}>Destination</span>
            <span style={{ fontSize:11, color:'var(--blue)', fontWeight:600 }}>{shortAddr}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
            <span style={{ color:'var(--muted)' }}>Network fee</span>
            <span style={{ fontWeight:700, color:'var(--muted)' }}>~0.01 TON</span>
          </div>
          <div style={{ fontSize:10, color:'var(--muted2)', marginTop:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
            Transactions are irreversible. Double-check your wallet address.
          </div>
        </div>

        <button className="btn btn-red" onClick={handleWithdraw} style={{ marginBottom: 8 }}>
          Confirm Withdrawal
        </button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
