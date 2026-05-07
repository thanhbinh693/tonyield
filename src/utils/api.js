import { API_BASE } from './config'

// Telegram WebApp user data for auth
const getTelegramInitData = () => {
  if (window.Telegram?.WebApp?.initData) return window.Telegram.WebApp.initData
  return ''
}

const headers = () => ({
  'Content-Type': 'application/json',
  'X-Telegram-Init-Data': getTelegramInitData(),
})

const req = async (method, path, body) => {
  const res = await fetch(API_BASE + path, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Auth / User ──
export const getMe = () => req('GET', '/user/me')

// ── Plans ──
export const getPlans = () => req('GET', '/plans')

// ── Investments ──
export const getMyInvestments = () => req('GET', '/investments')
export const createInvestment  = (planId, amount) => req('POST', '/investments', { planId, amount })

// ── Transactions ──
export const getTransactions = () => req('GET', '/transactions')
export const requestWithdraw = (amount) => req('POST', '/withdraw', { amount })

// ── Referral ──
export const getReferralInfo = () => req('GET', '/referral')

// ── System config ──
export const getSystemConfig = () => req('GET', '/config')
