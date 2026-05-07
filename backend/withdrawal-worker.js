/**
 * withdrawal-worker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Backend worker: automatically processes withdrawal requests using admin wallet.
 * User does NOT need to send TON or confirm anything.
 *
 * HOW TO RUN:
 *   node withdrawal-worker.js
 *   # or using PM2:
 *   pm2 start withdrawal-worker.js --name ton-withdraw-worker
 *
 * ENVIRONMENT VARIABLES (set in .env):
 *   SUPABASE_URL         - Supabase project URL
 *   SUPABASE_SERVICE_KEY - Service role key (do NOT use anon key!)
 *   ADMIN_MNEMONIC       - 24-word admin wallet seed phrase (keep secret!)
 *   POLL_INTERVAL_MS     - Poll interval (default: 15000 = 15s)
 *   TON_NETWORK          - 'mainnet' or 'testnet' (default: mainnet)
 *
 * SETUP:
 *   1. Run backend/migration_auto_withdraw.sql in Supabase Dashboard → SQL Editor
 *   2. Fill .env (copy from .env.example)
 *   npm install @supabase/supabase-js @ton/ton @ton/crypto @ton/core dotenv
 */

import 'dotenv/config'
import { createClient }   from '@supabase/supabase-js'
import { TonClient, WalletContractV4, internal } from '@ton/ton'
import { mnemonicToWalletKey } from '@ton/crypto'
import { Address } from '@ton/core'
import express from 'express'
import crypto  from 'crypto'

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ADMIN_MNEMONIC       = process.env.ADMIN_MNEMONIC
const POLL_INTERVAL_MS     = Number(process.env.POLL_INTERVAL_MS) || 15_000
const TON_NETWORK          = process.env.TON_NETWORK || 'mainnet'
const TON_API_KEY          = process.env.TON_API_KEY || ''
const BOT_TOKEN            = process.env.BOT_TOKEN   || ''
const PORT                 = Number(process.env.PORT) || 3001
const NETWORK_FEE          = 0.015
const CONFIRM_TIMEOUT_MS   = 90_000
const MAX_BATCH_SIZE       = 10

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ADMIN_MNEMONIC) {
  console.error('[FATAL] Missing environment variables: SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_MNEMONIC')
  process.exit(1)
}

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const PRIMARY_ENDPOINT = TON_NETWORK === 'testnet'
  ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
  : 'https://toncenter.com/api/v2/jsonRPC'

const ton = new TonClient({
  endpoint: PRIMARY_ENDPOINT,
  ...(TON_API_KEY ? { apiKey: TON_API_KEY } : {}),
})

async function withRetry(fn, label, maxAttempts = 3) {
  let delay = 1000
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn() } catch (e) {
      if (i === maxAttempts - 1) throw e
      console.warn(`[retry] ${label} attempt ${i+1} failed: ${e.message}. Retrying in ${delay}ms...`)
      await sleep(delay); delay *= 2
    }
  }
}

// ─── ADMIN WALLET ────────────────────────────────────────────────────────────

let adminWallet = null, adminKeyPair = null, adminAddress = null

async function initAdminWallet() {
  const words = ADMIN_MNEMONIC.trim().split(/\s+/)
  adminKeyPair = await mnemonicToWalletKey(words)
  const contract = WalletContractV4.create({ publicKey: adminKeyPair.publicKey, workchain: 0 })
  adminWallet  = ton.open(contract)
  adminAddress = contract.address.toString({ bounceable: false })
  const balance = await withRetry(() => adminWallet.getBalance(), 'getBalance')
  console.log(`[Admin Wallet] ${adminAddress}`)
  console.log(`[Balance]      ${Number(balance) / 1e9} TON`)
}

// ─── ADDRESS HELPER ──────────────────────────────────────────────────────────

/** Safely parse any TON address format → UQ... (non-bounceable, urlSafe). Returns null if invalid. */
function parseToFriendly(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null
  try {
    return Address.parse(raw.trim()).toString({ bounceable: false, urlSafe: true })
  } catch (e) {
    console.warn(`[parseToFriendly] Cannot parse: "${raw}" — ${e.message}`)
    return null
  }
}

// ─── DB HELPERS ──────────────────────────────────────────────────────────────

async function fetchPendingWithdrawals() {
  const { data, error } = await supabase
    .from('transactions').select('*')
    .eq('type', 'withdraw').eq('status', 'pending')
    .order('created_at', { ascending: true }).limit(MAX_BATCH_SIZE)
  if (error) { console.error('[fetchPending]', error.message); return [] }
  return data || []
}

async function markProcessing(txId) {
  const { error } = await supabase.from('transactions')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', txId).eq('status', 'pending')
  if (error) { console.error(`[markProcessing] tx=${txId}:`, error.message); return false }
  return true
}

async function markCompleted(tx) {
  const { error: e1 } = await supabase.from('transactions')
    .update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', tx.id)
  if (e1) console.error('[markCompleted] tx:', e1.message)

  const { data: u, error: e2 } = await supabase.from('users')
    .select('total_withdraw').eq('id', tx.user_id).maybeSingle()
  if (e2 || !u) return

  const { error: e3 } = await supabase.from('users').update({
    total_withdraw: (Number(u.total_withdraw) || 0) + Number(tx.amount),
    updated_at:     new Date().toISOString(),
  }).eq('id', tx.user_id)
  if (e3) console.error('[markCompleted] user:', e3.message)
}

