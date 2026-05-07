// Supabase Edge Function: withdraw
// Deploy: supabase functions deploy withdraw
// Set secrets:
//   supabase secrets set ADMIN_MNEMONIC="word1 word2 ..."
//   supabase secrets set TON_NETWORK=testnet
//   supabase secrets set TON_API_KEY=xxx  (optional, tăng rate limit)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { TonClient, WalletContractV4, internal } from 'npm:@ton/ton'
import { mnemonicToWalletKey } from 'npm:@ton/crypto'
import { Address } from 'npm:@ton/core'

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY')!
const ADMIN_MNEMONIC       = Deno.env.get('ADMIN_MNEMONIC')!
const TON_NETWORK          = Deno.env.get('TON_NETWORK') || 'testnet'
const TON_API_KEY          = Deno.env.get('TON_API_KEY') || ''
const NETWORK_FEE          = 0.015

const ENDPOINT = TON_NETWORK === 'mainnet'
  ? 'https://toncenter.com/api/v2/jsonRPC'
  : 'https://testnet.toncenter.com/api/v2/jsonRPC'

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Validate TON user-friendly address — TEP-0002
function isValidTonAddress(addr: string): boolean {
  return /^[EUk0][Qg][A-Za-z0-9+/_-]{46}$/.test(addr.trim())
}

// Parse any TON address format → normalized friendly string
function parseToFriendly(raw: string): string | null {
  try {
    return Address.parse(raw.trim()).toString({ bounceable: false, urlSafe: true })
  } catch {
    return null
  }
}

