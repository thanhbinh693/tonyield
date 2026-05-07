/**
 * supabase.js — Data layer using Supabase
 * ─────────────────────────────────────────────────────────────────────────────
 * v2 — Nâng cấp đồng bộ real-time:
 *   • Realtime subscription cho user row + investments (push tức thì giữa 2 tab/máy)
 *   • creditProfitAtomic() dùng Postgres RPC để tránh double-credit khi 2 tab cùng tick
 *   • saveUserBundle() dùng optimistic lock (updated_at) → tab cũ không overwrite tab mới
 *   • pollUserBundle() — fallback polling 30s nếu Realtime bị block (proxy/firewall)
 */

import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, DEFAULT_PLANS } from './config'

// ─── Supabase client ──────────────────────────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function check(result, label = '') {
  if (result.error) {
    console.error(`[supabase] ${label}`, result.error)
    throw result.error
  }
  return result.data
}

// ─── USER BUNDLE ─────────────────────────────────────────────────────────────

export async function getUserBundle(telegramId) {
  const id = Number(telegramId)

  const [userRes, invRes, txRes] = await Promise.all([
    supabase.from('users').select('*').eq('id', id).maybeSingle(),
    supabase.from('investments').select('*').eq('user_id', id),
    supabase.from('transactions').select('*').eq('user_id', id).order('created_at', { ascending: false }),
  ])

  const user = userRes.data
  if (!user) return null

  return {
    user: dbUserToApp(user),
    investments: (invRes.data || []).map(dbInvToApp),
    transactions: (txRes.data || []).map(dbTxToApp),
    referral: {
      code:       user.referral_code    || String(id),
      friends:    user.referral_friends || 0,
      commission: user.referral_commission || 0,
    },
    _updatedAt: user.updated_at, // dùng cho optimistic lock
  }
}

/**
 * saveUserBundle — optimistic lock bằng updated_at.
 * Nếu DB đã có bản mới hơn (tab khác vừa ghi), bỏ qua để tránh overwrite.
 */
export async function saveUserBundle(telegramId, bundle, lastKnownUpdatedAt = null) {
  const id = Number(telegramId)
  const { user, investments = [], transactions = [], referral = {} } = bundle

  // 1. Upsert user row — kiểm tra optimistic lock
  const userRow = { ...appUserToDb(id, user, referral) }

  if (lastKnownUpdatedAt) {
    const { data: current } = await supabase
      .from('users').select('updated_at').eq('id', id).maybeSingle()
    // Nếu DB đã có bản mới hơn → không overwrite balance/data
    if (current && current.updated_at > lastKnownUpdatedAt) {
      console.warn('[saveUserBundle] Skipping user row — newer version in DB (another tab wrote first)')
    } else {
      check(
        await supabase.from('users').upsert(userRow, { onConflict: 'id' }),
        'saveUserBundle:user'
      )
    }
  } else {
    check(
      await supabase.from('users').upsert(userRow, { onConflict: 'id' }),
      'saveUserBundle:user'
    )
  }

  // 2. Upsert investments
  if (investments.length > 0) {
    const invRows = investments.map(i => appInvToDb(id, i))
    check(
      await supabase.from('investments').upsert(invRows, { onConflict: 'id' }),
      'saveUserBundle:investments'
    )
  }

  // 3. Upsert transactions
  if (transactions.length > 0) {
    const txRows = transactions.map(t => appTxToDb(id, t))
    check(
      await supabase.from('transactions').upsert(txRows, { onConflict: 'id' }),
      'saveUserBundle:transactions'
    )
  }
}