async function markFailed(txId, reason) {
  console.warn(`[FAILED] tx=${txId} reason=${reason}`)

  const { data: tx, error: e1 } = await supabase.from('transactions')
    .select('user_id, amount, status').eq('id', txId).maybeSingle()
  if (e1) { console.error('[markFailed] fetch:', e1.message); return }

  const { error: e2 } = await supabase.from('transactions').update({
    status: 'failed', fail_reason: reason, updated_at: new Date().toISOString(),
  }).eq('id', txId)
  if (e2) console.error('[markFailed] update:', e2.message)

  // Refund balance only if was pending/processing
  if (tx && ['pending', 'processing'].includes(tx.status)) {
    const { data: u, error: e3 } = await supabase.from('users')
      .select('balance').eq('id', tx.user_id).maybeSingle()
    if (e3 || !u) return
    const { error: e4 } = await supabase.from('users').update({
      balance:    Number(u.balance) + Number(tx.amount),
      updated_at: new Date().toISOString(),
    }).eq('id', tx.user_id)
    if (e4) console.error('[markFailed] refund:', e4.message)
    else console.log(`[REFUNDED] user=${tx.user_id} +${tx.amount} TON`)
  }
}

// ─── TELEGRAM initData VERIFICATION ─────────────────────────────────────────

/**
 * Verify Telegram WebApp initData and resolve userId.
 * Returns { userId, authorized }.
 * If BOT_TOKEN is not set, falls back to trusting bodyUserId (dev mode).
 */
function resolveUserId(initData, bodyUserId) {
  if (!BOT_TOKEN) {
    // Dev/test mode: no bot token configured, trust client-supplied userId
    console.warn('[Auth] BOT_TOKEN not set — skipping initData verification (dev mode)')
    return { userId: bodyUserId, authorized: !!bodyUserId }
  }
  if (!initData) return { userId: null, authorized: false }
  try {
    const params  = new URLSearchParams(initData)
    const hash    = params.get('hash')
    if (!hash) return { userId: null, authorized: false }
    params.delete('hash')
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
    const computed  = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
    if (computed !== hash) return { userId: null, authorized: false }
    const userStr = params.get('user')
    const user    = userStr ? JSON.parse(userStr) : null
    return { userId: user?.id ? String(user.id) : null, authorized: !!user?.id }
  } catch(e) {
    console.error('[resolveUserId]', e.message)
    return { userId: null, authorized: false }
  }
}

// ─── EXPRESS API ─────────────────────────────────────────────────────────────