// Validate Telegram initData (HMAC-SHA256)
async function validateTelegramInitData(initData: string, botToken: string): Promise<boolean> {
  if (!initData || !botToken) return false
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return false
    params.delete('hash')
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    const encoder = new TextEncoder()
    const secretKey = await crypto.subtle.importKey(
      'raw', encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const botKeyBytes = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken))
    const hmacKey = await crypto.subtle.importKey(
      'raw', botKeyBytes,
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const sigBytes = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(dataCheckString))
    const computed = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('')
    return computed === hash
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  const fail = (msg: string, status = 400) =>
    new Response(JSON.stringify({ error: msg }), { status, headers: cors })

  try {
    const body = await req.json()
    const { amount, destWallet, userId, initData } = body

    // ── 1. Validate input ────────────────────────────────────────────────────
    if (!amount || Number(amount) < 0.01)
      return fail('Amount too small')

    if (!destWallet)
      return fail('Missing wallet address')

    const toWallet = parseToFriendly(String(destWallet))
    if (!toWallet || !isValidTonAddress(toWallet))
      return fail('Invalid wallet address format')

    if (!userId)
      return fail('Missing userId')

    const amt = Number(amount)
    const uid = Number(userId)

    // ── 2. Validate Telegram initData (nếu có BOT_TOKEN) ────────────────────
    const BOT_TOKEN = Deno.env.get('BOT_TOKEN') || ''
    if (BOT_TOKEN && initData) {
      const valid = await validateTelegramInitData(String(initData), BOT_TOKEN)
      if (!valid) return fail('Unauthorized', 401)
    }

    // ── 3. Kiểm tra user + ban status ────────────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('balance, status, wallet_addr')
      .eq('id', uid)
      .maybeSingle()

    if (userErr || !user)
      return fail('User not found', 404)

    if (user.status === 'banned')
      return fail('Account is banned', 403)

    // ── 4. Kiểm tra số dư trong DB (không tin client) ────────────────────────
    if (Number(user.balance) < amt)
      return fail('Insufficient balance')

    // ── 5. Kiểm tra wallet mismatch (security) ────────────────────────────────
    // Nếu user đã có wallet_addr cũ mà khác với toWallet → cảnh báo log nhưng vẫn cho phép
    // (User có thể đổi ví, chỉ block nếu muốn strict mode)
    if (user.wallet_addr) {
      const storedNorm = parseToFriendly(user.wallet_addr)
      if (storedNorm && storedNorm !== toWallet) {
        console.warn(`[WALLET_CHANGE] user=${uid} old=${storedNorm} new=${toWallet}`)
      }
    }

    // ── 6. Init admin wallet ──────────────────────────────────────────────────
    const keyPair  = await mnemonicToWalletKey(ADMIN_MNEMONIC.trim().split(/\s+/))
    const ton      = new TonClient({ endpoint: ENDPOINT, ...(TON_API_KEY ? { apiKey: TON_API_KEY } : {}) })
    const contract = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 })
    const wallet   = ton.open(contract)

    // ── 7. Kiểm tra số dư ví admin ────────────────────────────────────────────
    const adminBal = Number(await wallet.getBalance()) / 1e9
    if (adminBal < amt + NETWORK_FEE + 0.1)
      return fail('Service temporarily unavailable. Please try again later.', 503)

    // ── 8. Trừ balance + lưu transaction (atomic-like) ───────────────────────
    const newBalance = +(Number(user.balance) - amt).toFixed(6)
    const txId = `tx-${uid}-${Date.now()}`
    const now = new Date().toISOString()

    // Bước A: Trừ balance
    const { error: deductErr } = await supabase.from('users').update({
      balance:     newBalance,
      wallet_addr: toWallet,
      updated_at:  now,
    }).eq('id', uid)

    if (deductErr) {
      console.error('[deduct]', deductErr)
      return fail('Failed to update balance', 500)
    }

    // Bước B: Insert transaction record
    const { error: txErr } = await supabase.from('transactions').insert({
      id:         txId,
      user_id:    uid,
      type:       'withdraw',
      label:      `Withdrawal → ${toWallet.slice(0, 8)}...`,
      amount:     amt,
      status:     'processing',
      to_wallet:  toWallet,
      created_at: now,
      updated_at: now,
    })

    // Rollback nếu insert thất bại
    if (txErr) {
      console.error('[tx insert]', txErr)
      await supabase.from('users').update({ balance: user.balance }).eq('id', uid)
      return fail('Failed to create transaction', 500)
    }

    // ── 9. Gửi TON lên blockchain ─────────────────────────────────────────────
    const seqno = await wallet.getSeqno()

    await wallet.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [internal({
        to:     Address.parse(toWallet),
        value:  BigInt(Math.round(amt * 1e9)),
        body:   `TonYield ${txId}`,
        bounce: false,
      })],
      sendMode: 3,
    })

    // ── 10. Poll confirm seqno (tối đa 60s) ───────────────────────────────────
    let confirmed = false
    for (let i = 0; i < 12; i++) {
      await sleep(5000)
      try {
        if (await wallet.getSeqno() > seqno) { confirmed = true; break }
      } catch (_) { /* retry */ }
    }

    // ── 11. Cập nhật trạng thái cuối ──────────────────────────────────────────
    if (confirmed) {
      await supabase.from('transactions').update({
        status:     'completed',
        updated_at: new Date().toISOString(),
      }).eq('id', txId)

      // Cộng total_withdraw
      const { data: fresh } = await supabase.from('users').select('total_withdraw').eq('id', uid).maybeSingle()
      if (fresh) {
        await supabase.from('users').update({
          total_withdraw: (Number(fresh.total_withdraw) || 0) + amt,
          updated_at:     new Date().toISOString(),
        }).eq('id', uid)
      }

      return new Response(JSON.stringify({
        ok: true, txId, newBalance, confirmed: true,
      }), { status: 200, headers: cors })

    } else {
      // Đã gửi nhưng chưa confirm trong 60s — tiền vẫn đến ví user
      await supabase.from('transactions').update({
        status:      'pending',
        fail_reason: 'Awaiting blockchain confirmation',
        updated_at:  new Date().toISOString(),
      }).eq('id', txId)

      return new Response(JSON.stringify({
        ok: true, txId, newBalance, confirmed: false,
        note: 'Transaction sent, awaiting confirmation',
      }), { status: 200, headers: cors })
    }

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[withdraw edge fn]', msg)

    // Nếu lỗi sau khi đã trừ balance → cần refund thủ công
    // Trong trường hợp này không tự refund vì không biết txId đã được tạo chưa
    return new Response(JSON.stringify({ error: 'Internal server error', detail: msg }), {
      status: 500, headers: cors,
    })
  }
})