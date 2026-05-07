import React, { useState } from 'react'
import { useApp } from './hooks/useApp'
import HomePage from './pages/HomePage'
import PlansPage from './pages/PlansPage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'
import BottomNav from './components/BottomNav'
import DepositModal from './components/DepositModal'
import WithdrawModal from './components/WithdrawModal'
import Toast from './components/Toast'
import './App.css'

export default function App() {
  const appState = useApp()
  const { tab, toast, isAdmin, isAdminView } = appState
  const [depositOpen, setDepositOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [depositPlan, setDepositPlan] = useState(null)

  const openDeposit = (plan = null) => { setDepositPlan(plan); setDepositOpen(true) }
  const openWithdraw = () => setWithdrawOpen(true)

  if (appState.loading) return (
    <div className="app-loading">
      <div className="loading-rings">
        {/* 3 cosmic blue rings as SVG for glow filter support */}
        <svg className="loading-rings-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{position:'absolute',inset:0,width:'100%',height:'100%',overflow:'visible'}}>
          <defs>
            <filter id="lrGlow1" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="lrGlow2" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="7" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          {/* Track */}
          <circle cx="100" cy="100" r="90" fill="none" stroke="#0a1e38" strokeWidth="3"/>
          <circle cx="100" cy="100" r="73" fill="none" stroke="#0a1e38" strokeWidth="3"/>
          <circle cx="100" cy="100" r="56" fill="none" stroke="#0a1e38" strokeWidth="2.5"/>
          {/* Dim backdrop */}
          <circle cx="100" cy="100" r="90" fill="none" stroke="#00d4ff" strokeWidth="3" opacity="0.07" strokeDasharray="566"/>
          <circle cx="100" cy="100" r="73" fill="none" stroke="#00aaff" strokeWidth="3" opacity="0.07" strokeDasharray="459"/>
          <circle cx="100" cy="100" r="56" fill="none" stroke="#00d4ff" strokeWidth="2.5" opacity="0.07" strokeDasharray="352"/>
          {/* Outer ring — cyan — fire-kissed bright */}
          <circle cx="100" cy="100" r="90" fill="none" stroke="#00d4ff" strokeWidth="3.5"
            strokeDasharray="200 366" strokeLinecap="round" filter="url(#lrGlow2)" opacity="1">
            <animateTransform attributeName="transform" type="rotate"
              from="0 100 100" to="360 100 100" dur="3s" repeatCount="indefinite"/>
          </circle>
          {/* Mid ring — electric blue — reverse */}
          <circle cx="100" cy="100" r="73" fill="none" stroke="#00aaff" strokeWidth="3"
            strokeDasharray="150 309" strokeLinecap="round" filter="url(#lrGlow1)" opacity="0.92">
            <animateTransform attributeName="transform" type="rotate"
              from="0 100 100" to="-360 100 100" dur="2.2s" repeatCount="indefinite"/>
          </circle>
          {/* Inner ring — bright cyan — fast */}
          <circle cx="100" cy="100" r="56" fill="none" stroke="#00eeff" strokeWidth="2.5"
            strokeDasharray="100 252" strokeLinecap="round" filter="url(#lrGlow2)" opacity="0.95">
            <animateTransform attributeName="transform" type="rotate"
              from="0 100 100" to="360 100 100" dur="1.5s" repeatCount="indefinite"/>
          </circle>
          {/* Pulse ripple — fire ignites rings */}
          <circle cx="100" cy="100" r="90" fill="none" stroke="#ff6a00" strokeWidth="2" opacity="0">
            <animate attributeName="r" values="90;120;90" dur="2.2s" begin="0s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.35;0;0.35" dur="2.2s" begin="0s" repeatCount="indefinite"/>
          </circle>
          <circle cx="100" cy="100" r="90" fill="none" stroke="#00d4ff" strokeWidth="1.5" opacity="0">
            <animate attributeName="r" values="90;125;90" dur="2.2s" begin="0.7s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.22;0;0.22" dur="2.2s" begin="0.7s" repeatCount="indefinite"/>
          </circle>
        </svg>

        {/* Fire T logo centered */}
        <div className="loading-fire-T">
          <svg className="loading-fire-svg" viewBox="0 0 80 95" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="lfGlow" cx="50%" cy="65%" r="50%">
                <stop offset="0%" stopColor="#ff6a00" stopOpacity="0.9"/>
                <stop offset="40%" stopColor="#ff3d00" stopOpacity="0.5"/>
                <stop offset="100%" stopColor="#ff0000" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="lfCore" cx="50%" cy="60%" r="40%">
                <stop offset="0%" stopColor="#fff5a0" stopOpacity="1"/>
                <stop offset="50%" stopColor="#ffb300" stopOpacity="0.8"/>
                <stop offset="100%" stopColor="#ff4500" stopOpacity="0"/>
              </radialGradient>
              <filter id="lfBlurBig" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="7"/>
              </filter>
              <filter id="lfBlurMid" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5"/>
              </filter>
            </defs>
            {/* Wide background glow — bleeds out, burns rings */}
            <ellipse cx="40" cy="70" rx="38" ry="26" fill="url(#lfGlow)" filter="url(#lfBlurBig)" opacity="1">
              <animate attributeName="ry" values="26;32;22;28;26" dur="2s" repeatCount="indefinite"/>
              <animate attributeName="rx" values="38;44;34;40;38" dur="1.7s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="1;0.7;1;0.8;1" dur="2s" repeatCount="indefinite"/>
            </ellipse>
            {/* Side glow spread — punches past rings */}
            <ellipse cx="40" cy="72" rx="50" ry="18" fill="#ff4500" filter="url(#lfBlurBig)" opacity="0.35">
              <animate attributeName="opacity" values="0.35;0.6;0.25;0.5;0.35" dur="1.8s" repeatCount="indefinite"/>
            </ellipse>
            {/* Main flame body */}
            <path d="M28 78 Q19 60 24 46 Q16 55 15 68 Q10 50 22 36 Q18 45 23 54 Q25 32 36 22 Q31 40 33 52 Q38 28 40 12 Q42 28 47 52 Q49 40 44 22 Q55 32 55 54 Q60 45 56 36 Q68 50 63 68 Q62 55 54 46 Q59 60 52 78 Z"
              fill="#ff4500" opacity="0.75">
              <animate attributeName="d"
                values="M28 78 Q19 60 24 46 Q16 55 15 68 Q10 50 22 36 Q18 45 23 54 Q25 32 36 22 Q31 40 33 52 Q38 28 40 12 Q42 28 47 52 Q49 40 44 22 Q55 32 55 54 Q60 45 56 36 Q68 50 63 68 Q62 55 54 46 Q59 60 52 78 Z;M30 78 Q20 61 25 45 Q15 56 14 69 Q9 49 23 35 Q19 44 24 55 Q26 31 37 20 Q32 39 34 51 Q39 27 40 10 Q41 27 46 51 Q48 39 43 20 Q54 31 54 55 Q59 44 57 35 Q71 49 65 69 Q64 56 55 45 Q60 61 50 78 Z;M28 78 Q19 60 24 46 Q16 55 15 68 Q10 50 22 36 Q18 45 23 54 Q25 32 36 22 Q31 40 33 52 Q38 28 40 12 Q42 28 47 52 Q49 40 44 22 Q55 32 55 54 Q60 45 56 36 Q68 50 63 68 Q62 55 54 46 Q59 60 52 78 Z"
                dur="0.7s" repeatCount="indefinite"/>
            </path>
            {/* Inner bright flame */}
            <path d="M33 76 Q28 62 31 50 Q26 57 27 66 Q23 52 31 42 Q29 50 32 58 Q35 40 40 28 Q45 40 48 58 Q51 50 49 42 Q57 52 53 66 Q54 57 49 50 Q52 62 47 76 Z"
              fill="#ffb300" opacity="0.9">
              <animate attributeName="d"
                values="M33 76 Q28 62 31 50 Q26 57 27 66 Q23 52 31 42 Q29 50 32 58 Q35 40 40 28 Q45 40 48 58 Q51 50 49 42 Q57 52 53 66 Q54 57 49 50 Q52 62 47 76 Z;M34 76 Q29 63 32 49 Q25 58 26 67 Q22 51 32 41 Q30 49 33 57 Q36 39 40 26 Q44 39 47 57 Q48 49 46 41 Q56 51 52 67 Q53 58 50 49 Q53 63 46 76 Z;M33 76 Q28 62 31 50 Q26 57 27 66 Q23 52 31 42 Q29 50 32 58 Q35 40 40 28 Q45 40 48 58 Q51 50 49 42 Q57 52 53 66 Q54 57 49 50 Q52 62 47 76 Z"
                dur="0.55s" repeatCount="indefinite"/>
            </path>
            {/* White-yellow core */}
            <ellipse cx="40" cy="64" rx="8" ry="13" fill="url(#lfCore)" filter="url(#lfBlurMid)">
              <animate attributeName="ry" values="13;16;11;14;13" dur="0.45s" repeatCount="indefinite"/>
            </ellipse>
          </svg>
          <span className="loading-T-text">T</span>
        </div>

        <div className="fire-sparks">
          <div className="fs"/><div className="fs"/><div className="fs"/>
          <div className="fs"/><div className="fs"/><div className="fs"/>
          <div className="fs"/><div className="fs"/><div className="fs"/>
          <div className="fs"/><div className="fs"/><div className="fs"/>
          <div className="fs"/><div className="fs"/>
        </div>
      </div>
      <span className="loading-text">TON<em>Yield</em></span>
    </div>
  )

  // ── ADMIN PANEL: shown when admin user is in admin view ──────────────
  if (isAdmin && isAdminView) {
    return (
      <div className="app">
        <div className="noise" />
        <div className="glow-top glow-red on" />
        <AdminPage {...appState} />
        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </div>
    )
  }

  // ── NORMAL USER ─────────────────────────────────────────────────
  return (
    <div className="app">
      <div className="noise" />
      <div className={`glow-top glow-gold  ${tab==='home'    ? 'on':''}`}/>
      <div className={`glow-top glow-blue  ${tab==='plans'   ? 'on':''}`}/>
      <div className={`glow-top glow-purple${tab==='profile' ? 'on':''}`}/>

      <div className="pages">
        {tab === 'home'    && <HomePage    {...appState} onDeposit={openDeposit} onWithdraw={openWithdraw} />}
        {tab === 'plans'   && <PlansPage   {...appState} onDeposit={openDeposit} />}
        {tab === 'profile' && <ProfilePage {...appState} />}
      </div>

      <BottomNav tab={tab} setTab={appState.setTab} isAdmin={false} />

      {depositOpen && (
        <DepositModal
          plans={appState.plans}
          defaultPlan={depositPlan}
          onClose={() => setDepositOpen(false)}
          showToast={appState.showToast}
          onSubmit={appState.submitDeposit}
          walletConnected={appState.walletConnected}
          onConnectWallet={appState.connectWallet}
          userBalance={appState.user?.balance || 0}
        />
      )}
      {withdrawOpen && (
        <WithdrawModal
          balance={appState.user?.balance}
          config={appState.config}
          onClose={() => setWithdrawOpen(false)}
          showToast={appState.showToast}
          onSubmit={appState.submitWithdraw}
          walletConnected={appState.walletConnected}
          onConnectWallet={appState.connectWallet}
          user={appState.user}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
