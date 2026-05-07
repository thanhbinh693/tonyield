/**
 * withdrawal-worker.js — TonYield v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Backend gồm 2 phần chạy cùng process:
 *   1. Express API server — nhận POST /api/withdraw từ frontend
 *   2. Background worker  — polling + gửi TON từ ví admin lên blockchain
 *
 * HOW TO RUN:
 *   node withdrawal-worker.js
 *   pm2 start withdrawal-worker.js --name ton-withdraw-worker
 *
 * ENV VARS (set in .env):
 *   SUPABASE_URL         - Supabase project URL
 *   SUPABASE_SERVICE_KEY - Service role key (do NOT use anon key!)
 *   ADMIN_MNEMONIC       - 24-word admin wallet seed phrase
 *   BOT_TOKEN            - Telegram bot token (để validate initData)
 *   POLL_INTERVAL_MS     - Poll interval (default: 15000ms)
 *   TON_NETWORK          - 'mainnet' or 'testnet' (default: mainnet)
 *   TON_API_KEY          - TonCenter API key (optional)
 *   PORT                 - Express port (default: 3001)
 *
 * SETUP:
 *   npm install @supabase/supabase-js @ton/ton @ton/crypto @ton/core dotenv express cors
 */

import 'dotenv/config'
import express          from 'express'
import cors             from 'cors'
import { createClient } from '@supabase/supabase-js'
import { TonClient, WalletContractV4, internal } from '@ton/ton'
import { mnemonicToWalletKey } from '@ton/crypto'
import { Address }      from '@ton/core'
import { createHmac }   from 'node:crypto'

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ADMIN_MNEMONIC       = process.env.ADMIN_MNEMONIC
const BOT_TOKEN            = process.env.BOT_TOKEN || ''
const POLL_INTERVAL_MS     = Number(process.env.POLL_INTERVAL_MS) || 15_000
const TON_NETWORK          = process.env.TON_NETWORK || 'mainnet'
const TON_API_KEY          = process.env.TON_API_KEY || ''
const PORT                 = Number(process.env.PORT) || 3001
const NETWORK_FEE          = 0.015
const CONFIRM_TIMEOUT_MS   = 90_000
const MAX_BATCH_SIZE       = 10

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ADMIN_MNEMONIC) {
  console.error('[FATAL] Missing env: SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_MNEMONIC')
  process.exit(1)
}

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const ton = new TonClient({
  endpoint: TON_NETWORK === 'testnet'
    ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
    : 'https://toncenter.com/api/v2/jsonRPC',
  ...(TON_API_KEY ? { apiKey: TON_API_KEY } : {}),
})

// ─── ADMIN WALLET ─────────────────────────────────────────────────────────────

let adminWallet = null, adminKeyPair = null, adminAddress = null

async function initAdminWallet() {
  adminKeyPair       = await mnemonicToWalletKey(ADMIN_MNEMONIC.trim().split(/\s+/))
  const contract     = WalletContractV4.create({ publicKey: adminKeyPair.publicKey, workchain: 0 })
  adminWallet        = ton.open(contract)
  adminAddress       = contract.address.toString({ bounceable: false })
  const balance      = await withRetry(() => adminWallet.getBalance(), 'getBalance')
  console.log(`[Admin Wallet] ${adminAddress}`)
  console.log(`[Balance]      ${Number(balance) / 1e9} TON`)
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function withRetry(fn, label, maxAttempts = 3) {
  let delay = 1000
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn() } catch (e) {
      if (i === maxAttempts - 1) throw e
      console.warn(`[retry] ${label} #${i+1} failed: ${e.message}. Wait ${delay}ms...`)
      await sleep(delay); delay *= 2
    }
  }
}

/**
 * Validate Telegram WebApp initData (HMAC-SHA256) và trả về userId thực.
 * Nếu không có BOT_TOKEN → dev mode, tin userId từ body.
 */
function resolveUserId(initData, bodyUserId) {
  if (!BOT_TOKEN) {
    console.warn('[resolveUserId] BOT_TOKEN not set — dev mode, skipping validation')
    return { userId: Number(bodyUserId), authorized: true }
  }
  if (!initData) return { userId: Number(bodyUserId), authorized: false }
  try {
    const params = new URLSearchParams(initData)
    const hash   = params.get('hash')
    if (!hash) return { userId: Number(bodyUserId), authorized: false }
    params.delete('hash')
    const dataCheckStr = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
    const computed  = createHmac('sha256', secretKey).update(dataCheckStr).digest('hex')
    if (computed !== hash) return { userId: Number(bodyUserId), authorized: false }
    const tgUser = params.get('user') ? JSON.parse(params.get('user')) : null
    return { userId: Number(tgUser?.id || bodyUserId), authorized: true }
  } catch (e) {
    console.warn('[resolveUserId] parse error:', e.message)
    return { userId: Number(bodyUserId), authorized: false }
  }
}

/**
 * Parse TON address sang UQ.../kQ... (non-bounceable, urlSafe).
 * Returns null nếu địa chỉ không hợp lệ.
 */
