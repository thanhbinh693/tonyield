import { useState } from 'react'
import { useTonConnectUI } from '@tonconnect/ui-react'
import { SAMPLE_PLANS, calcProfit, fmtTon, CONFIG, type Plan } from '../utils/config'

interface Props {
  show: boolean
  initialPlan?: Plan
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

export default function DepositModal({ show, initialPlan, onClose, onSuccess, onError }: Props) {
  const [tonConnect] = useTonConnectUI()
  const [selectedPlan, setSelectedPlan] = useState<Plan>(initialPlan ?? SAMPLE_PLANS[0])
  const [amount, setAmount] = useState('')

  const profit = amount ? calcProfit(parseFloat(amount) || 0, selectedPlan.profitRate) : null

  async function handleDeposit() {
    const amt = parseFloat(amount)
    if (!amt || amt < selectedPlan.minAmount) {
      onError(`Minimum deposit: ${selectedPlan.minAmount} TON`)
      return
    }
    try {
      // TON Connect transaction
      await tonConnect.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{
          address: CONFIG.API_URL.replace('/api', ''),   // replace with your hot wallet address
          amount: String(Math.floor(amt * 1e9)),          // in nanoTON
        }]
      })
      onClose()
      onSuccess(`Deposited ${fmtTon(amt)} TON successfully!`)
    } catch {
      onError('Transaction cancelled')
    }
  }

  if (!show) return null

  return (
    <div className="modal-overlay show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="sheet-handle" />
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
          Deposit &amp; Invest
        </div>

        {/* Plan tabs */}
        <div style={{ display: 'flex', gap: 6, background: 'var(--s2)', borderRadius: 10, padding: 4, marginBottom: 16 }}>
          {SAMPLE_PLANS.map(p => (
            <div
              key={p.id}
              onClick={() => setSelectedPlan(p)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 7, textAlign: 'center',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: '.18s',
                color: selectedPlan.id === p.id ? 'var(--text)' : 'var(--muted)',
                background: selectedPlan.id === p.id ? 'var(--s1)' : 'transparent',
                border: selectedPlan.id === p.id ? '1px solid var(--border2)' : '1px solid transparent',
              }}
            >
              {p.tier} {p.profitRate}%
            </div>
          ))}
        </div>

        {/* Amount input */}
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
          {[10, 50, 100, 500].map(v => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              style={{
                flex: 1, padding: '9px 0', background: 'var(--s2)', border: '1px solid var(--border2)',
                borderRadius: 8, color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--font-body)', transition: '.18s',
              }}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Estimate */}
        <div style={{ background: 'var(--s2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          {[
            { label: 'Daily return',           val: profit ? `+${fmtTon(profit.daily, 3)} TON` : '—' },
            { label: 'Weekly (5 days)',         val: profit ? `+${fmtTon(profit.weekly, 3)} TON` : '—' },
            { label: '30 days (~22 trading)',   val: profit ? `+${fmtTon(profit.monthly, 3)} TON` : '—' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
              <span style={{ color: 'var(--muted)' }}>{r.label}</span>
              <span style={{ fontWeight: 700, color: 'var(--green)' }}>{r.val}</span>
            </div>
          ))}
          <div style={{ fontSize: 10, color: 'var(--muted2)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            Sat &amp; Sun excluded · 22 trading days per 30-day term
          </div>
        </div>

        <button className="btn btn-gold" onClick={handleDeposit} style={{ marginBottom: 8 }}>
          Connect TON Wallet &amp; Deposit
        </button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