// ─── ATOMIC PROFIT CREDIT ─────────────────────────────────────────────────────
/**
 * creditProfitAtomic — cộng profit và cập nhật next_profit_time ngay trên DB
 * bằng Postgres RPC để tránh double-credit khi 2 tab cùng tick vào cùng lúc.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Chạy SQL này trong Supabase Dashboard → SQL Editor trước khi dùng:
 * ═══════════════════════════════════════════════════════════════════════════
 * CREATE OR REPLACE FUNCTION credit_profit(
 *   p_user_id        BIGINT,
 *   p_investment_id  TEXT,
 *   p_profit         NUMERIC,
 *   p_new_earned     NUMERIC,
 *   p_next_time      BIGINT,
 *   p_old_next_time  BIGINT,
 *   p_tx_id          TEXT,
 *   p_tx_label       TEXT,
 *   p_now            BIGINT
 * ) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
 * DECLARE updated_count INT;
 * BEGIN
 *   -- Atomic CAS: chỉ update nếu next_profit_time vẫn là giá trị cũ
 *   UPDATE investments SET
 *     earned = p_new_earned,
 *     next_profit_time = p_next_time,
 *     updated_at = NOW()
 *   WHERE id = p_investment_id
 *     AND user_id = p_user_id
 *     AND next_profit_time = p_old_next_time;
 *   GET DIAGNOSTICS updated_count = ROW_COUNT;
 *   IF updated_count = 0 THEN RETURN FALSE; END IF;
 *
 *   UPDATE users SET
 *     balance = balance + p_profit,
 *     today_profit = today_profit + p_profit,
 *     updated_at = NOW()
 *   WHERE id = p_user_id;
 *
 *   INSERT INTO transactions(id, user_id, type, label, amount, status, created_at)
 *   VALUES(p_tx_id, p_user_id, 'profit', p_tx_label, p_profit, 'completed', p_now)
 *   ON CONFLICT (id) DO NOTHING;
 *
 *   RETURN TRUE;
 * END;
 * $$;
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Returns:
 *   true     = profit credited successfully
 *   false    = skipped (đã credit bởi tab khác — nextProfitTime đã đổi)
 *   'fallback' = RPC chưa tồn tại, dùng client-side (legacy)
 */
export async function creditProfitAtomic({
  userId, investmentId, profit, newEarned,
  nextProfitTime, oldNextProfitTime,
  txId, txLabel, now,
}) {
  try {
    const { data, error } = await supabase.rpc('credit_profit', {
      p_user_id:       Number(userId),
      p_investment_id: investmentId,
      p_profit:        profit,
      p_new_earned:    newEarned,
      p_next_time:     nextProfitTime,
      p_old_next_time: oldNextProfitTime,
      p_tx_id:         txId,
      p_tx_label:      txLabel,
      p_now:           now,
    })
    if (error) throw error
    return data === true
  } catch (e) {
    if (e?.code === 'PGRST202' || e?.message?.includes('not exist')) {
      console.warn('[creditProfitAtomic] RPC credit_profit not found — using client fallback (install SQL function to prevent double-credit)')
      return 'fallback'
    }
    console.error('[creditProfitAtomic]', e)
    return 'fallback'
  }
}

// ─── REALTIME SUBSCRIPTION ────────────────────────────────────────────────────

/**
 * subscribeUserData — subscribe Supabase Realtime cho user + investments + tx.
 * Gọi callback ngay khi DB thay đổi từ bất kỳ tab/thiết bị nào.
 *
 * @param {number} telegramId
 * @param {object} callbacks
 *   onUserChange(newUserObj)               — user row thay đổi (balance, status...)
 *   onInvChange({ eventType, investment, oldId }) — investment insert/update/delete
 *   onTxChange({ eventType, tx })          — transaction mới insert
 * @returns {function} unsubscribe — gọi khi component unmount
 */
