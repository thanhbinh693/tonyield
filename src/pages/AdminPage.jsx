import React, { useState, useEffect } from 'react'
import { DAY_NAMES, DAY_NAMES_FULL } from '../utils/config'
import './AdminPage.css'

const fmtDate = (ts) => {
  if (!ts) return '—'
  return new Date(Number(ts)).toLocaleString('en-US', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
}
const fmtDateShort = (dateStr) => {
  if (!dateStr) return '—'
  try { return new Date(dateStr).toLocaleDateString('en-US', { day:'2-digit', month:'short', year:'numeric' }) }
  catch { return dateStr }
}
const shortWallet = (addr) => addr ? addr.slice(0,8)+'...'+addr.slice(-6) : '—'
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
  const [userSearch, setUserSearch] = useState('')
  const [txFilter, setTxFilter] = useState('all')
  const [selectedUser, setSelectedUser] = useState(null)

  const [adminStats, setAdminStats]   = useState(null)
  const [allUsers,   setAllUsers]     = useState([])
  const [allTx,      setAllTx]        = useState([])
  const [dataLoading, setDataLoading] = useState(true)

  const loadAdminData = async () => {
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

  useEffect(() => {
    loadAdminData()
    const id = setInterval(loadAdminData, 30_000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line

  const allTxSorted = [...allTx].sort((a,b) => (b.createdAt||0) - (a.createdAt||0))
  const filteredTx  = txFilter === 'all' ? allTxSorted : allTxSorted.filter(t => t.type === txFilter)

  const filteredUsers = allUsers.filter(u => {
    if (!userSearch) return true
    const q = userSearch.toLowerCase()
    return (
      String(u.id).includes(q) ||
      (u.username||'').toLowerCase().includes(q) ||
      (u.firstName||'').toLowerCase().includes(q) ||
      (u.walletAddr||'').toLowerCase().includes(q)
    )
  })

  const stats = adminStats ? [
    { label:'Total Users',        val: adminStats.totalUsers,                color:'blue',   icon:'◉' },
    { label:'Active Users',       val: adminStats.activeUsers,               color:'green',  icon:'●' },
    { label:'Banned',             val: adminStats.bannedUsers,               color:'red',    icon:'⊘' },
    { label:'Deposited (TON)',    val: adminStats.totalDeposited.toFixed(2), color:'gold',   icon:'↓' },
    { label:'Withdrawn (TON)',    val: adminStats.totalWithdrawn.toFixed(2), color:'purple', icon:'↑' },
    { label:'Active Investments', val: adminStats.activeInvestments,         color:'blue',   icon:'▶' },
    { label:'Today Profit',       val: adminStats.todayProfit.toFixed(2),    color:'green',  icon:'◎' },
    { label:'Pending Withdraws',  val: adminStats.pendingWithdraws,          color: adminStats.pendingWithdraws > 0 ? 'red' : 'muted', icon:'⏳' },
  ] : []

  const sections = [
    { id:'overview',  label:'Overview'   },
    { id:'users',     label:'Users', badge: allUsers.length },
    { id:'deposits',  label:'Deposits',  badge: allTx.filter(t=>t.type==='deposit').length },
    { id:'withdraws', label:'Withdraws', badge: adminStats?.pendingWithdraws || 0, badgeColor: 'red' },
    { id:'history',   label:'History'    },
    { id:'plans',     label:'Plans'      },
    { id:'settings',  label:'⚙ Settings' },
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
            {config.maintenanceMode ? '⚠ Maint ON' : '⚙ Maint'}
          </button>
          <button className="adm-refresh-btn" onClick={loadAdminData} title="Refresh">⟳</button>
          <button className="exit-admin-btn" onClick={() => setIsAdmin(false)} title="Exit Admin">✕ Exit</button>
        </div>
      </div>

      <div className="cloud-sync-badge">
        <span className="csb-icon">☁</span>
        <span>Supabase {dataLoading ? '…' : '✓'}</span>
      </div>

      <div className="admin-tabs">
        {sections.map(s => (
          <div key={s.id} className={`adm-tab ${section===s.id?'on':''}`} onClick={() => setSection(s.id)}>
            {s.label}
            {s.badge > 0 && <span className={`adm-badge ${s.badgeColor||''}`}>{s.badge}</span>}
          </div>
        ))}
      </div>

      {dataLoading && !['settings','plans'].includes(section) && (
        <div className="adm-loading">Loading data from Supabase…</div>
      )}

      {/* ─── OVERVIEW ──────────────────────────────────────────────────────── */}
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
                const active = (p.activeDays||[1,2,3,4,5]).includes(TODAY_DOW)
                return (
                  <div key={p.id} className={`dsb-plan ${active?'on':'off'}`}>
                    <span className={`dsb-dot ${p.color}`}/>
                    {p.name}: <strong>{active?'Active':'Paused'}</strong>
                  </div>
                )
              })}
            </div>
          </div>
          {/* Recent transactions preview */}
          {allTxSorted.slice(0,5).length > 0 && (
            <div style={{marginTop:16}}>
              <div className="adm-sec-title" style={{marginBottom:8}}>Recent Activity</div>
              {allTxSorted.slice(0,5).map(tx => (
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
        </div>
      )}

      {/* ─── USERS ─────────────────────────────────────────────────────────── */}
      {section === 'users' && !dataLoading && (
        <div className="adm-section">
          <div className="adm-sec-title">All Users ({filteredUsers.length})</div>
          {/* Search */}
          <div className="user-search-wrap">
            <span className="user-search-icon">🔍</span>
            <input
              className="user-search-input"
              type="text"
              placeholder="Search by ID, username, wallet..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
            />
            {userSearch && <button className="user-search-clear" onClick={() => setUserSearch('')}>✕</button>}
          </div>

          {filteredUsers.length === 0 && <div className="adm-empty">No users found</div>}
          {filteredUsers.map(u => (
            <div key={u.id} className={`user-card ${u.status}`}>
              {editUser === u.id ? (
                <UserEditor
                  user={u}
                  onSave={(updates) => { adminUpdateUser(u.id, updates); setEditUser(null); setTimeout(loadAdminData, 800) }}
                  onCancel={() => setEditUser(null)}
                />
              ) : selectedUser === u.id ? (
                <UserDetail
                  user={u}
                  allTx={allTx.filter(t => Number(t.userId) === Number(u.id))}
                  onClose={() => setSelectedUser(null)}
                  onEdit={() => { setSelectedUser(null); setEditUser(u.id) }}
                  onBan={() => { adminToggleBan(u.id); setTimeout(loadAdminData, 800) }}
                />
              ) : (
                <>
                  {/* Header row */}
                  <div className="uc-header">
                    <div className="uc-avatar" style={{ background: u.status === 'banned' ? 'var(--red)' : 'var(--blue)' }}>
                      {(u.username||u.firstName||'U')[0].toUpperCase()}
                    </div>
                    <div className="uc-info">
                      <div className="uc-name">
                        {u.firstName && <span style={{color:'var(--text)',fontWeight:600}}>{u.firstName} </span>}
                        <span style={{color:'var(--muted)',fontSize:12}}>@{u.username||'—'}</span>
                      </div>
                      <div className="uc-id">
                        ID #{u.id}
                        {u.joinDate && <span style={{color:'var(--muted)',marginLeft:8}}>· Joined {fmtDateShort(u.joinDate)}</span>}
                      </div>
                    </div>
                    <span className={`user-status-badge ${u.status}`}>{u.status}</span>
                  </div>

                  {/* Wallet */}
                  {u.walletAddr && (
                    <div className="uc-wallet-row">
                      <span className="uc-wallet-icon">💎</span>
                      <span className="uc-wallet-addr" title={u.walletAddr}>{shortWallet(u.walletAddr)}</span>
                    </div>
                  )}

                  {/* Stats grid */}
                  <div className="uc-stats">
                    <div className="ucs"><div className="ucs-val">{(u.balance||0).toFixed(2)}</div><div className="ucs-lbl">Balance</div></div>
                    <div className="ucs"><div className="ucs-val" style={{color:'var(--green)'}}>{(+u.totalDeposit||0).toFixed(2)}</div><div className="ucs-lbl">Deposited</div></div>
                    <div className="ucs"><div className="ucs-val" style={{color:'var(--red)'}}>{(+u.totalWithdraw||0).toFixed(2)}</div><div className="ucs-lbl">Withdrawn</div></div>
                    <div className="ucs"><div className="ucs-val" style={{color:'var(--blue)'}}>{u.referralFriends||0}</div><div className="ucs-lbl">Referrals</div></div>
                    <div className="ucs"><div className="ucs-val" style={{color:'var(--gold)'}}>{u.activeInvestments||0}</div><div className="ucs-lbl">Active Inv</div></div>
                    <div className="ucs"><div className="ucs-val">{u.txCount||0}</div><div className="ucs-lbl">Txns</div></div>
                  </div>

                  {/* Pending withdraw warning */}
                  {u.pendingWithdraw > 0 && (
                    <div className="uc-pending-warn">
                      ⏳ Pending withdrawal: <strong>{u.pendingWithdraw.toFixed(2)} TON</strong>
                    </div>
                  )}

                  {/* Referral commission */}
                  {(u.referralCommission||0) > 0 && (
                    <div className="uc-ref-row">
                      <span>💸 Referral earned: <strong>{(+u.referralCommission).toFixed(2)} TON</strong></span>
                    </div>
                  )}

                  <div className="uc-actions">
                    <button className="uc-detail-btn" onClick={() => setSelectedUser(u.id)}>📋 Details</button>
                    <button className="uc-edit-btn"   onClick={() => setEditUser(u.id)}>✏ Edit</button>
                    <button className={`ban-btn ${u.status==='banned'?'unban':'ban'}`} onClick={() => { adminToggleBan(u.id); setTimeout(loadAdminData, 800) }}>
                      {u.status==='banned' ? '↩ Unban' : '⊗ Ban'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── DEPOSITS ──────────────────────────────────────────────────────── */}
      {section === 'deposits' && !dataLoading && (
        <div className="adm-section">
          <div className="adm-sec-title">All Deposits ({allTx.filter(t=>t.type==='deposit').length})</div>
          {allTx.filter(t=>t.type==='deposit').length === 0 && <div className="adm-empty">No deposits yet</div>}
          {allTxSorted.filter(t=>t.type==='deposit').map(tx => (
            <div key={tx.id} className="adm-tx-row">
              <div className="atr-ico deposit">↓</div>
              <div className="atr-left">
                <div className="atr-label">
                  {(() => {
                    const u = allUsers.find(u => Number(u.id)===Number(tx.userId))
                    return u ? <><strong>@{u.username||u.firstName||'—'}</strong> <span style={{color:'var(--muted)',fontSize:11}}>#{tx.userId}</span></> : `User #${tx.userId}`
                  })()}
                  <span style={{marginLeft:6, color:'var(--gold)', fontWeight:700}}> · {tx.amount} TON</span>
                </div>
                <div className="atr-date">{tx.label} · {fmtDate(tx.createdAt)}</div>
              </div>
              <span className={`adm-status ${tx.status}`}>{tx.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* ─── WITHDRAWALS ───────────────────────────────────────────────────── */}
      {section === 'withdraws' && !dataLoading && (
        <div className="adm-section">
          <div className="adm-sec-title">Withdrawals ({allTx.filter(t=>t.type==='withdraw').length})</div>
          {/* Status summary */}
          {allTx.filter(t=>t.type==='withdraw').length > 0 && (
            <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
              {['pending','processing','completed','failed'].map(s => {
                const count = allTx.filter(t=>t.type==='withdraw'&&t.status===s).length
                if (!count) return null
                const colors = { pending:'#f5a623', processing:'#3d9be9', completed:'#4cd964', failed:'#ff3b30' }
                return (
                  <div key={s} style={{ background:'var(--card)', borderRadius:8, padding:'4px 10px', fontSize:12, color:colors[s]||'var(--muted)', fontWeight:600, border:`1px solid ${colors[s]}33` }}>
                    {s}: {count}
                  </div>
                )
              })}
            </div>
          )}
          {allTx.filter(t=>t.type==='withdraw').length === 0 && <div className="adm-empty">No withdrawals yet</div>}
          {allTxSorted.filter(t=>t.type==='withdraw').map(tx => (
            <div key={tx.id} className="adm-tx-row">
              <div className="atr-ico withdraw">↑</div>
              <div className="atr-left">
                <div className="atr-label">
                  {(() => {
                    const u = allUsers.find(u => Number(u.id)===Number(tx.userId))
                    return u ? <><strong>@{u.username||u.firstName||'—'}</strong> <span style={{color:'var(--muted)',fontSize:11}}>#{tx.userId}</span></> : `User #${tx.userId}`
                  })()}
                  <span style={{marginLeft:6, color:'var(--red)', fontWeight:700}}> · {Math.abs(tx.amount)} TON</span>
                </div>
                {tx.toWallet && (
                  <div className="atr-date" style={{ fontSize:11, marginTop:2, color:'var(--blue)', fontFamily:'monospace' }}>
                    → {shortWallet(tx.toWallet)}
                  </div>
                )}
                <div className="atr-date">{fmtDate(tx.createdAt)}</div>
              </div>
              <span className={`adm-status ${tx.status}`}>{tx.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* ─── HISTORY ───────────────────────────────────────────────────────── */}
      {section === 'history' && !dataLoading && (
        <div className="adm-section">
          <div className="adm-sec-title">Transaction History ({filteredTx.length})</div>
          {/* Filter pills */}
          <div className="tx-filter-row">
            {['all','deposit','withdraw','profit','referral'].map(f => (
              <button key={f} className={`tx-filter-pill ${txFilter===f?'on':''}`} onClick={() => setTxFilter(f)}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase()+f.slice(1)}
                {f !== 'all' && <span className="tx-filter-count">{allTx.filter(t=>t.type===f).length}</span>}
              </button>
            ))}
          </div>
          {filteredTx.length === 0 && <div className="adm-empty">No transactions</div>}
          {filteredTx.map(tx => (
            <div key={tx.id} className="adm-tx-row">
              <div className={`atr-ico ${tx.type}`}>{tx.type==='deposit'?'↓':tx.type==='withdraw'?'↑':tx.type==='profit'?'◎':'⊕'}</div>
              <div className="atr-left">
                <div className="atr-label">
                  {(() => {
                    const u = allUsers.find(u => Number(u.id)===Number(tx.userId))
                    return u ? <><strong>@{u.username||u.firstName||'—'}</strong> <span style={{color:'var(--muted)',fontSize:11}}>#{tx.userId}</span></> : `User#${tx.userId}`
                  })()}
                  <span style={{color:'var(--muted)',marginLeft:4}}>· {tx.label}</span>
                </div>
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

      {/* ─── PLANS ─────────────────────────────────────────────────────────── */}
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
                <PlanEditor plan={p} onSave={(u) => { adminUpdatePlan(p.id,u); setEditPlan(null) }} onCancel={() => setEditPlan(null)} />
              ) : (
                <>
                  <div className="pec-info">
                    <div className="pec-field"><span>Rate</span><span className={`pec-rate ${p.color}`}>{p.rate}% / day</span></div>
                    <div className="pec-field"><span>Min</span><span>{p.min} TON</span></div>
                    <div className="pec-field"><span>Max</span><span>{p.max ? p.max+' TON' : '∞'}</span></div>
                    <div className="pec-field"><span>Duration</span><span>{p.duration} {p.durationUnit==='hours'?'hr ⚡':'day'}</span></div>
                    <div className="pec-field"><span>Profit every</span><span className="pec-interval">{
                      (() => {
                        const mins = p.profitIntervalMinutes || (p.profitIntervalMs ? p.profitIntervalMs/60000 : null) || (p.profitIntervalHours||24)*60
                        if (mins < 60) return `${mins} min ⚡`
                        const h = mins/60; return h >= 24 ? `${h/24} day` : `${h}hr`
                      })()
                    }</span></div>
                    <div className="pec-field"><span>Active days</span><span>{(p.activeDays||[1,2,3,4,5]).length} days/wk</span></div>
                  </div>
                  <div className="pec-days-row">
                    <span className="pec-days-label">Active days:</span>
                    <div className="pec-days">
                      {DAY_NAMES.map((d,i) => {
                        const active = (p.activeDays||[1,2,3,4,5]).includes(i)
                        return <span key={i} className={`pec-day-chip ${active?'on '+p.color:'off'} ${i===TODAY_DOW?'today':''}`}>{d}</span>
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

      {/* ─── SETTINGS ──────────────────────────────────────────────────────── */}
      {section === 'settings' && (
        <SettingsPanel config={config} onSave={adminSaveSettings} showToast={showToast} currentUserId={user?.id} />
      )}

      <div style={{height:8}}/>
    </div>
  )
}

// ─── User Detail Modal ────────────────────────────────────────────────────────
function UserDetail({ user: u, allTx, onClose, onEdit, onBan }) {
  const shortWalletLocal = (addr) => addr ? addr.slice(0,10)+'...'+addr.slice(-8) : '—'
  const fmtDateLocal = (ts) => {
    if (!ts) return '—'
    return new Date(Number(ts)).toLocaleString('en-US', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
  }
  const recentTx = [...allTx].sort((a,b) => (b.createdAt||0)-(a.createdAt||0)).slice(0,10)

  return (
    <div className="user-detail">
      <div className="ud-header">
        <div className="ud-avatar" style={{ background: u.status==='banned' ? 'var(--red)' : 'var(--blue)' }}>
          {(u.username||u.firstName||'U')[0].toUpperCase()}
        </div>
        <div className="ud-title">
          <div className="ud-name">{u.firstName || '@'+u.username}</div>
          <div className="ud-sub">@{u.username} · ID #{u.id}</div>
        </div>
        <span className={`user-status-badge ${u.status}`}>{u.status}</span>
      </div>

      <div className="ud-info-grid">
        <div className="ud-info-row"><span className="ud-lbl">First Name</span><span>{u.firstName||'—'}</span></div>
        <div className="ud-info-row"><span className="ud-lbl">Username</span><span>@{u.username||'—'}</span></div>
        <div className="ud-info-row"><span className="ud-lbl">Joined</span><span>{u.joinDate ? new Date(u.joinDate).toLocaleDateString('en-US',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</span></div>
        <div className="ud-info-row"><span className="ud-lbl">Wallet</span><span style={{fontFamily:'monospace',fontSize:11,color:'var(--blue)'}}>{shortWalletLocal(u.walletAddr)}</span></div>
        {u.walletAddr && (
          <div className="ud-info-row">
            <span className="ud-lbl"></span>
            <span style={{fontFamily:'monospace',fontSize:9,color:'var(--muted)',wordBreak:'break-all'}}>{u.walletAddr}</span>
          </div>
        )}
      </div>

      <div className="ud-stats-grid">
        <div className="ud-stat"><div className="ud-stat-val">{(u.balance||0).toFixed(2)}</div><div className="ud-stat-lbl">Balance (TON)</div></div>
        <div className="ud-stat"><div className="ud-stat-val" style={{color:'var(--green)'}}>{(+u.totalDeposit||0).toFixed(2)}</div><div className="ud-stat-lbl">Total Deposited</div></div>
        <div className="ud-stat"><div className="ud-stat-val" style={{color:'var(--red)'}}>{(+u.totalWithdraw||0).toFixed(2)}</div><div className="ud-stat-lbl">Total Withdrawn</div></div>
        <div className="ud-stat"><div className="ud-stat-val" style={{color:'var(--gold)'}}>{(+u.todayProfit||0).toFixed(2)}</div><div className="ud-stat-lbl">Today Profit</div></div>
        <div className="ud-stat"><div className="ud-stat-val">{u.activeInvestments||0}</div><div className="ud-stat-lbl">Active Inv</div></div>
        <div className="ud-stat"><div className="ud-stat-val" style={{color:'var(--blue)'}}>{u.referralFriends||0}</div><div className="ud-stat-lbl">Referrals</div></div>
        <div className="ud-stat"><div className="ud-stat-val">{u.depositCount||0}</div><div className="ud-stat-lbl">Deposits</div></div>
        <div className="ud-stat"><div className="ud-stat-val">{u.withdrawCount||0}</div><div className="ud-stat-lbl">Withdrawals</div></div>
      </div>

      {(u.referralCommission||0) > 0 && (
        <div className="ud-ref-earned">
          💸 Referral commission earned: <strong>{(+u.referralCommission).toFixed(2)} TON</strong>
        </div>
      )}
      {u.pendingWithdraw > 0 && (
        <div className="ud-pending-warn">
          ⏳ Pending withdrawal: <strong>{u.pendingWithdraw.toFixed(2)} TON</strong>
        </div>
      )}

      {/* Recent transactions */}
      {recentTx.length > 0 && (
        <div className="ud-tx-section">
          <div className="ud-tx-title">Recent Transactions ({allTx.length})</div>
          {recentTx.map(tx => (
            <div key={tx.id} className="adm-tx-row" style={{padding:'6px 0'}}>
              <div className={`atr-ico ${tx.type}`} style={{fontSize:14}}>{tx.type==='deposit'?'↓':tx.type==='withdraw'?'↑':tx.type==='profit'?'◎':'⊕'}</div>
              <div className="atr-left">
                <div className="atr-label" style={{fontSize:12}}>{tx.label}</div>
                <div className="atr-date">{fmtDateLocal(tx.createdAt)}</div>
              </div>
              <div className="atr-right">
                <span className={tx.amount>0?'pos':'neg'} style={{fontSize:13}}>{tx.amount>0?'+':''}{(+tx.amount).toFixed(2)}</span>
                <span className={`adm-status ${tx.status}`}>{tx.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="ud-actions">
        <button className="uc-edit-btn" onClick={onEdit}>✏ Edit User</button>
        <button className={`ban-btn ${u.status==='banned'?'unban':'ban'}`} onClick={onBan}>
          {u.status==='banned' ? '↩ Unban' : '⊗ Ban'}
        </button>
        <button className="ud-close-btn" onClick={onClose}>✕ Close</button>
      </div>
    </div>
  )
}

// ─── Settings Panel ───────────────────────────────────────────────────────────
function SettingsPanel({ config, onSave, showToast, currentUserId }) {
  const [adminWallet,  setAdminWallet]  = useState(config.adminWallet  || '')
  const [adminIds,     setAdminIds]     = useState(
    Array.isArray(config.adminIds) ? config.adminIds.join(', ') : config.adminIds || String(currentUserId||'')
  )
  const [botUsername,  setBotUsername]  = useState(config.botUsername  || '')
  const [referralRate, setReferralRate] = useState(config.referralRate || 5)
  const [minWithdraw,  setMinWithdraw]  = useState(config.minWithdraw  || 5)
  const [tonNetwork,   setTonNetwork]   = useState(config.tonNetwork   || 'testnet')
  const [showNetConfirm, setShowNetConfirm] = useState(false)
  const [pendingNetwork, setPendingNetwork] = useState(null)

  const handleNetworkSwitch = (net) => {
    if (net === tonNetwork) return
    setPendingNetwork(net)
    setShowNetConfirm(true)
  }

  const handleSave = () => {
    const parsedIds = adminIds.split(/[\s,]+/).map(s=>s.trim()).filter(Boolean).map(Number).filter(n=>!isNaN(n)&&n>0)
    if (!adminWallet.trim()) { showToast('Admin wallet cannot be empty','err'); return }
    if (parsedIds.length === 0) { showToast('Add at least one Admin Telegram ID','err'); return }
    onSave({ adminWallet:adminWallet.trim(), adminIds:parsedIds, botUsername:botUsername.trim(), referralRate:+referralRate, minWithdraw:+minWithdraw, tonNetwork })
  }

  const refLink = botUsername.trim() ? `https://t.me/${botUsername.trim()}?start=${currentUserId}` : '(enter bot username to preview)'

  return (
    <div className="adm-section settings-panel">
      <div className="adm-sec-title">⚙ Bot Settings</div>
      <div className="settings-info">Settings synced to Supabase — all admin devices share the same config.</div>

      <div className="setting-group">
        <div className="sg-label"><span className="sg-icon">💎</span>Admin Wallet Address (TON)</div>
        <div className="sg-desc">Receives all deposits. Must be a valid TON address (UQ… or EQ…).</div>
        <input className="sg-input" type="text" value={adminWallet} onChange={e=>setAdminWallet(e.target.value)} placeholder="UQD…" spellCheck={false}/>
      </div>

      <div className="setting-group">
        <div className="sg-label"><span className="sg-icon">🆔</span>Admin Telegram IDs</div>
        <div className="sg-desc">Comma-separated Telegram user IDs. Get yours from <strong>@userinfobot</strong>.</div>
        <input className="sg-input" type="text" value={adminIds} onChange={e=>setAdminIds(e.target.value)} placeholder="123456789, 987654321"/>
        <div className="sg-hint">Current session ID: <strong>{currentUserId}</strong></div>
      </div>

      <div className="setting-group">
        <div className="sg-label"><span className="sg-icon">🤖</span>Bot Username</div>
        <div className="sg-desc">Your bot's @username — used to generate referral links.</div>
        <div className="sg-input-prefix-wrap">
          <span className="sg-prefix">@</span>
          <input className="sg-input with-prefix" type="text" value={botUsername} onChange={e=>setBotUsername(e.target.value.replace('@',''))} placeholder="YourBotName"/>
        </div>
        <div className="sg-ref-preview">
          <span className="sg-ref-label">Ref link preview:</span>
          <span className="sg-ref-url">{refLink}</span>
        </div>
      </div>

      <div className="setting-group">
        <div className="sg-label"><span className="sg-icon">💸</span>Referral Commission (%)</div>
        <div className="sg-slider-wrap">
          <input type="range" min="1" max="30" step="0.5" value={referralRate} onChange={e=>setReferralRate(+e.target.value)} className="sg-slider"/>
          <div className="sg-slider-val">
            <span className="sg-rate-big">{referralRate}%</span>
            <span className="sg-rate-label">per referral deposit</span>
          </div>
        </div>
      </div>

      <div className="setting-group network-group">
        <div className="sg-label"><span className="sg-icon">🌐</span>TON Network</div>
        <div className="network-toggle-wrap">
          <button className={`net-btn ${tonNetwork==='testnet'?'net-active testnet':'net-inactive'}`} onClick={() => handleNetworkSwitch('testnet')}><span className="net-dot"/>🧪 Testnet</button>
          <button className={`net-btn ${tonNetwork==='mainnet'?'net-active mainnet':'net-inactive'}`} onClick={() => handleNetworkSwitch('mainnet')}><span className="net-dot"/>🚀 Mainnet</button>
        </div>
        <div className={`network-badge ${tonNetwork}`}>{tonNetwork==='testnet'?'🧪 Currently on TESTNET':'🚀 Currently on MAINNET'}</div>
        {showNetConfirm && (
          <div className="net-confirm-box">
            <div className="net-confirm-title">⚠️ Switch to {pendingNetwork}?</div>
            <div className="net-confirm-desc">{pendingNetwork==='mainnet'?'Mainnet uses real TON. Real funds.':'Testnet uses test TON only.'}</div>
            <div className="net-confirm-btns">
              <button className="net-confirm-yes" onClick={() => { setTonNetwork(pendingNetwork); setShowNetConfirm(false); setPendingNetwork(null) }}>Yes, Switch</button>
              <button className="net-confirm-no"  onClick={() => { setShowNetConfirm(false); setPendingNetwork(null) }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="setting-group">
        <div className="sg-label"><span className="sg-icon">⬇</span>Minimum Withdrawal (TON)</div>
        <div className="sg-row">
          <input className="sg-input sg-input-sm" type="number" min="1" step="0.5" value={minWithdraw} onChange={e=>setMinWithdraw(+e.target.value)}/>
          <span className="sg-unit">TON</span>
        </div>
      </div>

      <button className="sg-save-btn" onClick={handleSave}>💾 Save Settings</button>
    </div>
  )
}

// ─── User Editor ──────────────────────────────────────────────────────────────
function UserEditor({ user, onSave, onCancel }) {
  const [balance,       setBalance]       = useState(user.balance||0)
  const [totalDeposit,  setTotalDeposit]  = useState(user.totalDeposit||0)
  const [totalWithdraw, setTotalWithdraw] = useState(user.totalWithdraw||0)
  const [todayProfit,   setTodayProfit]   = useState(user.todayProfit||0)
  const [referrals,     setReferrals]     = useState(user.referrals||0)
  return (
    <div className="plan-editor">
      <div className="adm-sec-title" style={{marginBottom:12}}>
        Edit: {user.firstName && <span>{user.firstName} </span>}<span style={{color:'var(--muted)'}}>@{user.username}</span>
        <span style={{color:'var(--muted)',fontSize:12,marginLeft:8}}>#{user.id}</span>
      </div>
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
  const [max, setMax] = useState(plan.max||'')
  const [duration, setDuration] = useState(plan.duration)
  const [durationUnit, setDurationUnit] = useState(plan.durationUnit||'days')
  const [hot, setHot] = useState(plan.hot)
  const resolveCurrentMinutes = () => {
    if (plan.profitIntervalMinutes) return plan.profitIntervalMinutes
    if (plan.profitIntervalMs) return plan.profitIntervalMs/60_000
    return (plan.profitIntervalHours||24)*60
  }
  const [profitIntervalMinutes, setProfitIntervalMinutes] = useState(resolveCurrentMinutes)
  const [activeDays, setActiveDays] = useState(plan.activeDays||[1,2,3,4,5])
  const intervalOptions = [
    {value:5,label:'⚡ 5 min (test)'},{value:15,label:'⚡ 15 min (test)'},{value:30,label:'⚡ 30 min (test)'},
    {value:60,label:'⚡ 1 hr (test)'},{value:120,label:'⚡ 2 hr (test)'},{value:180,label:'3 hr'},
    {value:360,label:'6 hr'},{value:720,label:'12 hr'},{value:1440,label:'24 hr (1 day)'},{value:2880,label:'48 hr (2 days)'},
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
        {activeDays.length===0 && <span className="pe-warn">⚠ Select at least 1 day</span>}
      </div>
      <div className="pe-row"><label>HOT badge</label><input type="checkbox" checked={hot} onChange={e=>setHot(e.target.checked)} style={{width:'auto',height:'auto',cursor:'pointer'}}/></div>
      <div className="pe-btns">
        <button className="pe-save" disabled={activeDays.length===0} onClick={() => {
          if (activeDays.length===0) return
          const durMs = durationUnit==='hours' ? duration*3_600_000 : duration*86_400_000
          onSave({ rate, min, max:max?+max:null, duration, durationUnit, durationMs:durMs, profitIntervalMinutes, profitIntervalMs:profitIntervalMinutes*60_000, activeDays, hot })
        }}>💾 Save Changes</button>
        <button className="pe-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
