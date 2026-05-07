import React, { useState, useEffect } from 'react'
import { DAY_NAMES, DAY_NAMES_FULL } from '../utils/config'
import './AdminPage.css'

const fmtDate = (ts) => new Date(ts).toLocaleString('en-US', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
const TODAY_DOW = new Date().getDay()

export default function AdminPage({
  user,
  computeAdminStats, getAllUsers, getAllTransactions,
  plans,
  adminApproveDeposit, adminRejectDeposit,
  adminApproveWithdraw, adminRejectWithdraw,
  adminToggleBan, adminUpdatePlan, adminToggleMaintenance,
  adminUpdateUser, adminSaveSettings,
  config, showToast, setIsAdmin
}) {
  const [section, setSection] = useState('overview')
  const [editPlan, setEditPlan] = useState(null)
  const [editUser, setEditUser] = useState(null)

  // ─── Async-loaded admin data ──────────────────────────────────────
  const [adminStats, setAdminStats]   = useState(null)
  const [allUsers, setAllUsers]       = useState([])
  const [allTransactions, setAllTx]   = useState([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    async function loadAdminData() {
      setDataLoading(true)
      try {
        const [stats, users, txs] = await Promise.all([
          computeAdminStats(),
          getAllUsers(),
          getAllTransactions(),
        ])
        setAdminStats(stats)
        setAllUsers(users)
        setAllTx(txs)
      } catch(e) {
        console.warn('[AdminPage] load error:', e)
      } finally {
        setDataLoading(false)
      }
    }
    loadAdminData()
    // Refresh every 30s
    const id = setInterval(loadAdminData, 30_000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line

  const allTxSorted = [...allTransactions].sort((a,b) => b.createdAt - a.createdAt)

  const stats = adminStats ? [
    { label: 'Total Users',       val: adminStats.totalUsers,                    color: 'blue',   icon: '◉' },
    { label: 'Active Users',      val: adminStats.activeUsers,                   color: 'green',  icon: '●' },
    { label: 'Deposited (TON)',   val: adminStats.totalDeposited.toFixed(0),     color: 'gold',   icon: '↓' },
    { label: 'Withdrawn (TON)',   val: adminStats.totalWithdrawn.toFixed(0),     color: 'red',    icon: '↑' },
    { label: 'Today Profit',      val: adminStats.todayProfit.toFixed(2),        color: 'green',  icon: '◎' },
    { label: 'Active Investments',val: adminStats.activeInvestments,             color: 'purple', icon: '▶' },
  ] : []

  const sections = [
    { id: 'overview',  label: 'Overview',  badge: 0 },
    { id: 'deposits',  label: 'Deposits',  badge: 0 },
    { id: 'withdraws', label: 'Withdraws', badge: 0 },
    { id: 'users',     label: 'Users',     badge: 0 },
    { id: 'plans',     label: 'Plans',     badge: 0 },
    { id: 'history',   label: 'History',   badge: 0 },
    { id: 'settings',  label: '⚙ Settings',badge: 0 },
  ]

  return (
    <div className="page admin-page">
      <div className="admin-header">
        <div className="admin-title">
          <span className="admin-shield">🛡</span>
          <div className="admin-title-info">
            <span>Admin Panel</span>
            <span className="admin-id-badge">ID: {user?.id}</span>
          </div>
        </div>
        <div className="admin-header-right">
          <button className={`maint-btn ${config.maintenanceMode ? 'on' : ''}`} onClick={adminToggleMaintenance}>
            {config.maintenanceMode ? '⚠ Maintenance ON' : '⚙ Maint'}
          </button>
          <button className="exit-admin-btn" onClick={() => setIsAdmin(false)} title="Exit Admin">✕ Exit</button>
        </div>
      </div>

      {/* Cloud sync badge */}
      <div className="cloud-sync-badge">
        <span className="csb-icon">☁</span>
        <span>Cloud Sync {dataLoading ? '…' : '✓'}</span>
      </div>

      {/* Section tabs */}
      <div className="admin-tabs">
        {sections.map(s => (
          <div key={s.id} className={`adm-tab ${section===s.id?'on':''}`} onClick={() => setSection(s.id)}>
            {s.label}
            {s.badge > 0 && <span className="adm-badge">{s.badge}</span>}
          </div>
        ))}
      </div>

      {/* Loading state */}
      {dataLoading && section !== 'settings' && section !== 'plans' && (
        <div className="adm-loading">Loading cloud data…</div>
      )}

      {/* Overview */}
      {section === 'overview' && !dataLoading && (
        <div className="adm-section">
          <div className="stat-grid">
            {stats.map((s,i) => (
              <div key={i} className={`stat-box ${s.color}`}>
                <div className="sb-icon">{s.icon}</div>
                <div className="sb-val">{s.val}</div>
                <div className="sb-label">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="day-status-bar">
            <div className="dsb-label">Today: <strong>{DAY_NAMES_FULL[TODAY_DOW]}</strong></div>
            <div className="dsb-plans">
              {plans.map(p => {
                const active = (p.activeDays || [1,2,3,4,5]).includes(TODAY_DOW)
                return (
                  <div key={p.id} className={`dsb-plan ${active ? 'on' : 'off'}`}>
                    <span className={`dsb-dot ${p.color}`}/>
                    {p.name}: <strong>{active ? 'Active' : 'Paused'}</strong>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Deposits */}
      {section === 'deposits' && !dataLoading && (
        <div className="adm-section">
          <div className="adm-sec-title">All Deposits ({allTransactions.filter(t=>t.type==='deposit').length})</div>
          {allTransactions.filter(t=>t.type==='deposit').length === 0 && <div className="adm-empty">No deposits yet</div>}
          {allTransactions.filter(t=>t.type==='deposit').map(tx => (
            <div key={tx.id} className="adm-tx-row">
              <div className="atr-left">
                <div className="atr-label">User #{tx.userId} · {tx.amount} TON</div>
                <div className="atr-date">{fmtDate(tx.createdAt)}</div>
              </div>
              <span className={`adm-status ${tx.status}`}>{tx.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Withdrawals */}
      {section === 'withdraws' && !dataLoading && (
        <div className="adm-section">
          <div className="adm-sec-title">Withdrawal Queue ({allTransactions.filter(t=>t.type==='withdraw').length})</div>
          {/* Status summary */}
          {allTransactions.filter(t=>t.type==='withdraw').length > 0 && (
            <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
              {['pending','processing','completed','failed'].map(s => {
                const count = allTransactions.filter(t=>t.type==='withdraw'&&t.status===s).length
                if (!count) return null
                const colors = { pending:'#f5a623', processing:'#3d9be9', completed:'#4cd964', failed:'#ff3b30' }
                return (
                  <div key={s} style={{ background:'var(--card)', borderRadius:8, padding:'4px 10px',
                    fontSize:12, color: colors[s] || 'var(--muted)', fontWeight:600 }}>
                    {s}: {count}
                  </div>
                )
              })}
            </div>
          )}
          {allTransactions.filter(t=>t.type==='withdraw').length === 0 && <div className="adm-empty">No withdrawals yet</div>}
          {allTransactions.filter(t=>t.type==='withdraw').map(tx => (
            <div key={tx.id} className="adm-tx-row">
              <div className="atr-left">
                <div className="atr-label">User #{tx.userId} · {Math.abs(tx.amount)} TON</div>
                {tx.toWallet && (
                  <div className="atr-date" style={{ fontSize:11, marginTop:2 }}>
                    → {tx.toWallet.slice(0,16)}...
                  </div>
                )}
                <div className="atr-date">{fmtDate(tx.createdAt)}</div>
              </div>
              <span className={`adm-status ${tx.status}`}>{tx.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Users */}
      {section === 'users' && !dataLoading && (
        <div className="adm-section">
          <div className="adm-sec-title">All Users ({allUsers.length})</div>
          {allUsers.map(u => (
            <div key={u.id} className={`user-card ${u.status}`}>
              {editUser === u.id ? (
                <UserEditor
                  user={u}
                  onSave={(updates) => { adminUpdateUser(u.id, updates); setEditUser(null) }}
                  onCancel={() => setEditUser(null)}
                />
              ) : (
                <>
                  <div className="uc-header">
                    <div className="uc-avatar">{(u.username||'U')[0].toUpperCase()}</div>
                    <div className="uc-info">
                      <div className="uc-name">@{u.username}</div>
                      <div className="uc-id">ID #{u.id} · {u.walletAddr || 'No wallet'}</div>
                    </div>
                    <span className={`user-status-badge ${u.status}`}>{u.status}</span>
                  </div>
                  <div className="uc-stats">
                    <div className="ucs"><div className="ucs-val">{(u.balance||0).toFixed(2)}</div><div className="ucs-lbl">Balance</div></div>
                    <div className="ucs"><div className="ucs-val" style={{color:'var(--green)'}}>{(+u.totalDeposit||0).toFixed(1)}</div><div className="ucs-lbl">Deposited</div></div>
                    <div className="ucs"><div className="ucs-val" style={{color:'var(--red)'}}>{(+u.totalWithdraw||0).toFixed(1)}</div><div className="ucs-lbl">Withdrawn</div></div>
                    <div className="ucs"><div className="ucs-val" style={{color:'var(--blue)'}}>{u.referrals||0}</div><div className="ucs-lbl">Referrals</div></div>
                  </div>
                  <div className="uc-actions">
                    <button className="uc-edit-btn" onClick={() => setEditUser(u.id)}>✏ Edit User</button>
                    <button className={`ban-btn ${u.status === 'banned' ? 'unban' : 'ban'}`} onClick={() => adminToggleBan(u.id)}>
                      {u.status === 'banned' ? '↩ Unban' : '⊗ Ban'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Plans */}
      {section === 'plans' && (
        <div className="adm-section">
          <div className="adm-sec-title">Investment Plans</div>
          {plans.map(p => (
            <div key={p.id} className={`plan-edit-card ${p.color}`}>
              <div className="pec-header">
                <span className={`pec-badge ${p.color}`}>{p.tier}</span>
                <span className="pec-name">{p.name}</span>
                {p.hot && <span className="pec-hot">HOT</span>}
              </div>
              {editPlan === p.id ? (
                <PlanEditor plan={p} onSave={(u) => { adminUpdatePlan(p.id, u); setEditPlan(null) }} onCancel={() => setEditPlan(null)} />
              ) : (
                <>
                  <div className="pec-info">
                    <div className="pec-field"><span>Rate</span><span className={`pec-rate ${p.color}`}>{p.rate}% / day</span></div>
                    <div className="pec-field"><span>Min</span><span>{p.min} TON</span></div>
                    <div className="pec-field"><span>Max</span><span>{p.max ? p.max + ' TON' : '∞'}</span></div>
                    <div className="pec-field"><span>Duration</span><span>{p.duration} {p.durationUnit === 'hours' ? 'hr ⚡' : 'day'}</span></div>
                    <div className="pec-field"><span>Profit every</span><span className="pec-interval">{
                      (() => {
                        const mins = p.profitIntervalMinutes || (p.profitIntervalMs ? p.profitIntervalMs/60000 : null) || (p.profitIntervalHours||24)*60
                        if (mins < 60) return `${mins} min ⚡`
                        const h = mins/60; return h >= 24 ? `${h/24} day` : `${h}hr`
                      })()
                    }</span></div>
                    <div className="pec-field"><span>Active days/wk</span><span>{(p.activeDays || [1,2,3,4,5]).length} days</span></div>
                  </div>
                  <div className="pec-days-row">
                    <span className="pec-days-label">Active days:</span>
                    <div className="pec-days">
                      {DAY_NAMES.map((d, i) => {
                        const active = (p.activeDays || [1,2,3,4,5]).includes(i)
                        return <span key={i} className={`pec-day-chip ${active ? 'on ' + p.color : 'off'} ${i === TODAY_DOW ? 'today' : ''}`}>{d}</span>
                      })}
                    </div>
                  </div>
                  <button className="pec-edit-btn" onClick={() => setEditPlan(p.id)}>✏ Edit Plan</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* History */}
      {section === 'history' && !dataLoading && (
        <div className="adm-section">
          <div className="adm-sec-title">Transaction History ({allTxSorted.length})</div>
          {allTxSorted.map(tx => (
            <div key={tx.id} className="adm-tx-row">
              <div className={`atr-ico ${tx.type}`}>{tx.type==='deposit'?'↓':tx.type==='withdraw'?'↑':tx.type==='profit'?'◎':'⊕'}</div>
              <div className="atr-left">
                <div className="atr-label">User#{tx.userId} · {tx.label}</div>
                <div className="atr-date">{fmtDate(tx.createdAt)}</div>
              </div>
              <div className="atr-right">
                <span className={tx.amount>0?'pos':'neg'}>{tx.amount>0?'+':''}{(+tx.amount).toFixed(2)}</span>
                <span className={`adm-status ${tx.status}`}>{tx.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── SETTINGS TAB ─────────────────────────────────────────── */}
      {section === 'settings' && (
        <SettingsPanel config={config} onSave={adminSaveSettings} showToast={showToast} currentUserId={user?.id} />
      )}

      <div style={{height:8}}/>
    </div>
  )
}

// ─── Settings Panel ───────────────────────────────────────────────────────────
function SettingsPanel({ config, onSave, showToast, currentUserId }) {
  const [adminWallet,  setAdminWallet]  = useState(config.adminWallet  || '')
  const [adminIds,     setAdminIds]     = useState(
    Array.isArray(config.adminIds)
      ? config.adminIds.join(', ')
      : config.adminIds || String(currentUserId || '')
  )
  const [botUsername,  setBotUsername]  = useState(config.botUsername  || '')
  const [referralRate, setReferralRate] = useState(config.referralRate || 5)
  const [minWithdraw,  setMinWithdraw]  = useState(config.minWithdraw  || 5)
  const [tonNetwork,   setTonNetwork]   = useState(config.tonNetwork   || 'testnet')
  const [showNetConfirm, setShowNetConfirm] = useState(false)
  const [pendingNetwork,  setPendingNetwork]  = useState(null)

  const handleNetworkSwitch = (net) => {
    if (net === tonNetwork) return
    setPendingNetwork(net)
    setShowNetConfirm(true)
  }

  const confirmNetworkSwitch = () => {
    setTonNetwork(pendingNetwork)
    setShowNetConfirm(false)
    setPendingNetwork(null)
  }

  const handleSave = () => {
    // Parse adminIds from comma-separated string to array of numbers
    const parsedIds = adminIds
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter(n => !isNaN(n) && n > 0)

    if (!adminWallet.trim()) { showToast('Admin wallet cannot be empty', 'err'); return }
    if (parsedIds.length === 0) { showToast('Add at least one Admin Telegram ID', 'err'); return }

    onSave({
      adminWallet:  adminWallet.trim(),
      adminIds:     parsedIds,
      botUsername:  botUsername.trim(),
      referralRate: +referralRate,
      minWithdraw:  +minWithdraw,
      tonNetwork:   tonNetwork,
    })
  }

  // Build referral link preview
  const refLink = botUsername.trim()
    ? `https://t.me/${botUsername.trim()}?start=ref_${String(currentUserId).slice(-6)}`
    : '(enter bot username to preview)'

  return (
    <div className="adm-section settings-panel">
      <div className="adm-sec-title">⚙ Bot Settings</div>
      <div className="settings-info">
        Settings are synced via Telegram CloudStorage — all admin devices share the same config.
      </div>

      {/* Admin Wallet */}
      <div className="setting-group">
        <div className="sg-label">
          <span className="sg-icon">💎</span>
          Admin Wallet Address (TON)
        </div>
        <div className="sg-desc">Receives all deposits. Must be a valid TON address (UQ… or EQ…).</div>
        <input
          className="sg-input"
          type="text"
          value={adminWallet}
          onChange={e => setAdminWallet(e.target.value)}
          placeholder="UQD…"
          spellCheck={false}
        />
      </div>

      {/* Admin IDs */}
      <div className="setting-group">
        <div className="sg-label">
          <span className="sg-icon">🆔</span>
          Admin Telegram IDs
        </div>
        <div className="sg-desc">
          Comma-separated Telegram user IDs that have admin access.
          Get your ID from <strong>@userinfobot</strong> on Telegram.
        </div>
        <input
          className="sg-input"
          type="text"
          value={adminIds}
          onChange={e => setAdminIds(e.target.value)}
          placeholder="123456789, 987654321"
        />
        <div className="sg-hint">Current session ID: <strong>{currentUserId}</strong></div>
      </div>

      {/* Bot Username */}
      <div className="setting-group">
        <div className="sg-label">
          <span className="sg-icon">🤖</span>
          Bot Username (Telegram)
        </div>
        <div className="sg-desc">Your bot's @username — used to generate referral links.</div>
        <div className="sg-input-prefix-wrap">
          <span className="sg-prefix">@</span>
          <input
            className="sg-input with-prefix"
            type="text"
            value={botUsername}
            onChange={e => setBotUsername(e.target.value.replace('@',''))}
            placeholder="YourBotName"
          />
        </div>
        <div className="sg-ref-preview">
          <span className="sg-ref-label">Ref link preview:</span>
          <span className="sg-ref-url">{refLink}</span>
        </div>
      </div>

      {/* Referral Commission */}
      <div className="setting-group">
        <div className="sg-label">
          <span className="sg-icon">💸</span>
          Referral Commission (%)
        </div>
        <div className="sg-desc">
          Percentage of deposit credited to referrer's balance.
        </div>
        <div className="sg-slider-wrap">
          <input
            type="range" min="1" max="30" step="0.5"
            value={referralRate}
            onChange={e => setReferralRate(+e.target.value)}
            className="sg-slider"
          />
          <div className="sg-slider-val">
            <span className="sg-rate-big">{referralRate}%</span>
            <span className="sg-rate-label">commission per referral</span>
          </div>
        </div>
      </div>

      {/* TON Network */}
      <div className="setting-group network-group">
        <div className="sg-label">
          <span className="sg-icon">🌐</span>
          TON Network
        </div>
        <div className="sg-desc">
          Switch between <strong>Testnet</strong> (for testing) and <strong>Mainnet</strong> (production).
          Affects wallet address format, TonConnect endpoint, and deposit/withdraw flows.
        </div>
        <div className="network-toggle-wrap">
          <button
            className={`net-btn ${tonNetwork === 'testnet' ? 'net-active testnet' : 'net-inactive'}`}
            onClick={() => handleNetworkSwitch('testnet')}
          >
            <span className="net-dot" />
            🧪 Testnet
          </button>
          <button
            className={`net-btn ${tonNetwork === 'mainnet' ? 'net-active mainnet' : 'net-inactive'}`}
            onClick={() => handleNetworkSwitch('mainnet')}
          >
            <span className="net-dot" />
            🚀 Mainnet
          </button>
        </div>
        <div className={`network-badge ${tonNetwork}`}>
          {tonNetwork === 'testnet' ? '🧪 Currently on TESTNET' : '🚀 Currently on MAINNET'}
        </div>
        {showNetConfirm && (
          <div className="net-confirm-box">
            <div className="net-confirm-title">⚠️ Switch to {pendingNetwork}?</div>
            <div className="net-confirm-desc">
              {pendingNetwork === 'mainnet'
                ? 'Mainnet uses real TON. Deposits and withdrawals will use real funds.'
                : 'Testnet uses test TON only. Safe for development.'}
            </div>
            <div className="net-confirm-btns">
              <button className="net-confirm-yes" onClick={confirmNetworkSwitch}>Yes, Switch</button>
              <button className="net-confirm-no" onClick={() => { setShowNetConfirm(false); setPendingNetwork(null) }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Min Withdraw */}
      <div className="setting-group">
        <div className="sg-label">
          <span className="sg-icon">⬇</span>
          Minimum Withdrawal (TON)
        </div>
        <div className="sg-desc">Users cannot withdraw below this amount.</div>
        <div className="sg-row">
          <input
            className="sg-input sg-input-sm"
            type="number" min="1" step="0.5"
            value={minWithdraw}
            onChange={e => setMinWithdraw(+e.target.value)}
          />
          <span className="sg-unit">TON</span>
        </div>
      </div>

      <button className="sg-save-btn" onClick={handleSave}>
        💾 Save Settings
      </button>
    </div>
  )
}

// ─── User Editor ──────────────────────────────────────────────────────────────
function UserEditor({ user, onSave, onCancel }) {
  const [balance,       setBalance]       = useState(user.balance)
  const [totalDeposit,  setTotalDeposit]  = useState(user.totalDeposit || 0)
  const [totalWithdraw, setTotalWithdraw] = useState(user.totalWithdraw || 0)
  const [todayProfit,   setTodayProfit]   = useState(user.todayProfit || 0)
  const [referrals,     setReferrals]     = useState(user.referrals || 0)
  return (
    <div className="plan-editor">
      <div className="adm-sec-title" style={{marginBottom:12}}>Edit: @{user.username}</div>
      <div className="pe-row"><label>Balance (TON)</label><input type="number" value={balance} onChange={e=>setBalance(+e.target.value)} step="0.01"/></div>
      <div className="pe-row"><label>Total Deposited</label><input type="number" value={totalDeposit} onChange={e=>setTotalDeposit(+e.target.value)} step="0.01"/></div>
      <div className="pe-row"><label>Total Withdrawn</label><input type="number" value={totalWithdraw} onChange={e=>setTotalWithdraw(+e.target.value)} step="0.01"/></div>
      <div className="pe-row"><label>Today's Profit</label><input type="number" value={todayProfit} onChange={e=>setTodayProfit(+e.target.value)} step="0.01"/></div>
      <div className="pe-row"><label>Referrals</label><input type="number" value={referrals} onChange={e=>setReferrals(+e.target.value)}/></div>
      <div className="pe-btns">
        <button className="pe-save" onClick={() => onSave({ balance, totalDeposit, totalWithdraw, todayProfit, referrals })}>💾 Save Changes</button>
        <button className="pe-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Plan Editor ──────────────────────────────────────────────────────────────
function PlanEditor({ plan, onSave, onCancel }) {
  const [rate, setRate] = useState(plan.rate)
  const [min, setMin] = useState(plan.min)
  const [max, setMax] = useState(plan.max || '')
  const resolveDurationUnit = () => plan.durationUnit || 'days'
  const [duration, setDuration] = useState(plan.duration)
  const [durationUnit, setDurationUnit] = useState(resolveDurationUnit)
  const [hot, setHot] = useState(plan.hot)
  const resolveCurrentMinutes = () => {
    if (plan.profitIntervalMinutes) return plan.profitIntervalMinutes
    if (plan.profitIntervalMs) return plan.profitIntervalMs / 60_000
    return (plan.profitIntervalHours || 24) * 60
  }
  const [profitIntervalMinutes, setProfitIntervalMinutes] = useState(resolveCurrentMinutes)
  const [activeDays, setActiveDays] = useState(plan.activeDays || [1,2,3,4,5])
  // value = minutes
  const intervalOptions = [
    { value: 5,    label: '⚡ 5 min (test)' },
    { value: 15,   label: '⚡ 15 min (test)' },
    { value: 30,   label: '⚡ 30 min (test)' },
    { value: 60,   label: '⚡ 1 hr (test)' },
    { value: 120,  label: '⚡ 2 hr (test)' },
    { value: 180,  label: '3 hr' },
    { value: 360,  label: '6 hr' },
    { value: 720,  label: '12 hr' },
    { value: 1440, label: '24 hr (1 day)' },
    { value: 2880, label: '48 hr (2 days)' },
  ]
  const toggleDay = (dow) => setActiveDays(prev => prev.includes(dow) ? prev.filter(d=>d!==dow) : [...prev,dow].sort())
  return (
    <div className="plan-editor">
      <div className="pe-row"><label>Rate (%/day)</label><input type="number" value={rate} onChange={e=>setRate(+e.target.value)} step="0.1"/></div>
      <div className="pe-row"><label>Min (TON)</label><input type="number" value={min} onChange={e=>setMin(+e.target.value)}/></div>
      <div className="pe-row"><label>Max (TON)</label><input type="number" value={max} onChange={e=>setMax(e.target.value)} placeholder="∞"/></div>
      <div className="pe-row">
        <label>Duration</label>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <input type="number" value={duration} onChange={e=>setDuration(+e.target.value)} style={{flex:1}}/>
          <select value={durationUnit} onChange={e=>setDurationUnit(e.target.value)} className="pe-select" style={{flex:'none',width:'auto'}}>
            <option value="days">days</option>
            <option value="hours">hr ⚡</option>
          </select>
        </div>
      </div>
      <div className="pe-row">
        <label>Profit every</label>
        <select value={profitIntervalMinutes} onChange={e=>setProfitIntervalMinutes(+e.target.value)} className="pe-select">
          {intervalOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>
      <div className="pe-days-section">
        <label className="pe-days-label">Active days <span className="pe-days-hint">(unchecked = paused)</span></label>
        <div className="pe-days-grid">
          {DAY_NAMES.map((d,i) => (
            <button key={i} type="button" className={`pe-day-btn ${activeDays.includes(i)?'on':'off'} ${i===TODAY_DOW?'today':''}`} onClick={()=>toggleDay(i)}>
              {d}{i===TODAY_DOW&&<span className="pe-today-dot">•</span>}
            </button>
          ))}
        </div>
        <div className="pe-days-summary">
          {activeDays.length===0?<span className="pe-warn">⚠ Select at least 1 day</span>:<span>{activeDays.map(d=>DAY_NAMES_FULL[d]).join(', ')}</span>}
        </div>
      </div>
      <div className="pe-row"><label>HOT badge</label><input type="checkbox" checked={hot} onChange={e=>setHot(e.target.checked)} style={{width:'auto',height:'auto',cursor:'pointer'}}/></div>
      <div className="pe-btns">
        <button className="pe-save" onClick={()=>{
          if(activeDays.length===0) return
          const durMs = durationUnit === 'hours' ? duration*3_600_000 : duration*86_400_000
          onSave({rate,min,max:max?+max:null,duration,durationUnit,durationMs:durMs,profitIntervalMinutes,profitIntervalMs:profitIntervalMinutes*60_000,activeDays,hot})
        }} disabled={activeDays.length===0}>
          💾 Save Changes
        </button>
        <button className="pe-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