export function subscribeUserData(telegramId, { onUserChange, onInvChange, onTxChange } = {}) {
  const id = Number(telegramId)
  const channelName = `user-rt-${id}`

  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'users',
      filter: `id=eq.${id}`,
    }, (payload) => {
      if (payload.new && onUserChange) {
        onUserChange(dbUserToApp(payload.new))
      }
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'investments',
      filter: `user_id=eq.${id}`,
    }, (payload) => {
      if (onInvChange) {
        onInvChange({
          eventType:  payload.eventType,
          investment: payload.new ? dbInvToApp(payload.new) : null,
          oldId:      payload.old?.id,
        })
      }
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'transactions',
      filter: `user_id=eq.${id}`,
    }, (payload) => {
      if (onTxChange && payload.new) {
        onTxChange({
          eventType: payload.eventType,
          tx: dbTxToApp(payload.new),
        })
      }
    })
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[Realtime] Connected: ${channelName}`)
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[Realtime] Channel error — polling fallback will handle sync', err)
      } else if (status === 'TIMED_OUT') {
        console.warn('[Realtime] Timed out — will retry automatically')
      }
    })

  return () => {
    supabase.removeChannel(channel)
    console.log(`[Realtime] Unsubscribed: ${channelName}`)
  }
}

/**
 * pollUserBundle — polling fallback mỗi 30s.
 * Dùng khi Realtime không khả dụng (proxy, firewall corporate, Telegram WebView cũ).
 * Hook useApp sẽ tự bật polling nếu Realtime báo lỗi.
 *
 * @returns {function} unsubscribe
 */
export function pollUserBundle(telegramId, onBundle, intervalMs = 30_000) {
  let active = true
  const run = async () => {
    if (!active) return
    try {
      const bundle = await getUserBundle(telegramId)
      if (bundle && active) onBundle(bundle)
    } catch (e) {
      console.warn('[poll]', e)
    }
  }
  // Delay first poll 5s để không đụng load ban đầu
  const init = setTimeout(run, 5_000)
  const timer = setInterval(run, intervalMs)
  return () => {
    active = false
    clearTimeout(init)
    clearInterval(timer)
  }
}

// ─── REGISTER ─────────────────────────────────────────────────────────────────

export async function registerUser(telegramId, referredByCode = '') {
  const id = Number(telegramId)
  if (!id) return
  const referral_code = String(id)
  const row = { id, referral_code }
  if (referredByCode) row.referred_by = referredByCode
  await supabase.from('users').upsert(row, { onConflict: 'id', ignoreDuplicates: true })
}

export async function getReferrerByCode(refCode) {
  if (!refCode) return null
  const { data } = await supabase
    .from('users').select('*').eq('referral_code', refCode).maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    bundle: {
      user: dbUserToApp(data),
      referral: {
        code:       data.referral_code || String(data.id),
        friends:    data.referral_friends || 0,
        commission: data.referral_commission || 0,
      },
    },
  }
}

export async function getUserReferredBy(telegramId) {
  const id = Number(telegramId)
  const { data } = await supabase.from('users').select('referred_by').eq('id', id).maybeSingle()
  return data?.referred_by || ''
}

export async function creditReferralCommission(referrerId, commission, inviteeUsername, inviteeId, now) {
  const rid = Number(referrerId)
  const { data: ref } = await supabase
    .from('users').select('balance, referral_friends, referral_commission').eq('id', rid).maybeSingle()
  if (!ref) return

  await supabase.from('users').update({
    balance:             +((Number(ref.balance) || 0) + commission).toFixed(2),
    referral_friends:    (ref.referral_friends || 0) + 1,
    referral_commission: +((Number(ref.referral_commission) || 0) + commission).toFixed(2),
    updated_at:          new Date().toISOString(),
  }).eq('id', rid)

  await supabase.from('transactions').insert({
    id:         'ref-' + rid + '-' + now,
    user_id:    rid,
    type:       'referral',
    label:      `Referral · @${inviteeUsername || inviteeId}`,
    amount:     commission,
    status:     'completed',
    created_at: now,
  })
}

// ─── REGISTRY ─────────────────────────────────────────────────────────────────

export async function getRegistry() {
  const { data } = await supabase.from('users').select('id')
  return (data || []).map(r => r.id)
}

// ─── ADMIN CONFIG ─────────────────────────────────────────────────────────────

export async function getAdminConfig(fallback = null) {
  const { data } = await supabase.from('admin_config').select('*').eq('id', 1).maybeSingle()
  if (!data) return fallback
  return {
    minWithdraw:      data.min_withdraw,
    referralRate:     data.referral_rate,
    maintenanceMode:  data.maintenance_mode,
    adminWallet:      data.admin_wallet,
    adminIds:         data.admin_ids || [],
    botUsername:      data.bot_username || '',
    tonNetwork:       data.ton_network || 'testnet',
  }
}

export async function saveAdminConfig(cfg) {
  check(
    await supabase.from('admin_config').upsert({
      id:               1,
      min_withdraw:     cfg.minWithdraw,
      referral_rate:    cfg.referralRate,
      maintenance_mode: cfg.maintenanceMode,
      admin_wallet:     cfg.adminWallet,
      admin_ids:        cfg.adminIds || [],
      bot_username:     cfg.botUsername || '',
      ton_network:      cfg.tonNetwork || 'testnet',
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'id' }),
    'saveAdminConfig'
  )
}

// ─── PLANS ────────────────────────────────────────────────────────────────────

export async function getAdminPlans(fallback = null) {
  const { data } = await supabase.from('plans').select('*').order('id')
  if (!data || data.length === 0) return fallback
  return data.map(p => {
    const durationUnit          = p.duration_unit           || 'days'
    const profitIntervalMs      = p.profit_interval_ms
      || (p.profit_interval_minutes ? p.profit_interval_minutes * 60_000 : 0)
      || (p.profit_interval_hours   ? p.profit_interval_hours   * 3_600_000 : 0)
      || 86_400_000
    const profitIntervalMinutes = p.profit_interval_minutes
      || (p.profit_interval_ms      ? p.profit_interval_ms      / 60_000    : 0)
      || (p.profit_interval_hours   ? p.profit_interval_hours   * 60        : 1440)
    const durationMs            = p.duration_ms             || (durationUnit === 'hours' ? p.duration * 3_600_000 : p.duration * 86_400_000)
    return {
      id:                    p.id,
      name:                  p.name,
      tier:                  p.tier,
      min:                   p.min_amount,
      max:                   p.max_amount,
      rate:                  p.rate,
      duration:              p.duration,
      durationUnit,
      durationMs,
      profitIntervalMinutes,
      profitIntervalMs,
      profitIntervalHours:   p.profit_interval_hours,
      activeDays:            p.active_days || [1,2,3,4,5],
      color:                 p.color,
      hot:                   p.hot,
    }
  })
}

export async function saveAdminPlans(plans) {
  const rows = plans.map(p => {
    const profitIntervalMinutes = p.profitIntervalMinutes
      || (p.profitIntervalMs ? p.profitIntervalMs / 60_000 : null)
      || (p.profitIntervalHours ? p.profitIntervalHours * 60 : 1440)
    const profitIntervalMs = p.profitIntervalMs || profitIntervalMinutes * 60_000
    const durationUnit = p.durationUnit || 'days'
    const durationMs = p.durationMs || (durationUnit === 'hours' ? p.duration * 3_600_000 : p.duration * 86_400_000)
    return {
      id:                      p.id,
      name:                    p.name,
      tier:                    p.tier || 'Starter',
      min_amount:              p.min,
      max_amount:              p.max,
      rate:                    p.rate,
      duration:                p.duration,
      duration_unit:           durationUnit,
      duration_ms:             durationMs,
      profit_interval_minutes: profitIntervalMinutes,
      profit_interval_ms:      profitIntervalMs,
      profit_interval_hours:   p.profitIntervalHours || (profitIntervalMinutes / 60),
      active_days:             p.activeDays || [1,2,3,4,5],
      color:                   p.color,
      hot:                     p.hot || false,
      updated_at:              new Date().toISOString(),
    }
  })
  check(
    await supabase.from('plans').upsert(rows, { onConflict: 'id' }),
    'saveAdminPlans'
  )
}

// ─── ADMIN: get all users data ─────────────────────────────────────────────────

export async function getAllUsersData() {
  const [usersRes, invRes, txRes] = await Promise.all([
    supabase.from('users').select('*'),
    supabase.from('investments').select('*'),
    supabase.from('transactions').select('*').order('created_at', { ascending: false }),
  ])

  const users = usersRes.data || []
  const investments = invRes.data || []
  const transactions = txRes.data || []

  return users.map(u => {
    const uid = u.id
    const userInvs = investments.filter(i => i.user_id === uid).map(dbInvToApp)
    const userTxs  = transactions.filter(t => t.user_id === uid).map(dbTxToApp)
    return {
      id: uid,
      bundle: {
        user: dbUserToApp(u),
        investments: userInvs,
        transactions: userTxs,
        referral: {
          code:       u.referral_code || String(uid).slice(-6),
          friends:    u.referral_friends || 0,
          commission: u.referral_commission || 0,
        },
      },
    }
  })
}

// ─── Legacy compat ────────────────────────────────────────────────────────────
export const csAdminGet = getAdminConfig
export const csAdminSet = saveAdminConfig

// ═════════════════════════════════════════════════════════════════════════════
// MAPPING HELPERS  (DB ↔ App)
// ═════════════════════════════════════════════════════════════════════════════

export function dbUserToApp(u) {
  return {
    id:            u.id,
    username:      u.username      || '',
    firstName:     u.first_name    || '',
    balance:       Number(u.balance)        || 0,
    totalDeposit:  Number(u.total_deposit)  || 0,
    totalWithdraw: Number(u.total_withdraw) || 0,
    todayProfit:   Number(u.today_profit)   || 0,
    referrals:     u.referrals     || 0,
    walletAddr:    u.wallet_addr   || '',
    joinDate:      u.join_date     || '',
    status:        u.status        || 'active',
    referredBy:    u.referred_by   || '',
    _updatedAt:    u.updated_at    || '',
  }
}

function appUserToDb(id, user, referral = {}) {
  return {
    id,
    username:             user?.username      || '',
    first_name:           user?.firstName     || '',
    balance:              Number(user?.balance)        || 0,
    total_deposit:        Number(user?.totalDeposit)   || 0,
    total_withdraw:       Number(user?.totalWithdraw)  || 0,
    today_profit:         Number(user?.todayProfit)    || 0,
    referrals:            user?.referrals     || 0,
    wallet_addr:          user?.walletAddr    || '',
    join_date:            user?.joinDate      || new Date().toISOString().split('T')[0],
    status:               user?.status        || 'active',
    referral_code:        referral?.code      || String(id),
    referred_by:          user?.referredBy    || '',
    referral_friends:     referral?.friends   || 0,
    referral_commission:  Number(referral?.commission) || 0,
    updated_at:           new Date().toISOString(),
  }
}

export function dbInvToApp(i) {
  const profitIntervalMs =
    (i.profit_interval_ms && i.profit_interval_ms > 0 ? i.profit_interval_ms : 0)
    || (i.profit_interval_minutes && i.profit_interval_minutes > 0 ? i.profit_interval_minutes * 60_000 : 0)
    || (i.profit_interval_hours   && i.profit_interval_hours   > 0 ? i.profit_interval_hours   * 3_600_000 : 0)
    || 86_400_000
  const profitIntervalMinutes = i.profit_interval_minutes
    || Math.round(profitIntervalMs / 60_000)
  return {
    id:                    i.id,
    plan:                  i.plan,
    planColor:             i.plan_color          || 'gold',
    amount:                i.amount,
    rate:                  Number(i.rate),
    earned:                Number(i.earned)      || 0,
    daysTotal:             i.days_total,
    profitIntervalMinutes,
    profitIntervalMs,
    profitIntervalHours:   i.profit_interval_hours || Math.round(profitIntervalMs / 3_600_000),
    activeDays:            i.active_days         || [1,2,3,4,5],
    startTime:             i.start_time,
    endTime:               i.end_time,
    nextProfitTime:        i.next_profit_time,
    status:                i.status              || 'active',
    activated:             i.activated           || false,
    invoiceId:             i.invoice_id          || '',
    planId:                i.plan_id,
  }
}

function appInvToDb(userId, i) {
  const profitIntervalMs =
    (i.profitIntervalMs && i.profitIntervalMs > 0 ? i.profitIntervalMs : 0)
    || (i.profitIntervalMinutes && i.profitIntervalMinutes > 0 ? i.profitIntervalMinutes * 60_000 : 0)
    || (i.profitIntervalHours   && i.profitIntervalHours   > 0 ? i.profitIntervalHours   * 3_600_000 : 0)
    || 86_400_000
  const profitIntervalMinutes = i.profitIntervalMinutes || Math.round(profitIntervalMs / 60_000)
  const profitIntervalHours   = i.profitIntervalHours   || profitIntervalMs / 3_600_000
  return {
    id:                      i.id,
    user_id:                 userId,
    plan:                    i.plan,
    plan_color:              i.planColor           || 'gold',
    amount:                  Number(i.amount),
    rate:                    Number(i.rate),
    earned:                  Number(i.earned)      || 0,
    days_total:              i.daysTotal,
    profit_interval_minutes: profitIntervalMinutes,
    profit_interval_ms:      profitIntervalMs,
    profit_interval_hours:   profitIntervalHours,
    active_days:             i.activeDays          || [1,2,3,4,5],
    start_time:              i.startTime,
    end_time:                i.endTime,
    next_profit_time:        i.nextProfitTime,
    status:                  i.status              || 'active',
    activated:               i.activated           || false,
    invoice_id:              i.invoiceId           || '',
    plan_id:                 i.planId,
  }
}

export function dbTxToApp(t) {
  return {
    id:        t.id,
    type:      t.type,
    label:     t.label,
    amount:    Number(t.amount),
    status:    t.status,
    date:      t.created_at ? new Date(t.created_at).toLocaleString() : 'Unknown',
    invoiceId: t.invoice_id  || '',
    toWallet:  t.to_wallet   || '',
    planId:    t.plan_id,
    createdAt: t.created_at,
    userId:    t.user_id,
  }
}
