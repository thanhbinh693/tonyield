import { useState, useEffect, useCallback, useRef } from 'react'
import { useTonConnectUI, useTonWallet, toUserFriendlyAddress } from '@tonconnect/ui-react'
import { DEFAULT_PLANS, MIN_WITHDRAW, ADMIN_WALLET, ADMIN_IDS, TON_NETWORK, SUPABASE_URL, SUPABASE_ANON_KEY, WITHDRAW_URL } from '../utils/config'
import {
  supabase,
  getUserBundle,
  registerUser,
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
  return { code: String(tid), friends: 0, commission: 0 }
}
const DEFAULT_CONFIG = {
  minWithdraw: MIN_WITHDRAW,
  referralRate: 5,
  maintenanceMode: false,
  adminWallet: ADMIN_WALLET,
  adminIds: [...ADMIN_IDS],
  botUsername: '',
  tonNetwork: TON_NETWORK,
}

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

  // Display-only referral link (NOT stored in DB)
  const [referralLink, setReferralLink] = useState(String(tid))

  const adminMode    = checkIsAdmin(tid, config.adminIds)
  const inited       = useRef(false)
  const applyingRemote = useRef(false)

  // ─── LOAD on mount: DB is source of truth ─────────────────────────────────
  useEffect(() => {
    if (inited.current) return
    inited.current = true
    if (window.Telegram?.WebApp) { window.Telegram.WebApp.ready(); window.Telegram.WebApp.expand() }

    async function load() {
      try {
        // Step 1: Read everything from DB simultaneously
        const [bundle, cfg, savedPlans] = await Promise.all([
          getUserBundle(tid),
          getAdminConfig(null),
          getAdminPlans(null),
        ])

        // Step 2: Hydrate state from DB data
        if (bundle) {
          if (bundle.user)         setUser(p => ({ ...p, ...bundle.user }))
          if (bundle.investments)  setInvestments(bundle.investments)
          if (bundle.transactions) setTransactions(bundle.transactions)
          if (bundle.referral)     setReferral(p => ({ ...p, ...bundle.referral }))
        }
        if (cfg)        setConfig(p => ({ ...DEFAULT_CONFIG, ...cfg }))
        if (savedPlans) setPlans(savedPlans)

        // Step 3: Register + upsert fresh Telegram identity info
        // Telegram IDs can be 5–15+ digits, accept any pure numeric string
        const sp = window.Telegram?.WebApp?.initDataUnsafe?.start_param || ''
        const referredByCode = /^\d{5,15}$/.test(sp) ? sp : ''
        await registerUser(tid, referredByCode)

        // Keep username/firstName fresh from Telegram (non-destructive to balance etc)
        if (tgUser.id) {
          supabase.from('users').update({
            username:   tgUser.username   || '',
            first_name: tgUser.first_name || '',
          }).eq('id', Number(tid)).then(() => {
            setUser(p => ({
              ...p,
              username:  tgUser.username   || p.username,
              firstName: tgUser.first_name || p.firstName,
            }))
          }).catch(() => {})
        }
      } catch(e) { console.warn('[load]', e) }
      finally { setTimeout(() => setLoading(false), 500) }
    }
    load()
  }, []) // eslint-disable-line

  // ─── No more saveUserBundle persist — DB writes happen atomically
  //     at the point of each action (deposit, withdraw, profit tick).
  //     This eliminates the last-write-wins race condition across devices.

  // Keep multiple devices closer to the same DB state.
  useEffect(() => {
    if (loading || !tid) return

    let refreshTimer = null
    const refreshFromDb = () => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(async () => {
        try {
          const bundle = await getUserBundle(tid)
          if (!bundle) return

          applyingRemote.current = true
          if (bundle.user)         setUser(p => ({ ...p, ...bundle.user }))
          if (bundle.investments)  setInvestments(bundle.investments)
          if (bundle.transactions) setTransactions(bundle.transactions)
          if (bundle.referral)     setReferral(p => ({ ...p, ...bundle.referral }))

          lastSnapshot.current = JSON.stringify({
            user: bundle.user || user,
            investments: bundle.investments || [],
            transactions: bundle.transactions || [],
            referral: bundle.referral || referral,
          })
          setTimeout(() => { applyingRemote.current = false }, 100)
        } catch (e) {
          console.warn('[realtime refresh]', e)
          applyingRemote.current = false
        }
      }, 250)
    }

    const channel = supabase
      .channel(`user-sync-${tid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `id=eq.${tid}` }, refreshFromDb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments', filter: `user_id=eq.${tid}` }, refreshFromDb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${tid}` }, refreshFromDb)
      .subscribe()

    const onFocus = () => refreshFromDb()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      clearTimeout(refreshTimer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      supabase.removeChannel(channel)
    }
  }, [loading, tid]) // eslint-disable-line

  // ─── Sync wallet address ──────────────────────────────────────────────────
  useEffect(() => {
    if (wallet?.account?.address) {
      try {
        const isTestnet = (config.tonNetwork || TON_NETWORK) === 'testnet'
        const friendly  = toUserFriendlyAddress(wallet.account.address, isTestnet)
        setUser(p => p.walletAddr === friendly ? p : { ...p, walletAddr: friendly })
      } catch {
        setUser(p => ({ ...p, walletAddr: wallet.account.address }))
      }
    }
  }, [wallet, config.tonNetwork])

  // ─── Referral display link (NOT saved to DB — DB keeps numeric referral_code) ──
  useEffect(() => {
    const bot = config.botUsername?.trim()
    const link = bot ? `https://t.me/${bot}?start=${tid}` : String(tid)
    setReferralLink(link)
  }, [config.botUsername, tid])

  // ─── Profit tick (uses credit_profit RPC for CAS — prevents double-credit) ──
  useEffect(() => {
    if (loading) return

    const resolveMs = (inv) =>
      inv.profitIntervalMs
      || (inv.profitIntervalMinutes ? inv.profitIntervalMinutes * 60_000 : 0)
      || (inv.profitIntervalHours   ? inv.profitIntervalHours   * 3_600_000 : 0)
      || 86_400_000

    const tick = async () => {
      const now = Date.now()

      // Collect all investments that need processing this tick
      const toProcess = []
      setInvestments(prev => {
        prev.forEach(inv => {
          if (inv.status !== 'active' || !inv.activated) return
          if (now >= inv.nextProfitTime) {
            toProcess.push({ ...inv })
          }
        })
        return prev // Don't mutate yet — wait for DB confirmation
      })

      for (const inv of toProcess) {
        const intervalMs = resolveMs(inv)
        const ip  = +(parseFloat(inv.amount) * (inv.rate / 100)).toFixed(6)
        const iid = inv.invoiceId || String(Number(inv.id.replace(/\D/g,'').slice(-9)) % 900000 + 100000)

        if (now >= inv.endTime) {
          // Plan completed — credit remaining profit + return principal
          const totalProfit = +((Number(inv.earned)||0) + ip).toFixed(2)
          const principal   = parseFloat(inv.amount)

          const txIdPrf = 'prf-'+iid+'-'+now
          const { data: ok } = await supabase.rpc('credit_profit', {
            p_user_id:       Number(tid),
            p_investment_id: inv.id,
            p_profit:        totalProfit + principal,
            p_new_earned:    0,
            p_next_time:     now,
            p_old_next_time: inv.nextProfitTime,
            p_tx_id:         txIdPrf,
            p_tx_label:      `Profit · ${inv.plan}`,
            p_now:           now,
          })
          if (ok) {
            // Mark investment completed in DB
            await supabase.from('investments').update({ status: 'completed', earned: 0, updated_at: new Date().toISOString() }).eq('id', inv.id)
            // Insert principal return tx
            await supabase.from('transactions').insert({
              id: 'ret-'+iid+'-'+now, user_id: Number(tid), type: 'deposit',
              label: `Principal returned · ${inv.plan}`, amount: principal,
              status: 'completed', invoice_id: iid, plan_id: inv.planId, created_at: now,
            }).catch(() => {})
            // Refresh from DB
            const bundle = await getUserBundle(tid)
            if (bundle) {
              applyingRemote.current = true
              if (bundle.user)         setUser(p => ({ ...p, ...bundle.user }))
              if (bundle.investments)  setInvestments(bundle.investments)
              if (bundle.transactions) setTransactions(bundle.transactions)
              setTimeout(() => { applyingRemote.current = false }, 100)
            }
          }
          continue
        }

        // Normal profit tick — use CAS
        if (!(inv.activeDays || [1,2,3,4,5]).includes(new Date().getDay())) {
          // Inactive day — just advance timer without crediting
          await supabase.from('investments').update({
            next_profit_time: inv.nextProfitTime + intervalMs,
            updated_at: new Date().toISOString(),
          }).eq('id', inv.id).eq('next_profit_time', inv.nextProfitTime)
          continue
        }

        const newEarned = +((Number(inv.earned)||0) + ip).toFixed(2)
        const txId      = 'prf-'+iid+'-'+now
        const { data: ok } = await supabase.rpc('credit_profit', {
          p_user_id:       Number(tid),
          p_investment_id: inv.id,
          p_profit:        +ip.toFixed(2),
          p_new_earned:    newEarned,
          p_next_time:     inv.nextProfitTime + intervalMs,
          p_old_next_time: inv.nextProfitTime,
          p_tx_id:         txId,
          p_tx_label:      `Profit · ${inv.plan}`,
          p_now:           now,
        })

        if (ok) {
          // CAS succeeded — this tab won, update local state from DB
          const bundle = await getUserBundle(tid)
          if (bundle) {
            applyingRemote.current = true
            if (bundle.user)         setUser(p => ({ ...p, ...bundle.user }))
            if (bundle.investments)  setInvestments(bundle.investments)
            if (bundle.transactions) setTransactions(bundle.transactions)
            setTimeout(() => { applyingRemote.current = false }, 100)
          }
        }
        // If ok === false → another device already credited, skip silently
      }
    }

    tick()
    const id = setInterval(tick, 5_000)
    return () => clearInterval(id)
  }, [loading, tid]) // eslint-disable-line

  const showToast = useCallback((msg, type='ok') => {
    setToast({msg,type}); setTimeout(()=>setToast(null), 2800)
  }, [])

  const connectWallet    = useCallback(() => tonUI.openModal(), [tonUI])
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
      let timeLeftLabel
      if      (msLeft <= 0)         timeLeftLabel = '0m left'
      else if (msLeft < 3_600_000)  timeLeftLabel = `${Math.ceil(msLeft/60_000)}m left`
      else if (msLeft < 86_400_000) timeLeftLabel = `${Math.ceil(msLeft/3_600_000)}h left`
      else                          timeLeftLabel = `${Math.ceil(msLeft/86_400_000)}d left`
      const intervalMs = i.profitIntervalMs
        || (i.profitIntervalMinutes ? i.profitIntervalMinutes*60_000 : 0)
        || (i.profitIntervalHours   ? i.profitIntervalHours*3_600_000 : 0)
        || 86_400_000
      return { ...i, progress, timeLeftLabel, intervalMs }
    })

  // ─── Referral commission helper ───────────────────────────────────────────
  const applyReferralCommission = useCallback(async (amount, now) => {
    try {
      const referredBy = await getUserReferredBy(tid)
      if (!referredBy) return
      const depositCount = transactions.filter(t => t.type === 'deposit').length
      if (depositCount > 1) return
      const referrer = await getReferrerByCode(referredBy)
      if (!referrer || Number(referrer.id) === Number(tid)) return
      const commission = +(parseFloat(amount) * ((Number(config.referralRate)||5) / 100)).toFixed(2)
      if (commission <= 0) return
      await creditReferralCommission(referrer.id, commission, user.username || tid, tid, now)
    } catch(e) { console.warn('[applyReferralCommission]', e) }
  }, [tid, user.username, config.referralRate, transactions]) // eslint-disable-line

  // ─── DEPOSIT ──────────────────────────────────────────────────────────────
  const submitDeposit = useCallback(async (planId, amount, paymentMethod = 'wallet') => {
    const plan = plans.find(p => p.id===planId)
    if (!plan) return false
    const now = Date.now()
    const iid = makeInvId(tid, planId)
    const aw  = config.adminWallet || ADMIN_WALLET

    // Build investment object
    const rIms  = plan.profitIntervalMs || (plan.profitIntervalMinutes ? plan.profitIntervalMinutes*60_000 : 0) || (plan.profitIntervalHours ? plan.profitIntervalHours*3_600_000 : 0) || 86_400_000
    const rMin  = plan.profitIntervalMinutes || Math.round(rIms/60_000)
    const rHr   = plan.profitIntervalHours   || rIms/3_600_000
    const endMs = now + (plan.durationMs || plan.duration*86_400_000)
    const newInv = {
      id:'inv-'+now, plan:plan.name, planColor:plan.color, planId,
      amount, rate:plan.rate, earned:0, daysTotal:plan.duration,
      profitIntervalMs:rIms, profitIntervalMinutes:rMin, profitIntervalHours:rHr,
      activeDays: plan.activeDays || [0,1,2,3,4,5,6],
      startTime:now, endTime:endMs, status:'active', nextProfitTime:now+rIms,
      activated:false, invoiceId:iid,
    }
    const dbInv = {
      id:newInv.id, user_id:Number(tid), plan:plan.name, plan_color:plan.color, plan_id:planId,
      amount:parseFloat(amount), rate:plan.rate, earned:0, days_total:plan.duration,
      profit_interval_ms:rIms, profit_interval_minutes:rMin, profit_interval_hours:rHr,
      active_days:newInv.activeDays, start_time:now, end_time:endMs,
      next_profit_time:now+rIms, status:'active', activated:false, invoice_id:iid,
    }

    // ── Balance path ─────────────────────────────────────────────────────────
    if (paymentMethod === 'balance') {
      const amt = parseFloat(amount)
      if (amt > user.balance) { showToast('Insufficient balance','err'); return false }
      const newBal = Math.max(0, user.balance - amt)
      const newDep = (user.totalDeposit||0) + amt
      try {
        // DB FIRST
        await supabase.from('users').update({ balance:newBal, total_deposit:newDep, updated_at:new Date().toISOString() }).eq('id', Number(tid))
        await supabase.from('transactions').insert({ id:'tx-'+now, user_id:Number(tid), type:'deposit', label:`Reinvest · ${plan.name}`, amount:amt, status:'completed', invoice_id:iid, plan_id:planId, created_at:now })
        await supabase.from('investments').insert(dbInv)
        // STATE AFTER
        setUser(p => ({ ...p, balance:newBal, totalDeposit:newDep }))
        setTransactions(p => [{ id:'tx-'+now, type:'deposit', label:`Reinvest · ${plan.name}`, date:'Just now', amount:amt, status:'completed', invoiceId:iid, createdAt:now, planId, userId:tid }, ...p])
        setInvestments(p => [...p, newInv])
        showToast('Reinvest successful! ✓','ok')
        return true
      } catch(e) { console.error('[reinvest]',e); showToast('Reinvest failed. Try again.','err'); return false }
    }

    // ── Wallet path ───────────────────────────────────────────────────────────
    try {
      await tonUI.sendTransaction({ validUntil:Math.floor(now/1000)+600, messages:[{ address:aw, amount:toNano(amount), payload:buildPayload(iid) }] })
      await applyReferralCommission(amount, now)

      const newBal = +(user.balance + (+amount)).toFixed(2)
      const newDep = (user.totalDeposit||0) + (+amount)
      // DB FIRST
      await supabase.from('users').update({ balance:newBal, total_deposit:newDep, updated_at:new Date().toISOString() }).eq('id', Number(tid))
      await supabase.from('transactions').insert({ id:'tx-'+now, user_id:Number(tid), type:'deposit', label:`Deposit · ${plan.name}`, amount:+amount, status:'completed', invoice_id:iid, plan_id:planId, created_at:now })
      await supabase.from('investments').insert(dbInv)
      // STATE AFTER
      setUser(p => ({ ...p, balance:newBal, totalDeposit:newDep }))
      setTransactions(p => [{ id:'tx-'+now, type:'deposit', label:`Deposit · ${plan.name}`, date:'Just now', amount:+amount, status:'completed', invoiceId:iid, createdAt:now, planId, userId:tid }, ...p])
      setInvestments(p => [...p, newInv])
      showToast('Deposit successful! ✓','ok')
      return true
    } catch(e) {
      const m = e?.message||''
      if (/User rejects|CANCELLED|user rejected/i.test(m)) showToast('Transaction cancelled','err')
      else if (/invalid address/i.test(m)) showToast('Error: ADMIN_WALLET not configured.','err')
      else { console.error('[deposit]',e); showToast('Transaction failed. Try again.','err') }
      return false
    }
  }, [plans, tid, tonUI, showToast, config.adminWallet, user.balance, user.totalDeposit, applyReferralCommission])

  // ─── WITHDRAW ────────────────────────────────────────────────────────────
  const submitWithdraw = useCallback(async (amount, walletAddress) => {
    const minWd = Number(config.minWithdraw) || MIN_WITHDRAW
    if (amount < minWd)        { showToast(`Min: ${minWd} TON`, 'err'); return false }
    if (amount > user.balance) { showToast('Insufficient balance', 'err'); return false }

    const destWallet = (walletAddress || '').trim()
    if (!destWallet) { showToast('Connect your TON wallet first', 'err'); return false }

    // Validate địa chỉ TON — TEP-0002
    if (!/^[EUk0][Qg][A-Za-z0-9+/_-]{46}$/.test(destWallet)) {
      showToast('Invalid wallet address. Please reconnect your wallet.', 'err')
      return false
    }

    try {
      // ── Gọi backend — KHÔNG dùng optimistic update để tránh conflict ─────
      const initData = window.Telegram?.WebApp?.initData || ''

      const res = await fetch(WITHDRAW_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          initData,
          userId:     tid,
          amount,
          destWallet,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Withdrawal failed')
      }

      // ── Refresh state from DB after backend confirmed ────────────────────
      const bundle = await getUserBundle(tid)
      if (bundle) {
        applyingRemote.current = true
        if (bundle.user)         setUser(p => ({ ...p, ...bundle.user }))
        if (bundle.investments)  setInvestments(bundle.investments)
        if (bundle.transactions) setTransactions(bundle.transactions)
        setTimeout(() => { applyingRemote.current = false }, 100)
      } else if (data.newBalance !== undefined) {
        // Fallback if bundle fetch fails
        setUser(p => ({ ...p, balance: data.newBalance, walletAddr: destWallet }))
      }

      showToast('Withdrawal submitted! Processing... ⏳', 'ok')
      return true

    } catch (e) {
      const msg = e?.message || ''
      if (/banned/i.test(msg))              showToast('Your account is suspended.', 'err')
      else if (/Insufficient/i.test(msg))   showToast('Insufficient balance.', 'err')
      else if (/unavailable/i.test(msg))    showToast('Service busy. Please try again later.', 'err')
      else                                  showToast('Withdrawal failed. Please try again.', 'err')

      console.error('[withdraw]', e)
      return false
    }
  }, [config.minWithdraw, user.balance, tid, showToast])

  const activateInvestment = useCallback(async (invId) => {
    const inv = investments.find(i => i.id===invId)
    if (!inv) return
    const now = Date.now()
    const intervalMs    = inv.profitIntervalMs || (inv.profitIntervalHours||24)*3_600_000
    const nextProfitTime = now + intervalMs
    try {
      await supabase.from('investments').update({ activated:true, next_profit_time:nextProfitTime }).eq('id', invId)
    } catch(e) { console.warn('[activate]',e) }
    setInvestments(p => p.map(i => i.id===invId ? { ...i, activated:true, nextProfitTime } : i))
    showToast('Investment activated!','ok')
  }, [showToast, investments])

  const collectProfit = useCallback(async (invId) => {
    const inv = investments.find(i => i.id===invId)
    if (!inv) return
    const uncollected = Number(inv.earned)||0
    if (uncollected <= 0) { showToast('No profit to collect','err'); return }
    const now    = Date.now()
    const newBal = +(user.balance + uncollected).toFixed(2)
    try {
      await supabase.from('users').update({ balance:newBal, updated_at:new Date().toISOString() }).eq('id', Number(tid))
      await supabase.from('investments').update({ status:'completed', earned:0 }).eq('id', invId)
      await supabase.from('transactions').insert({ id:'collect-'+now, user_id:Number(tid), type:'profit', label:'Profit collected · '+(inv.plan||'Plan'), amount:uncollected, status:'completed', created_at:now })
      setUser(p => ({ ...p, balance:newBal }))
      setTransactions(p => [{ id:'collect-'+now, type:'profit', label:'Profit collected · '+(inv.plan||'Plan'), date:'Just now', amount:uncollected, status:'completed', createdAt:now }, ...p])
      setInvestments(p => p.map(i => i.id===invId ? { ...i, status:'completed', earned:0 } : i))
      showToast(`+${uncollected.toFixed(2)} TON collected!`,'ok')
    } catch(e) { console.error('[collect]',e); showToast('Failed to collect','err') }
  }, [showToast, investments, user.balance, tid])

  // ─── ADMIN helpers ────────────────────────────────────────────────────────
  const getAllUsers = useCallback(async () => {
    const all = await getAllUsersData()
    const users = all.map(({ id, bundle }) => ({
      id,
      ...(bundle.user || {}),
      status:             bundle.user?.status || 'active',
      activeInvestments:  (bundle.investments || []).filter(i => i.status==='active').length,
      totalInvestments:   (bundle.investments || []).length,
      txCount:            (bundle.transactions || []).length,
      depositCount:       (bundle.transactions || []).filter(t => t.type==='deposit').length,
      withdrawCount:      (bundle.transactions || []).filter(t => t.type==='withdraw').length,
      referralFriends:    bundle.referral?.friends   || 0,
      referralCommission: bundle.referral?.commission || 0,
      pendingWithdraw:    (bundle.transactions || []).filter(t => t.type==='withdraw' && t.status==='pending').reduce((s,t) => s+Math.abs(t.amount), 0),
    }))
    if (!users.some(u => Number(u.id)===Number(tid))) {
      users.push({ ...user, status:user.status||'active', activeInvestments:investments.filter(i=>i.status==='active').length })
    }
    return users
  }, [user, tid, investments])

  const getAllTransactions = useCallback(async () => {
    const all = await getAllUsersData()
    const txs = []
    all.forEach(({ id, bundle }) => {
      ;(bundle.transactions||[]).forEach(tx => txs.push({ ...tx, userId:tx.userId||id }))
    })
    return txs
  }, [])

  const computeAdminStats = useCallback(async () => {
    const all = await getAllUsersData()
    let totalDeposited=0, totalWithdrawn=0, todayPft=0, activeInv=0, pendingWithdraws=0
    const userList = []
    all.forEach(({ id, bundle }) => {
      const u = bundle.user||{}
      userList.push({ ...u, id, status:u.status||'active' })
      totalDeposited += Number(u.totalDeposit)||0
      totalWithdrawn += Number(u.totalWithdraw)||0
      todayPft       += Number(u.todayProfit)||0
      ;(bundle.investments||[]).forEach(inv => { if(inv.status==='active') activeInv++ })
      ;(bundle.transactions||[]).forEach(tx => { if(tx.type==='withdraw'&&tx.status==='pending') pendingWithdraws++ })
    })
    return {
      totalUsers:        userList.length,
      activeUsers:       userList.filter(u=>u.status!=='banned').length,
      bannedUsers:       userList.filter(u=>u.status==='banned').length,
      totalDeposited, totalWithdrawn,
      activeInvestments: activeInv,
      todayProfit:       todayPft,
      pendingWithdraws,
    }
  }, [])

  const adminToggleBan = useCallback(async (userId) => {
    const all = await getAllUsersData()
    const entry = all.find(x => Number(x.id)===Number(userId))
    if (!entry) return
    const newStatus = entry.bundle.user?.status==='banned' ? 'active' : 'banned'
    try {
      await supabase.from('users').update({ status:newStatus, updated_at:new Date().toISOString() }).eq('id', Number(userId))
    } catch(e) { console.error('[adminToggleBan]',e); showToast('Failed to update user','err'); return }
    if (Number(userId)===Number(tid)) setUser(p => ({ ...p, status:newStatus }))
    showToast(newStatus==='banned' ? 'User banned' : 'User unbanned','ok')
  }, [tid, showToast])

  const adminUpdateUser = useCallback(async (userId, updates) => {
    try {
      const id = Number(userId)
      const dbPatch = { updated_at: new Date().toISOString() }
      if (updates.balance        !== undefined) dbPatch.balance         = Number(updates.balance)
      if (updates.totalDeposit   !== undefined) dbPatch.total_deposit   = Number(updates.totalDeposit)
      if (updates.totalWithdraw  !== undefined) dbPatch.total_withdraw  = Number(updates.totalWithdraw)
      if (updates.todayProfit    !== undefined) dbPatch.today_profit    = Number(updates.todayProfit)
      if (updates.referrals      !== undefined) dbPatch.referrals       = Number(updates.referrals)
      if (updates.status         !== undefined) dbPatch.status          = updates.status
      if (updates.walletAddr     !== undefined) dbPatch.wallet_addr     = updates.walletAddr
      const { error } = await supabase.from('users').update(dbPatch).eq('id', id)
      if (error) throw error
      if (id===Number(tid)) setUser(p => ({ ...p, ...updates }))
      showToast('User updated!','ok')
    } catch(e) { console.error('[adminUpdateUser]',e); showToast('Failed to update user','err') }
  }, [tid, showToast])

  const adminUpdatePlan = useCallback((planId, updates) => {
    setPlans(prev => { const next = prev.map(p => p.id===planId ? { ...p, ...updates } : p); saveAdminPlans(next); return next })
    showToast('Plan updated!','ok')
  }, [showToast])

  const adminToggleMaintenance = useCallback(() => {
    setConfig(prev => { const next = { ...prev, maintenanceMode:!prev.maintenanceMode }; saveAdminConfig(next); return next })
  }, [])

  const adminSaveSettings = useCallback((updates) => {
    setConfig(prev => { const next = { ...prev, ...updates }; saveAdminConfig(next); return next })
    showToast('Settings saved!','ok')
  }, [showToast])

  // Build referral object for display — use referralLink (URL), not DB referral_code
  const referralDisplay = {
    ...referral,
    code: referralLink,  // Display: full URL or numeric ID
  }

  return {
    tab, setTab, loading, toast, config,
    user, plans, investments:myInvestments, transactions, referral: referralDisplay,
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
