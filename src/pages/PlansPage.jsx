import React, { useState } from 'react'
import { DAY_NAMES } from '../utils/config'
const TODAY_DOW = new Date().getDay()
import './PlansPage.css'

function detectPlan(plans, amount) {
  const amt = parseFloat(amount) || 0
  if (!amt) return null
  const eligible = plans.filter(p => amt >= p.min && (!p.max || amt <= p.max))
  if (eligible.length === 0) return null
  return eligible[eligible.length - 1]
}

export default function PlansPage({ plans, onDeposit, config }) {
  const [calcAmt, setCalcAmt] = useState('')

  // Auto-detect plan from amount (same logic as DepositModal)
  const amt = parseFloat(calcAmt) || 0
  const autoPlan = detectPlan(plans, calcAmt)
  const best = plans.find(p => p.hot) || plans[1] || plans[0]
  const activePlan = autoPlan || best
  const rate = activePlan?.rate || 2.5
  const duration = activePlan?.duration || 1
  const intervalMin = activePlan?.profitIntervalMinutes || 5
  const durationMs = activePlan?.durationMs || (duration * (activePlan?.durationUnit === 'hours' ? 3_600_000 : 86_400_000))

  // Rate is per interval (not per day)
  const profitPerInterval = amt * rate / 100
  const intervalsPerHour = 60 / intervalMin
  const hourlyProfit = profitPerInterval * intervalsPerHour
  const totalIntervals = Math.floor(durationMs / (intervalMin * 60_000))
  const totalProfit = profitPerInterval * totalIntervals

  const referralRate = config?.referralRate || 5

  // Build a human-readable active days label from the most common plan's active days
  const commonDays = plans[0]?.activeDays || [1,2,3,4,5]
  const allSameDays = plans.every(p => JSON.stringify(p.activeDays||[1,2,3,4,5]) === JSON.stringify(commonDays))
  const activeDaysLabel = allSameDays
    ? commonDays.map(d => DAY_NAMES[d]).join('–')
    : 'Weekday'
  const colorMap = { gold: 'var(--gold)', blue: 'var(--blue)', purple: 'var(--purple)' }
  const planColor = colorMap[activePlan?.color] || 'var(--gold)'

  return (
    <div className="page">
      <div style={{height:18}}/>
      {plans.some(p => !(p.activeDays||[1,2,3,4,5]).includes(TODAY_DOW)) && (
        <div className="weekend-bar">
          <span>⏸</span>
          <span>Some plans are paused today · Deposits still accepted, plan will activate on next active day</span>
        </div>
      )}

      <div className="pp-hero">
        <div className="pph-label">Investment Platform</div>
        <div className="pph-title">Grow Your<br/><em>TON</em> Yield</div>
        <div className="pph-sub">{activeDaysLabel} automatic returns · Weekend pause · {`${activePlan?.duration||30} ${activePlan?.durationUnit === 'hours' ? 'hr' : 'day'} term`}</div>
      </div>

      {/* Calculator */}
      <div className="calc-box">
        <div className="calc-header">
          <span className="calc-icon">⚡</span>
          <span className="calc-title">Profit Calculator</span>
        </div>

        {/* Auto-plan badge */}
        <div className="auto-plan-row" style={{marginBottom:12}}>
          {autoPlan ? (
            <div className="auto-plan-badge" style={{
              background: planColor,
              color: autoPlan.color === 'gold' ? '#080b12' : '#fff'
            }}>
              <span className="apb-dot">◎</span>
              <span>{autoPlan.name} — {autoPlan.rate}%/{autoPlan.profitIntervalMinutes ? `${autoPlan.profitIntervalMinutes}min` : 'interval'} · {`${autoPlan.duration} ${autoPlan.durationUnit === 'hours' ? 'hr' : 'day'}`}</span>
              <span className="apb-tag">AUTO</span>
            </div>
          ) : (
            <div className="auto-plan-badge empty">
              <span>Enter amount → plan auto-selected</span>
            </div>
          )}
        </div>

        {/* Range guide */}
        <div className="plan-range-guide" style={{marginBottom:12}}>
          {plans.map(p => (
            <div key={p.id} className={`prg-item ${autoPlan?.id === p.id ? 'active ' + p.color : ''}`}>
              <div className="prg-tier">{p.tier}</div>
              <div className="prg-range">{p.min}–{p.max || '∞'}</div>
              <div className="prg-rate">{p.rate}%</div>
            </div>
          ))}
        </div>

        <div className="calc-input-row">
          <input
            className="calc-input"
            type="number"
            placeholder="0.00"
            value={calcAmt}
            onChange={e => setCalcAmt(e.target.value)}
          />
          <span className="calc-unit">TON</span>
        </div>

        <div className="calc-results">
          <div className="cr-item">
            <div className="cr-val" style={amt ? {color: planColor} : {}}>{amt ? '+'+profitPerInterval.toFixed(4) : '—'}</div>
            <div className="cr-label">/ {intervalMin}min</div>
          </div>
          <div className="cr-divider"/>
          <div className="cr-item">
            <div className="cr-val" style={amt ? {color: planColor} : {}}>{amt ? '+'+hourlyProfit.toFixed(4) : '—'}</div>
            <div className="cr-label">/ hour</div>
          </div>
          <div className="cr-divider"/>
          <div className="cr-item">
            <div className="cr-val" style={amt ? {color: planColor} : {}}>{amt ? '+'+totalProfit.toFixed(4) : '—'}</div>
            <div className="cr-label">total ({duration}{activePlan?.durationUnit === 'hours' ? 'hr' : 'd'})</div>
          </div>
        </div>
      </div>

      {plans.map(plan => (
        <div key={plan.id} className={`plan-card ${plan.color}`}>
          {plan.hot && <div className="pc-hot-ribbon">HOT</div>}
          <div className="pc-top">
            <div>
              <span className={`pc-badge ${plan.color}`}>{plan.tier}</span>
              <div className="pc-name">{plan.name}</div>
              <div className="pc-range">{plan.min}–{plan.max ? plan.max : '∞'} TON · {`${plan.duration} ${plan.durationUnit === 'hours' ? 'hr' : 'day'}`}</div>
            </div>
            <div className="pc-rate-wrap">
              <div className={`pc-rate ${plan.color}`}>{plan.rate}%</div>
              <div className="pc-per">/{plan.profitIntervalMinutes ? `${plan.profitIntervalMinutes}min` : 'interval'}</div>
            </div>
          </div>
          {/* Active days chips */}
          <div className="pc-days-row">
            {[0,1,2,3,4,5,6].map(i => {
              const on = (plan.activeDays||[1,2,3,4,5]).includes(i)
              const cls = `pc-day-chip ${on ? 'on ' + plan.color : 'off'} ${i===TODAY_DOW?'today':''}`
              return <span key={i} className={cls}>{DAY_NAMES[i]}</span>
            })}
          </div>
          <div className="pc-divider"/>
          <div className="pc-features">
            <div className="pc-feat"><div className={`dot ${plan.color}`}/>{(plan.activeDays||[1,2,3,4,5]).map(d=>DAY_NAMES[d]).join('–')} returns</div>
            <div className="pc-feat"><div className={`dot ${plan.color}`}/>Instant activation</div>
            <div className="pc-feat"><div className={`dot ${plan.color}`}/>{referralRate}% referral</div>
            <div className="pc-feat"><div className={`dot ${plan.color}`}/>{`${plan.duration}-${plan.durationUnit === 'hours' ? 'hr' : 'day'} term`}</div>
          </div>
          <button className={`pc-btn ${plan.color}`} onClick={() => onDeposit(plan)}>Invest Now →</button>
        </div>
      ))}
      <div style={{height:8}}/>
    </div>
  )
}
