import { useState, useEffect, useCallback, useRef } from 'react'
import { useTonConnectUI, useTonWallet, toUserFriendlyAddress } from '@tonconnect/ui-react'
import { DEFAULT_PLANS, MIN_WITHDRAW, ADMIN_WALLET, ADMIN_IDS, TON_NETWORK } from '../utils/config'
import {
  getUserBundle, saveUserBundle,
  registerUser, getRegistry,
  getAllUsersData,
  getReferrerByCode, getUserReferredBy, creditReferralCommission,
  getAdminConfig, saveAdminConfig,
  getAdminPlans, saveAdminPlans,
} from '../utils/supabase'

// ─── TON helpers ──────────────────────────────────────────────────────────────
function crc32c(data) {
  const poly = 0x82F63B78; let crc = 0xFFFFFFFF
  for (const b of data) { crc ^= b; for (let i=0;i<8;i++) crc=(crc&1)?((crc>>>1)^poly):(crc>>>1) }
  return (crc ^ 0xFFFFFFFF) >>> 0
}
function buildPayload(text) {
  const tb = new TextEncoder().encode(text)
  const cd = new Uint8Array(4+tb.length); cd.set(tb, 4)
  const cell = new Uint8Array(2+cd.length); cell[0]=0x00; cell[1]=cd.length*2; cell.set(cd,2)
  const bb = new Uint8Array(11+cell.length)
  bb[0]=0xb5;bb[1]=0xee;bb[2]=0x9c;bb[3]=0x72;bb[4]=0x41;bb[5]=0x01
  bb[6]=0x01;bb[7]=0x01;bb[8]=0x00;bb[9]=cell.length;bb[10]=0x00;bb.set(cell,11)
  const crc=crc32c(bb); const boc=new Uint8Array(bb.length+4); boc.set(bb)
  boc[bb.length]=(crc)&0xFF;boc[bb.length+1]=(crc>>>8)&0xFF;boc[bb.length+2]=(crc>>>16)&0xFF;boc[bb.length+3]=(crc>>>24)&0xFF
  let s=''; boc.forEach(b=>{s+=String.fromCharCode(b)}); return btoa(s)
}
function makeInvId(tid,pid){return String((Date.now()%900000)+100000+Number(pid))}
function toNano(a){return String(Math.round(parseFloat(a)*1e9))}

function getTgUser(){
  try{const u=window.Telegram?.WebApp?.initDataUnsafe?.user; if(u&&u.id)return u}catch{}
  return{id:0,first_name:'Dev',username:'devuser'}
}