function startApiServer() {
  const app = express()
  app.use(express.json())

  // CORS for Telegram WebApp / local dev
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  /**
   * POST /api/withdraw
   * Body: { initData, userId, amount, destWallet }
   */
  app.post('/api/withdraw', async (req, res) => {
    const { initData, userId: bodyUserId, amount: rawAmount, destWallet: rawWallet } = req.body

    // 1. Authenticate via Telegram initData
    const { userId, authorized } = resolveUserId(initData, bodyUserId)
    if (!authorized) return res.status(401).json({ error: 'Unauthorized' })

    // 2. Validate amount
    const amt = Number(rawAmount)
    if (!amt || amt < 0.01) return res.status(400).json({ error: 'Invalid amount' })

    // 3. Parse & validate destination wallet
    const toWallet = parseToFriendly(rawWallet)
    if (!toWallet) return res.status(400).json({ error: 'Invalid destination wallet format' })

    try {
      // 4. Check user exists and is not banned
      const { data: userRow, error: uErr } = await supabase
        .from('users').select('balance, wallet_addr, status').eq('id', Number(userId)).maybeSingle()
      if (uErr || !userRow) return res.status(404).json({ error: 'User not found' })
      if (userRow.status === 'banned') return res.status(403).json({ error: 'User is banned' })

      // 5. Check balance (server-authoritative — do NOT trust client)
      if (Number(userRow.balance) < amt) return res.status(400).json({ error: 'Insufficient balance' })

      // 6. Deduct balance and save wallet address
      const newBalance = Math.max(0, Number(userRow.balance) - amt)
      const { error: updateErr } = await supabase.from('users').update({
        balance:     newBalance,
        wallet_addr: toWallet,
        updated_at:  new Date().toISOString(),
      }).eq('id', Number(userId))
      if (updateErr) return res.status(500).json({ error: 'Failed to update balance' })

      // 7. Insert transaction record (status: pending)
      const txId = 'tx-' + Date.now()
      const now  = Date.now()
      const { error: insErr } = await supabase.from('transactions').insert({
        id:         txId,
        user_id:    Number(userId),
        type:       'withdraw',
        label:      `Withdrawal → ${toWallet.slice(0, 8)}...`,
        amount:     amt,
        status:     'pending',
        to_wallet:  toWallet,
        created_at: now,
      })
      if (insErr) {
        // Rollback balance deduction
        await supabase.from('users').update({ balance: userRow.balance }).eq('id', Number(userId))
        return res.status(500).json({ error: 'Failed to create transaction' })
      }

      // 8. Respond immediately, then trigger worker
      res.json({ success: true, txId, newBalance })

      // Fire-and-forget: process this withdrawal now without blocking response
      processOnce().catch(err => console.error('[API Instant Process Error]', err))

    } catch(e) {
      console.error('[POST /api/withdraw]', e)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  app.listen(PORT, () => {
    console.log(`[API] Listening on port ${PORT}`)
  })
}



async function sendTon(toAddress, amountTon, txId) {
  const nanotons = BigInt(Math.round(amountTon * 1e9))
  const seqno    = await withRetry(() => adminWallet.getSeqno(), 'getSeqno')

  await withRetry(() => adminWallet.sendTransfer({
    secretKey: adminKeyPair.secretKey, seqno,
    messages: [ internal({ to: toAddress, value: nanotons, body: `TonYield withdrawal ${txId}`, bounce: false }) ],
    sendMode: 3,
  }), 'sendTransfer')

  const maxChecks = Math.ceil(CONFIRM_TIMEOUT_MS / 5000)
  for (let i = 0; i < maxChecks; i++) {
    await sleep(5000)
    try { if (await adminWallet.getSeqno() > seqno) return true } catch(e) { console.warn(`[seqno ${i+1}] ${e.message}`) }
  }
  throw new Error(`Transaction timeout after ${CONFIRM_TIMEOUT_MS/1000}s`)
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────

async function processOnce() {
  const pending = await fetchPendingWithdrawals()
  if (pending.length === 0) return
  console.log(`[Worker] ${pending.length} pending withdrawal(s) to process...`)

  for (const tx of pending) {
    const amount = Number(tx.amount)

    // 1. Parse & validate destination
    const toWallet = parseToFriendly(tx.to_wallet)
    if (!toWallet || !/^[UEk0][Qq][A-Za-z0-9_\-]+=?$/.test(toWallet)) {
      await markFailed(tx.id, `Invalid wallet address: "${tx.to_wallet}"`)
      continue
    }

    // 2. Validate amount
    if (amount < 0.01) { await markFailed(tx.id, `Amount too small: ${amount}`); continue }

    // 3. Verify user + wallet match
    const { data: userRow, error: uErr } = await supabase
      .from('users').select('wallet_addr, balance').eq('id', tx.user_id).maybeSingle()
    if (uErr || !userRow) { await markFailed(tx.id, `User ${tx.user_id} not found`); continue }

    if (userRow.wallet_addr) {
      const storedNorm = parseToFriendly(userRow.wallet_addr) || userRow.wallet_addr
      if (storedNorm !== toWallet) {
        console.error(`[SECURITY] tx=${tx.id}: to_wallet "${toWallet}" != stored "${storedNorm}"`)
        await markFailed(tx.id, `Wallet mismatch: expected ${storedNorm}, got ${toWallet}`)
        continue
      }
    }

    // 4. Check admin balance
    let adminBalance
    try { adminBalance = Number(await withRetry(() => adminWallet.getBalance(), 'getBalance')) / 1e9 }
    catch(e) { console.error('[Worker] Cannot fetch admin balance:', e.message); continue }

    const needed = amount + NETWORK_FEE + 0.1
    if (adminBalance < needed) {
      console.error(`[CRITICAL] Admin balance insufficient! Need ${needed.toFixed(3)} TON, have ${adminBalance.toFixed(3)} TON`)
      continue // keep pending, retry after top-up
    }

    // 5. Claim (prevent double-send)
    const claimed = await markProcessing(tx.id)
    if (!claimed) { console.warn(`[Skip] tx=${tx.id} already claimed`); continue }

    console.log(`[Process] id=${tx.id} user=${tx.user_id} amount=${amount} TON → ${toWallet}`)

    // 6. Send
    try {
      await sendTon(toWallet, amount, tx.id)
      await markCompleted(tx)
      console.log(`[✓ SENT] ${amount} TON → ${toWallet} (tx=${tx.id})`)
    } catch(e) {
      const isRetryable = /timeout|network|connection|ECONNREFUSED|ETIMEDOUT/i.test(e.message)
      if (isRetryable) {
        await supabase.from('transactions')
          .update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', tx.id)
        console.warn(`[RETRY] tx=${tx.id} → pending: ${e.message}`)
      } else {
        await markFailed(tx.id, e.message)
      }
    }

    await sleep(2000)
  }
}

async function startWorker() {
  console.log(`[Worker] TonYield Withdrawal Worker v2`)
  console.log(`[Network]  ${TON_NETWORK}`)
  console.log(`[Interval] ${POLL_INTERVAL_MS}ms`)
  startApiServer()
  await initAdminWallet()
  while (true) {
    try { await processOnce() } catch(e) { console.error('[Worker Error]', e) }
    await sleep(POLL_INTERVAL_MS)
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

startWorker().catch(e => { console.error('[FATAL]', e); process.exit(1) })
