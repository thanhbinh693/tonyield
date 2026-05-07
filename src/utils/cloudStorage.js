/**
 * cloudStorage.js — v3 ARCHITECTURE REWRITE
 * ─────────────────────────────────────────────────────────────────────────────
 * CORE ARCHITECTURE ISSUE:
 *
 * Telegram CloudStorage is PER-USER isolated storage:
 *   - Admin saves key "adm_cfg" → only ADMIN can read it, other users CANNOT read
 *   - User A saves key "u_123" → only User A can read it, admin CANNOT read
 *   - Cannot share data between users via CloudStorage
 *
 * CORRECT SOLUTION FOR MINI APP WITHOUT BACKEND:
 *
 *   PRIMARY:  localStorage  → fast, synchronous, no size limit
 *   BACKUP:   CloudStorage  → personal data backup, used when opening on a new device
 *
 * FLOW:
 *   - Admin config/plans: saved to localStorage with fixed key
 *     → All users on same device can read (browsers share localStorage per origin)
 *     → When user opens bot on new device: reads from their personal CloudStorage backup
 *   - User data: saved to both localStorage + CloudStorage backup
 *   - Registry: localStorage (instant, no callback needed)
 *
 * NOTE: If real data sync between devices/users is needed → requires backend (Supabase, Firebase, etc.)
 *
 * KEYS:
 *   localStorage:
 *     "ty_u_{id}"       → user bundle { user, investments, transactions, referral }
 *     "ty_cfg"          → admin config (shared, all users can read)
 *     "ty_plans"        → investment plans (shared)
 *     "ty_reg"          → registry of user IDs
 *   CloudStorage (backup):
 *     "bu_{id}"         → backup bundle (per-user, only that user can read)
 *     "bu_cfg"          → backup config (only the one who saved can read)
 */

// ─── localStorage helpers (primary, sync) ─────────────────────────────────────

function lsGet(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null } catch { return null }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true } catch(e) { console.warn('[lsSet]', key, e); return false }
}

// ─── CloudStorage helpers (backup, async) ─────────────────────────────────────

const CS = () => window?.Telegram?.WebApp?.CloudStorage ?? null

function csBackupSet(key, value) {
  const cs = CS(); if (!cs) return Promise.resolve()
  return new Promise(resolve => {
    const s = JSON.stringify(value)
    cs.setItem(key, s, () => resolve())
  })
}

function csBackupGet(key) {
  const cs = CS(); if (!cs) return Promise.resolve(null)
  return new Promise(resolve => {
    cs.getItem(key, (err, v) => {
      if (err || !v) { resolve(null); return }
      try { resolve(JSON.parse(v)) } catch { resolve(null) }
    })
  })
}

// ─── KEYS ─────────────────────────────────────────────────────────────────────
const userLsKey  = (id) => `ty_u_${id}`
const userCsKey  = (id) => `bu_${id}`
const CFG_LS     = 'ty_cfg'
const CFG_CS     = 'bu_cfg'
const PLANS_LS   = 'ty_plans'
const PLANS_CS   = 'bu_plans'
const REG_LS     = 'ty_reg'

// ─── Registry (localStorage only — instant, no async) ─────────────────────────

export function getRegistry() {
  return lsGet(REG_LS) || []
}

export function registerUser(telegramId) {
  const id = Number(telegramId)
  if (!id) return
  const reg = getRegistry()
  if (!reg.includes(id)) {
    lsSet(REG_LS, [...reg, id])
  }
}

// ─── User Bundle ──────────────────────────────────────────────────────────────

/**
 * Load user bundle:
 * 1. Try localStorage (fast)
 * 2. If not found → try CloudStorage backup (user opened on new device)
 */
export async function getUserBundle(telegramId) {
  const ls = lsGet(userLsKey(telegramId))
  if (ls) return ls
  // New device: restore from CloudStorage backup
  const cs = await csBackupGet(userCsKey(telegramId))
  if (cs) {
    lsSet(userLsKey(telegramId), cs) // cache to localStorage
    registerUser(telegramId)
  }
  return cs
}

/**
 * Save user bundle:
 * - localStorage: immediate
 * - CloudStorage: async backup
 */
export function saveUserBundle(telegramId, bundle) {
  lsSet(userLsKey(telegramId), bundle)
  registerUser(telegramId)
  // Async backup — no need to await
  csBackupSet(userCsKey(telegramId), bundle).catch(() => {})
  return Promise.resolve()
}

// ─── Admin Config ─────────────────────────────────────────────────────────────

/**
 * Load config:
 * localStorage → CloudStorage backup (if new device)
 */
export async function getAdminConfig(fallback = null) {
  const ls = lsGet(CFG_LS)
  if (ls) return ls
  const cs = await csBackupGet(CFG_CS)
  if (cs) lsSet(CFG_LS, cs)
  return cs ?? fallback
}

/**
 * Save config:
 * localStorage (immediate) + CloudStorage backup
 */
export function saveAdminConfig(cfg) {
  lsSet(CFG_LS, cfg)
  csBackupSet(CFG_CS, cfg).catch(() => {})
  return Promise.resolve()
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export async function getAdminPlans(fallback = null) {
  const ls = lsGet(PLANS_LS)
  if (ls) return ls
  const cs = await csBackupGet(PLANS_CS)
  if (cs) lsSet(PLANS_LS, cs)
  return cs ?? fallback
}

export function saveAdminPlans(plans) {
  lsSet(PLANS_LS, plans)
  csBackupSet(PLANS_CS, plans).catch(() => {})
  return Promise.resolve()
}

// ─── Admin: get ALL users data (from localStorage, instant) ────────────────────

export function getAllUsersData() {
  const ids = getRegistry()
  const result = []
  ids.forEach(id => {
    const bundle = lsGet(userLsKey(id))
    if (bundle) result.push({ id, bundle })
  })
  return Promise.resolve(result)
}

// ─── Legacy compat ────────────────────────────────────────────────────────────
export const csAdminGet = getAdminConfig
export const csAdminSet = saveAdminConfig