function checkIsAdmin(id, cfgAdminIds) {
  const n = Number(id)
  if (ADMIN_IDS.includes(n)) return true
  if (Array.isArray(cfgAdminIds)) return cfgAdminIds.map(Number).includes(n)
  return false
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
function mkDefaultUser(tgUser) {
  return {
    id: tgUser.id,
    username: tgUser.username || tgUser.first_name || 'user',
    firstName: tgUser.first_name || '',
    balance: 0, totalDeposit: 0, totalWithdraw: 0, todayProfit: 0,
    referrals: 0, walletAddr: '',
    joinDate: new Date().toISOString().split('T')[0],
    status: 'active',
  }
}
function mkDefaultRef(tid) {
  return { code: `TON-${String(tid).slice(-6)}`, friends: 0, commission: 0 }
}
const DEFAULT_CONFIG = {
  minWithdraw: MIN_WITHDRAW,
  referralRate: 5,
  maintenanceMode: false,
  adminWallet: ADMIN_WALLET,
  adminIds: [...ADMIN_IDS],
  botUsername: '',
  tonNetwork: TON_NETWORK, // 'mainnet' | 'testnet' — overridable from admin panel
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useApp() {
  const tgUser = getTgUser()
  const tid    = tgUser.id

  const [tonUI] = useTonConnectUI()
  const wallet  = useTonWallet()

  const [tab,          setTab]          = useState('home')
  const [loading,      setLoading]      = useState(true)
  const [toast,        setToast]        = useState(null)
  const [isAdminView,  setIsAdminView]  = useState(false)

  const [user,         setUser]         = useState(() => mkDefaultUser(tgUser))
  const [investments,  setInvestments]  = useState([])
  const [transactions, setTransactions] = useState([])
  const [referral,     setReferral]     = useState(() => mkDefaultRef(tid))
  const [plans,        setPlans]        = useState(DEFAULT_PLANS)
  const [config,       setConfig]       = useState({ ...DEFAULT_CONFIG })

  const adminMode = checkIsAdmin(tid, config.adminIds)
  const inited    = useRef(false)
  const persistTimer = useRef(null)

  // ─── LOAD on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    if (inited.current) return
    inited.current = true
    if (window.Telegram?.WebApp) { window.Telegram.WebApp.ready(); window.Telegram.WebApp.expand() }

    async function load() {
      try {
        // All reads from localStorage (sync) or CS backup if new device
        const [bundle, cfg, savedPlans] = await Promise.all([
          getUserBundle(tid),
          getAdminConfig(null),
          getAdminPlans(null),
        ])

        if (bundle) {
          if (bundle.user)         setUser(p => ({ ...p, ...bundle.user }))
          if (bundle.investments)  setInvestments(bundle.investments)
          if (bundle.transactions) setTransactions(bundle.transactions)
          if (bundle.referral)     setReferral(p => ({ ...p, ...bundle.referral }))
        }
        if (cfg)        setConfig(p => ({ ...DEFAULT_CONFIG, ...cfg }))
        if (savedPlans) setPlans(savedPlans)

        // Register this user with referral tracking
        const sp = window.Telegram?.WebApp?.initDataUnsafe?.start_param || ''
        const rm = sp.match(/^ref_(.{6})$/)
        const referredByCode = rm ? `TON-${rm[1]}` : ''
        registerUser(tid, referredByCode)
      } catch(e) { console.warn('[load]', e) }
      finally { setTimeout(() => setLoading(false), 500) }
    }
    load()
  }, []) // eslint-disable-line

  // ─── PERSIST bundle when data changes ──────────────────────────────────────
  useEffect(() => {
    if (loading) return
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      saveUserBundle(tid, {
        user, investments, transactions, referral,
      }).catch(e => console.warn('[persist]', e))
    }, 400)
  }, [user, investments, transactions, referral, loading]) // eslint-disable-line

  // ─── Sync wallet address ──────────────────────────────────────────────────
  // TonConnect returns raw "0:abc..." — convert to friendly format before saving
  // testnet=true → kQ... prefix | mainnet → UQ... prefix
  useEffect(() => {
    if (wallet?.account?.address) {
      try {
        const isTestnet = (config.tonNetwork || TON_NETWORK) === 'testnet'
        const friendly  = toUserFriendlyAddress(wallet.account.address, isTestnet)
        setUser(p => ({ ...p, walletAddr: friendly }))
      } catch {
        setUser(p => ({ ...p, walletAddr: wallet.account.address }))
      }
    }
  }, [wallet, config.tonNetwork])

  // ─── Referral link: update when botUsername changes ────────────────────────
  useEffect(() => {
    const bot = config.botUsername?.trim()
    const code = bot
      ? `https://t.me/${bot}?start=ref_${String(tid).slice(-6)}`
      : `TON-${String(tid).slice(-6)}`
    setReferral(p => ({ ...p, code }))
  }, [config.botUsername, tid])

  // ─── Profit tick ──────────────────────────────────────────────────────────
  // Rate = X% per interval (NOT per day).
  // profitPerInterval = amount * (rate / 100)
  // On plan completion: principal (amount) is automatically refunded to balance.
  // Backward-compat: reads profitIntervalMs > profitIntervalMinutes > profitIntervalHours > default 24h
  useEffect(() => {
    const resolveIntervalMs = (inv) =>
      inv.profitIntervalMs
      || (inv.profitIntervalMinutes ? inv.profitIntervalMinutes * 60_000 : 0)
      || (inv.profitIntervalHours   ? inv.profitIntervalHours   * 3_600_000 : 0)
      || 86_400_000


    const tick = () => {
      const now = Date.now()
      const newTxs = []
      let totalBalance = 0

      setInvestments(prev => prev.map(inv => {
        if (inv.status !== 'active' || !inv.activated) return inv
        const intervalMs = resolveIntervalMs(inv)
        const ip = parseFloat(inv.amount) * (inv.rate / 100)
        const iid = inv.invoiceId || String(Number(inv.id.replace(/\D/g,'').slice(-9)) % 900000 + 100000)

        if (now >= inv.endTime) {
          // Plan completed: auto-credit all accumulated earned + last profit tick + refund principal
          const prevEarned = Number(inv.earned) || 0
          const totalProfit = +(prevEarned + ip).toFixed(2)
          const principal = parseFloat(inv.amount)
          totalBalance += totalProfit + principal
          newTxs.push({
            id: 'prf-'+iid+'-'+now, type: 'profit',
            label: `Profit · ${inv.plan}`, planName: inv.plan,
            invoiceId: iid, planId: inv.planId,
            date: 'Just now', amount: totalProfit, status: 'completed', createdAt: now,
          })
          newTxs.push({
            id: 'ret-'+iid+'-'+now, type: 'deposit',
            label: `Principal returned · ${inv.plan}`, planName: inv.plan,
            invoiceId: iid, planId: inv.planId,
            date: 'Just now', amount: principal, status: 'completed', createdAt: now,
          })
          return { ...inv, status: 'completed', earned: 0, progress: 100 }
        }
        if (now >= inv.nextProfitTime) {
          const ad = inv.activeDays || [1,2,3,4,5]
          const updated = { ...inv, profitIntervalMs: intervalMs, nextProfitTime: inv.nextProfitTime + intervalMs }
          if (ad.includes(new Date().getDay())) {
            totalBalance += ip
            newTxs.push({
              id: 'prf-'+iid+'-'+now, type: 'profit',
              label: `Profit · ${inv.plan}`, planName: inv.plan,
              invoiceId: iid, planId: inv.planId,
              date: 'Just now', amount: +ip.toFixed(2), status: 'completed', createdAt: now,
            })
            return { ...updated, earned: +((inv.earned||0)+ip).toFixed(2) }
          }
          return updated
        }
        return inv
      }))

      if (newTxs.length > 0) {
        setUser(p => ({
          ...p,
          balance: +(p.balance + totalBalance).toFixed(2),
          todayProfit: +((p.todayProfit||0) + newTxs.filter(t=>t.type==='profit').reduce((s,t)=>s+t.amount,0)).toFixed(2),
        }))
        setTransactions(p => [...newTxs, ...p])
      }
    }

    tick()
    // Tick every 5 seconds — fast enough for 5-minute intervals
    const id = setInterval(tick, 5_000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line

  const showToast = useCallback((msg, type='ok') => {
    setToast({msg,type}); setTimeout(()=>setToast(null), 2800)
  }, [])

  const connectWallet = useCallback(() => tonUI.openModal(), [tonUI])
  const disconnectWallet = useCallback(() => {
    tonUI.disconnect()
    setUser(p => ({ ...p, walletAddr:'' }))
    showToast('Wallet disconnected')
  }, [tonUI, showToast])

  const myInvestments = investments
    .filter(i => i.status==='active')
    .map(i => {
      const elapsed  = Date.now()-i.startTime
      const total    = i.endTime-i.startTime
      const msLeft   = Math.max(0, i.endTime - Date.now())
      const progress = Math.min(100, Math.round((elapsed/total)*100))
      // timeLeft: smart display
      let timeLeftLabel
      if (msLeft <= 0)                          timeLeftLabel = '0m left'
      else if (msLeft < 3_600_000)             timeLeftLabel = `${Math.ceil(msLeft/60_000)}m left`
      else if (msLeft < 86_400_000)            timeLeftLabel = `${Math.ceil(msLeft/3_600_000)}h left`
      else                                      timeLeftLabel = `${Math.ceil(msLeft/86_400_000)}d left`
      // intervalMs resolve (same as tick)
      const intervalMs = i.profitIntervalMs
        || (i.profitIntervalMinutes ? i.profitIntervalMinutes*60_000 : 0)
        || (i.profitIntervalHours   ? i.profitIntervalHours*3_600_000 : 0)
        || 86_400_000
      return { ...i, progress, timeLeftLabel, intervalMs }
    })

  // ─── DEPOSIT ──────────────────────────────────────────────────────────────
  // ── Referral helper — credit commission to referrer on FIRST deposit only ────
  const applyReferralCommission = useCallback(async (amount, now) => {
    try {
      // 1. Check if this user was referred (referred_by set at register time)
      const referredBy = await getUserReferredBy(tid)
      if (!referredBy) return  // not referred via link

      // 2. Only credit on FIRST deposit: check if user already has a deposit tx
      const depositCount = transactions.filter(t => t.type === 'deposit').length
      if (depositCount > 1) return  // this is not the first deposit

      // 3. Find referrer directly by referral_code
      const referrer = await getReferrerByCode(referredBy)
      if (!referrer || Number(referrer.id) === Number(tid)) return

      // 4. Calculate and credit commission
      const rate       = Number(config.referralRate) || 5
      const commission = +(parseFloat(amount) * (rate / 100)).toFixed(2)
      if (commission <= 0) return

      await creditReferralCommission(referrer.id, commission, user.username || tid, tid, now)
      console.log(`[Referral] +${commission} TON → referrer ${referrer.id}`)
    } catch(e) {
      console.warn('[applyReferralCommission]', e)
    }
  }, [tid, user.username, config.referralRate, transactions]) // eslint-disable-line

  const submitDeposit = useCallback(async (planId, amount, paymentMethod = 'wallet') => {
    const plan = plans.find(p => p.id===planId)
    if (!plan) return false
    const now = Date.now()
    const iid = makeInvId(tid, planId)
    const aw  = config.adminWallet || ADMIN_WALLET

    // ── Balance (reinvest) path ──────────────────────────────────────────────
    if (paymentMethod === 'balance') {
      const amt = parseFloat(amount)
      let insufficient = false
      setUser(p => {
        if (amt > p.balance) { insufficient = true; return p }
        return { ...p, balance: Math.max(0, p.balance - amt), totalDeposit: p.totalDeposit + amt }
      })
      // Wait one tick for state to settle, then check flag
      await new Promise(r => setTimeout(r, 0))
      if (insufficient) {
        showToast('Insufficient balance', 'err'); return false
      }
      setTransactions(p => [{
        id:'tx-'+now, type:'deposit', label:`Reinvest · ${plan.name}`,
        date:'Just now', amount:amt, status:'completed',
        invoiceId:iid, createdAt:now, planId, userId:tid
      }, ...p])
      const rIms = plan.profitIntervalMs
        || (plan.profitIntervalMinutes ? plan.profitIntervalMinutes * 60_000 : 0)
        || (plan.profitIntervalHours   ? plan.profitIntervalHours   * 3_600_000 : 0)
        || 86_400_000
      const rMin = plan.profitIntervalMinutes || Math.round(rIms / 60_000)
      setInvestments(p => [...p, {
        id:'inv-'+now, plan:plan.name, planColor:plan.color, planId,
        amount, rate:plan.rate, earned:0, daysTotal:plan.duration,
        profitIntervalMs: rIms,
        profitIntervalMinutes: rMin,
        profitIntervalHours: plan.profitIntervalHours || rIms / 3_600_000,
        activeDays: plan.activeDays || [0,1,2,3,4,5,6],
        startTime:now, endTime: now + (plan.durationMs || plan.duration * 86_400_000),
        status:'active', nextProfitTime: now + rIms,
        activated:false, invoiceId:iid,
      }])
      showToast('Reinvest successful! ✓', 'ok')
      return true
    }

    // ── Wallet path ──────────────────────────────────────────────────────────
    try {
      await tonUI.sendTransaction({
        validUntil: Math.floor(now/1000)+600,
        messages: [{ address:aw, amount:toNano(amount), payload:buildPayload(iid) }],
      })

      // ── Referral commission ──────────────────────────────────────────────
      await applyReferralCommission(amount, now)

      setTransactions(p => [{
        id:'tx-'+now, type:'deposit', label:`Deposit · ${plan.name}`,
        date:'Just now', amount:+amount, status:'completed',
        invoiceId:iid, createdAt:now, planId, userId:tid
      }, ...p])
      const dIms = plan.profitIntervalMs
        || (plan.profitIntervalMinutes ? plan.profitIntervalMinutes * 60_000 : 0)
        || (plan.profitIntervalHours   ? plan.profitIntervalHours   * 3_600_000 : 0)
        || 86_400_000
      const dMin = plan.profitIntervalMinutes || Math.round(dIms / 60_000)
      setInvestments(p => [...p, {
        id:'inv-'+now, plan:plan.name, planColor:plan.color, planId,
        amount, rate:plan.rate, earned:0, daysTotal:plan.duration,
        profitIntervalMs: dIms,
        profitIntervalMinutes: dMin,
        profitIntervalHours: plan.profitIntervalHours || dIms / 3_600_000,
        activeDays: plan.activeDays || [0,1,2,3,4,5,6],
        startTime:now, endTime: now + (plan.durationMs || plan.duration * 86_400_000),
        status:'active', nextProfitTime: now + dIms,
        activated:false, invoiceId:iid,
      }])
      setUser(p => ({ ...p, balance:p.balance+(+amount), totalDeposit:p.totalDeposit+(+amount) }))
      showToast('Deposit successful! ✓', 'ok')
      return true
    } catch(e) {
      const m = e?.message || ''
      if (/User rejects|CANCELLED|user rejected/i.test(m)) showToast('Transaction cancelled','err')
      else if (/invalid address/i.test(m)) showToast('Error: ADMIN_WALLET is not configured correctly.','err')
      else { console.error('[deposit]',e); showToast('Transaction failed. Try again.','err') }
      return false
    }
  }, [plans, tid, tonUI, showToast, config.adminWallet, config.referralRate, user.username])

  // ─── WITHDRAW (Auto — backend sends TON from admin wallet) ─────────────
  // User connects TonConnect wallet once to get destination wallet address.
  // Backend worker automatically sends TON from admin wallet → user wallet.
  // User does NOT need to sign or confirm any transaction.
  const submitWithdraw = useCallback(async (amount, walletAddress) => {
    const minWd = Number(config.minWithdraw) || MIN_WITHDRAW
    if (amount < minWd)        { showToast(`Min: ${minWd} TON`, 'err'); return false }
    if (amount > user.balance) { showToast('Insufficient balance', 'err'); return false }

    // Use wallet address from WithdrawModal (already converted to UQ... before passing in)
    const destWallet = (walletAddress || '').trim()
    if (!destWallet) {
      showToast('Wallet not connected. Please connect your TON wallet.', 'err')
      return false
    }
    // Accept both mainnet (UQ.../EQ...) and testnet (kQ.../0Q...) friendly addresses
    const isFriendlyAddr = /^[UEk0][Qq][A-Za-z0-9_-]+=?$/.test(destWallet)
    if (!isFriendlyAddr) {
      showToast('Invalid wallet address format. Please reconnect your wallet.', 'err')
      console.error('[withdraw] Invalid address format, got:', destWallet)
      return false
    }
    if (user.walletAddr && user.walletAddr !== destWallet) {
      console.warn('[withdraw] Wallet address changed:', user.walletAddr, '→', destWallet)
    }

    const now = Date.now()
    const txId = 'tx-' + now

    try {
      const { supabase } = await import('../utils/supabase')
      const newBalance = Math.max(0, user.balance - amount)

      // 1. Sync user balance + wallet address to Supabase FIRST
      //    Worker reads from DB — if balance/wallet not synced, refund logic breaks
      const { error: syncErr } = await supabase.from('users').upsert({
        id:          Number(tid),
        balance:     newBalance,
        wallet_addr: destWallet,
        updated_at:  new Date().toISOString(),
      }, { onConflict: 'id' })
      if (syncErr) {
        console.error('[withdraw] Failed to sync user to Supabase:', syncErr)
        throw syncErr
      }

      // 2. Deduct balance in local state (optimistic — already saved to DB above)
      setUser(p => ({ ...p, balance: newBalance, walletAddr: destWallet }))

      // 3. Create pending transaction — backend worker will pick it up & send TON
      const { error } = await supabase.from('transactions').insert({
        id:         txId,
        user_id:    Number(tid),
        type:       'withdraw',
        label:      `Withdrawal → ${destWallet.slice(0, 8)}...`,
        amount:     amount,
        status:     'pending',
        to_wallet:  destWallet,
        created_at: now,
      })
      if (error) throw error

      // 4. Update local transaction list
      setTransactions(p => [{
        id: txId, type: 'withdraw',
        label: `Withdrawal → ${destWallet.slice(0, 8)}...`,
        date: 'Just now', amount: -amount, status: 'pending',
        createdAt: now, toWallet: destWallet, userId: tid,
      }, ...p])

      showToast('Withdrawal submitted! Processing... ⏳', 'ok')
      return true
    } catch (e) {
      // Refund balance if failed (revert optimistic update)
      setUser(p => ({ ...p, balance: p.balance + amount }))
      console.error('[withdraw]', e)
      showToast('Failed to submit withdrawal. Try again.', 'err')
      return false
    }
  }, [config.minWithdraw, user.balance, user.walletAddr, wallet, tid, showToast])


  const activateInvestment = useCallback((invId) => {
    // Activate investment: set flag only, profit starts on next tick
    setInvestments(p => p.map(i =>
      i.id===invId ? { ...i, activated:true, nextProfitTime:Date.now()+(i.profitIntervalMs || (i.profitIntervalHours||24)*3_600_000) } : i
    ))
    showToast('Investment activated!','ok')
  }, [showToast])

  // Collect: for expired investments — adds all uncollected earned to balance
  const collectProfit = useCallback((invId) => {
    setInvestments(prev => {
      const inv = prev.find(i => i.id === invId)
      if (!inv) return prev
      const uncollected = Number(inv.earned) || 0
      if (uncollected <= 0) {
        showToast('No profit to collect', 'err')
        return prev
      }
      const now = Date.now()
      // Add to balance
      setUser(p => ({
        ...p,
        balance: p.balance + uncollected,
        totalWithdraw: p.totalWithdraw, // unchanged
      }))
      // Create profit transaction
      setTransactions(p => [{
        id: 'collect-' + now,
        type: 'profit',
        label: 'Profit collected · ' + (inv.plan || 'Plan'),
        date: 'Just now',
        amount: uncollected,
        status: 'completed',
        createdAt: now,
      }, ...p])
      showToast(`+${uncollected.toFixed(2)} TON collected!`, 'ok')
      // Mark investment as collected (status completed, earned reset)
      return prev.map(i => i.id === invId ? { ...i, status: 'completed', earned: 0 } : i)
    })
  }, [showToast])

  // ─── ADMIN helpers ────────────────────────────────────────────────────────
  const getAllUsers = useCallback(async () => {
    const all = await getAllUsersData()
    const users = all.map(({ id, bundle }) => ({
      id,
      ...(bundle.user || {}),
      status: bundle.user?.status || 'active',
    }))
    // Ensure admin always sees themselves
    if (!users.some(u => Number(u.id) === Number(tid))) {
      users.push({ ...user, status: user.status || 'active' })
    }
    return users
  }, [user, tid])

  const getAllTransactions = useCallback(async () => {
    const all = await getAllUsersData()
    const txs = []
    all.forEach(({ id, bundle }) => {
      ;(bundle.transactions || []).forEach(tx => txs.push({ ...tx, userId: tx.userId || id }))
    })
    return txs
  }, [])

  // computeAdminStats: 1 getAllUsersData call, computes everything from it
  const computeAdminStats = useCallback(async () => {
    const all = await getAllUsersData()
    let totalDeposited=0, totalWithdrawn=0, todayPft=0, activeInv=0
    const userList = []

    all.forEach(({ id, bundle }) => {
      const u = bundle.user || {}
      userList.push({ ...u, id, status:u.status||'active' })
      totalDeposited += Number(u.totalDeposit)  || 0
      totalWithdrawn += Number(u.totalWithdraw) || 0
      todayPft       += Number(u.todayProfit)   || 0
      ;(bundle.transactions || []).forEach(tx => {
      })
      ;(bundle.investments || []).forEach(inv => {
        if (inv.status==='active') activeInv++
      })
    })

    return {
      totalUsers:        userList.length,
      activeUsers:       userList.filter(u => u.status!=='banned').length,
      totalDeposited,  totalWithdrawn,
      activeInvestments: activeInv,
      todayProfit:       todayPft,
    }
  }, [])

  const adminToggleBan = useCallback(async (userId) => {
    const all = await getAllUsersData()
    const entry = all.find(x => Number(x.id)===Number(userId))
    if (!entry) return
    const newStatus = entry.bundle.user?.status==='banned' ? 'active' : 'banned'
    entry.bundle.user = { ...(entry.bundle.user||{}), status:newStatus }
    await saveUserBundle(userId, entry.bundle)
    if (Number(userId)===Number(tid)) setUser(p => ({ ...p, status:newStatus }))
    showToast(newStatus==='banned' ? 'User banned' : 'User unbanned','ok')
  }, [tid, showToast])

  const adminUpdateUser = useCallback(async (userId, updates) => {
    const all = await getAllUsersData()
    const entry = all.find(x => Number(x.id)===Number(userId))
    const bundle = entry?.bundle || {}
    bundle.user = { ...(bundle.user||{}), ...updates }
    await saveUserBundle(userId, bundle)
    if (Number(userId)===Number(tid)) setUser(p => ({ ...p, ...updates }))
    showToast('User updated!','ok')
  }, [tid, showToast])

  const adminUpdatePlan = useCallback((planId, updates) => {
    setPlans(prev => {
      const next = prev.map(p => p.id===planId ? { ...p, ...updates } : p)
      saveAdminPlans(next)
      return next
    })
    showToast('Plan updated!','ok')
  }, [showToast])

  const adminToggleMaintenance = useCallback(() => {
    setConfig(prev => {
      const next = { ...prev, maintenanceMode:!prev.maintenanceMode }
      saveAdminConfig(next)
      return next
    })
  }, [])

  // KEY FIX: adminSaveSettings writes localStorage immediately → all users load it on app open
  const adminSaveSettings = useCallback((updates) => {
    setConfig(prev => {
      const next = { ...prev, ...updates }
      saveAdminConfig(next)   // ghi localStorage + CS backup
      return next
    })
    showToast('Settings saved!','ok')
  }, [showToast])

  return {
    tab, setTab, loading, toast, config,
    user, plans, investments:myInvestments, transactions, referral,
    isAdmin:adminMode, isAdminView, setIsAdmin:setIsAdminView,
    walletConnected:!!wallet, wallet,
    connectWallet, disconnectWallet, showToast,
    submitDeposit, submitWithdraw, activateInvestment, collectProfit,
    computeAdminStats, getAllUsers, getAllTransactions,
    adminApproveDeposit:()=>{}, adminRejectDeposit:()=>{},
    adminApproveWithdraw:()=>{}, adminRejectWithdraw:()=>{},
    adminToggleBan, adminUpdateUser, adminUpdatePlan,
    adminToggleMaintenance, adminSaveSettings,
  }
}