function parseToFriendly(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null
  try {
    return Address.parse(raw.trim()).toString({
      bounceable: false,
      urlSafe:    true,
      testOnly:   TON_NETWORK === 'testnet',
    })
  } catch (e) {
    console.warn(`[parseToFriendly] Invalid: "${raw}" — ${e.message}`)
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

/** Claim tx: chỉ update nếu status vẫn là 'pending' — chống double-send */
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
  if (e3) console.error('[markCompleted] user total_withdraw:', e3.message)
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

  // Hoàn tiền nếu tx còn ở pending/processing
  if (tx && ['pending', 'processing'].includes(tx.status)) {
    const { data: u, error: e3 } = await supabase.from('users')
      .select('balance').eq('id', tx.user_id).maybeSingle()
    if (e3 || !u) return
    const { error: e4 } = await supabase.from('users').update({
      balance:    Number(u.balance) + Number(tx.amount),
      updated_at: new Date().toISOString(),
    }).eq('id', tx.user_id)
    if (e4) console.error('[markFailed] refund:', e4.message)
    else    console.log(`[REFUNDED] user=${tx.user_id} +${tx.amount} TON`)
  }
}

// ─── SEND TON ─────────────────────────────────────────────────────────────────

async function sendTon(toAddress, amountTon, txId) {
  const nanotons = BigInt(Math.round(amountTon * 1e9))
  const seqno    = await withRetry(() => adminWallet.getSeqno(), 'getSeqno')

  await withRetry(() => adminWallet.sendTransfer({
    secretKey: adminKeyPair.secretKey,
    seqno,
    messages: [
      internal({
        to:     toAddress,
        value:  nanotons,
        body:   `TonYield withdrawal ${txId}`,
        bounce: false, // non-bounceable tránh mất tiền nếu ví không tồn tại
      }),
    ],
    sendMode: 3,
  }), 'sendTransfer')

  // Poll seqno thay đổi → xác nhận giao dịch đã vào blockchain (tối đa 90s)
  const maxChecks = Math.ceil(CONFIRM_TIMEOUT_MS / 5000)
  for (let i = 0; i < maxChecks; i++) {
    await sleep(5000)
    try {
      if (await adminWallet.getSeqno() > seqno) return true // ✅ confirmed
    } catch(e) { console.warn(`[seqno check ${i+1}] ${e.message}`) }
  }
  throw new Error(`Transaction timeout after ${CONFIRM_TIMEOUT_MS / 1000}s`)
}

// ─── WORKER: processOnce() ────────────────────────────────────────────────────

async function processOnce() {
  const pending = await fetchPendingWithdrawals()
  if (pending.length === 0) return
  console.log(`[Worker] Processing ${pending.length} pending withdrawal(s)...`)

  for (const tx of pending) {
    const amount = Number(tx.amount)

    // 1. Validate địa chỉ đích (lần 3 — lần cuối trước khi gửi tiền thật)
    const toWallet = parseToFriendly(tx.to_wallet)
    if (!toWallet || !/^[EUk0][Qg][A-Za-z0-9+/_-]{46}$/.test(toWallet)) {
      await markFailed(tx.id, `Invalid wallet address: "${tx.to_wallet}"`)
      continue
    }

    // 2. Validate amount
    if (amount < 0.01) {
      await markFailed(tx.id, `Amount too small: ${amount}`)
      continue
    }

    // 3. Xác minh ví khớp với ví lưu trong DB (security check)
    const { data: userRow, error: uErr } = await supabase
      .from('users').select('wallet_addr, balance').eq('id', tx.user_id).maybeSingle()
    if (uErr || !userRow) {
      await markFailed(tx.id, `User ${tx.user_id} not found`)
      continue
    }

    if (userRow.wallet_addr) {
      const storedNorm = parseToFriendly(userRow.wallet_addr) || userRow.wallet_addr
      if (storedNorm !== toWallet) {
        console.error(`[SECURITY] tx=${tx.id}: to_wallet "${toWallet}" != stored "${storedNorm}"`)
        await markFailed(tx.id, `Wallet mismatch: expected ${storedNorm}, got ${toWallet}`)
        continue
      }
    }

    // 4. Kiểm tra số dư ví admin đủ để gửi không
    let adminBalance
    try {
      adminBalance = Number(await withRetry(() => adminWallet.getBalance(), 'getBalance')) / 1e9
    } catch(e) {
      console.error('[Worker] Cannot fetch admin balance:', e.message)
      continue
    }

    const needed = amount + NETWORK_FEE + 0.1
    if (adminBalance < needed) {
      console.error(`[CRITICAL] Admin balance low! Need ${needed.toFixed(3)}, have ${adminBalance.toFixed(3)} TON`)
      continue // giữ pending, retry sau khi top-up
    }

    // 5. Claim tx (chống double-send)
    const claimed = await markProcessing(tx.id)
    if (!claimed) {
      console.warn(`[Skip] tx=${tx.id} already claimed by another worker`)
      continue
    }

    console.log(`[Process] id=${tx.id} user=${tx.user_id} amount=${amount} TON → ${toWallet}`)

    // 6. Gửi TON lên blockchain
    try {
      await sendTon(toWallet, amount, tx.id)
      await markCompleted(tx)
      console.log(`[✓ SENT] ${amount} TON → ${toWallet} (tx=${tx.id})`)
    } catch(e) {
      const isRetryable = /timeout|network|connection|ECONNREFUSED|ETIMEDOUT/i.test(e.message)
      if (isRetryable) {
        // Lỗi tạm thời → reset về pending để retry lần sau
        await supabase.from('transactions')
          .update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', tx.id)
        console.warn(`[RETRY] tx=${tx.id} → pending: ${e.message}`)
      } else {
        // Lỗi vĩnh viễn → failed + hoàn tiền cho user
        await markFailed(tx.id, e.message)
      }
    }

    await sleep(2000) // tránh rate limit
  }
}

// ─── EXPRESS API SERVER ───────────────────────────────────────────────────────

function createApiServer() {
  const app = express()
  app.use(cors())
  app.use(express.json())

  /**
   * POST /api/withdraw
   * Body: { initData, userId, amount, destWallet }
   * Flow: validate → trừ balance → insert tx pending → return → trigger worker
   */
  app.post('/api/withdraw', async (req, res) => {
    const { initData, userId: bodyUserId, amount, destWallet } = req.body

    // 1. Xác thực Telegram initData
    const { userId, authorized } = resolveUserId(initData, bodyUserId)
    if (!authorized) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // 2. Validate input
    const amt = Number(amount)
    if (!amt || amt < 0.01) {
      return res.status(400).json({ error: 'Amount too small' })
    }
    if (!destWallet) {
      return res.status(400).json({ error: 'Missing wallet address' })
    }

    // 3. Parse & validate địa chỉ ví bằng @ton/core (lần 2 — server-side)
    const toWallet = parseToFriendly(String(destWallet))
    if (!toWallet) {
      return res.status(400).json({ error: 'Invalid destination wallet format' })
    }

    // 4. Kiểm tra user + ban status
    const { data: userRow, error: userErr } = await supabase.from('users')
      .select('balance, wallet_addr, status').eq('id', userId).maybeSingle()

    if (userErr || !userRow) return res.status(404).json({ error: 'User not found' })
    if (userRow.status === 'banned') return res.status(403).json({ error: 'User is banned' })

    // 5. Kiểm tra số dư trong DB (không tin client)
    if (Number(userRow.balance) < amt) {
      return res.status(400).json({ error: 'Insufficient balance' })
    }

    // 6. Trừ số dư + lưu transaction (atomic-like với rollback thủ công)
    const newBalance = +(Number(userRow.balance) - amt).toFixed(6)
    const txId       = `tx-${userId}-${Date.now()}`
    const now        = new Date().toISOString()

    // Bước A: Trừ balance + cập nhật wallet_addr
    const { error: deductErr } = await supabase.from('users').update({
      balance:     newBalance,
      wallet_addr: toWallet,
      updated_at:  now,
    }).eq('id', userId)

    if (deductErr) {
      console.error('[API] deduct error:', deductErr.message)
      return res.status(500).json({ error: 'Failed to update balance' })
    }

    // Bước B: Insert tx record với status 'pending'
    const { error: insErr } = await supabase.from('transactions').insert({
      id:         txId,
      user_id:    userId,
      type:       'withdraw',
      label:      `Withdrawal → ${toWallet.slice(0, 8)}...`,
      amount:     amt,
      status:     'pending',   // ← worker sẽ pick up và gửi TON async
      to_wallet:  toWallet,
      created_at: now,
      updated_at: now,
    })

    // Rollback nếu insert thất bại
    if (insErr) {
      console.error('[API] insert tx error:', insErr.message)
      await supabase.from('users').update({ balance: userRow.balance }).eq('id', userId)
      return res.status(500).json({ error: 'Failed to create transaction' })
    }

    // 7. Trả response ngay — không block đợi gửi TON
    res.json({ success: true, txId, newBalance })

    // 8. Kích hoạt worker ngay lập tức (non-blocking, không đợi)
    processOnce().catch(err => console.error('[API Instant Process Error]', err))
  })

  app.get('/health', (_, res) =>
    res.json({ ok: true, network: TON_NETWORK, adminWallet: adminAddress })
  )

  app.listen(PORT, () => {
    console.log(`[API] Express server listening on :${PORT}`)
    console.log(`[API] POST http://localhost:${PORT}/api/withdraw`)
  })
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function startWorker() {
  console.log(`[Worker] TonYield Withdrawal Worker v3`)
  console.log(`[Network]  ${TON_NETWORK}`)
  console.log(`[Interval] ${POLL_INTERVAL_MS}ms`)

  await initAdminWallet()
  createApiServer()

  // Polling loop
  while (true) {
    try { await processOnce() } catch(e) { console.error('[Worker Error]', e) }
    await sleep(POLL_INTERVAL_MS)
  }
}

startWorker().catch(e => { console.error('[FATAL]', e); process.exit(1) })
