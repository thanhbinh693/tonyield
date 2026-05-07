// ── Types ──────────────────────────────────────────────────
export type Tab = 'home' | 'plans' | 'profile'
export type PlanColor = 'gold' | 'blue' | 'purple'

export interface Plan {
  id: string
  name: string
  tier: string
  minAmount: number
  maxAmount: number | null
  profitRate: number     // % per day
  durationDays: number
  color: PlanColor
  tag?: string
}

export interface Investment {
  id: string
  planId: string
  planName: string
  amount: number
  profitRate: number
  earnedTotal: number
  startedAt: Date
  daysLeft: number
  totalDays: number
  color: PlanColor
}

export interface TxItem {
  id: string
  type: 'deposit' | 'withdraw' | 'profit' | 'referral'
  amount: number
  date: string
  label: string
}

// ── Config — replace with your backend API URL ──────────────
export const CONFIG = {
  API_URL: 'https://YOUR_BACKEND_URL/api',   // ← change this
  BOT_USERNAME: 'YOUR_BOT_USERNAME',          // ← change this
  MIN_DEPOSIT: 10,
  MIN_WITHDRAW: 5,
  REFERRAL_RATE: 5,                           // % commission
}

// ── Sample data (replace with real API calls) ───────────────
export const SAMPLE_PLANS: Plan[] = [
  { id: 'starter', name: 'Basic',        tier: 'Starter', minAmount: 10,  maxAmount: 99,  profitRate: 2.5, durationDays: 30, color: 'gold' },
  { id: 'pro',     name: 'Professional', tier: 'Pro',     minAmount: 100, maxAmount: 499, profitRate: 3.0, durationDays: 30, color: 'blue',   tag: 'HOT' },
  { id: 'vip',     name: 'Elite',        tier: 'VIP',     minAmount: 500, maxAmount: null, profitRate: 3.5, durationDays: 30, color: 'purple', tag: 'VIP' },
]

export const SAMPLE_INVESTMENTS: Investment[] = [
  { id: 'i1', planId: 'pro',     planName: 'Pro Plan',     amount: 200, profitRate: 3.0, earnedTotal: 72.00, startedAt: new Date(), daysLeft: 18, totalDays: 30, color: 'blue' },
  { id: 'i2', planId: 'starter', planName: 'Starter Plan', amount: 50,  profitRate: 2.5, earnedTotal: 6.25,  startedAt: new Date(), daysLeft: 25, totalDays: 30, color: 'gold' },
]

export const SAMPLE_TX: TxItem[] = [
  { id: 't1', type: 'profit',   amount: 31.19,  date: 'Today, 00:00 UTC',  label: 'Daily profit' },
  { id: 't2', type: 'deposit',  amount: 200,    date: 'Apr 28, 14:32',     label: 'Deposit · Pro' },
  { id: 't3', type: 'referral', amount: 3.00,   date: 'Apr 27, 10:15',     label: 'Referral bonus' },
  { id: 't4', type: 'withdraw', amount: -100,   date: 'Apr 25, 09:00',     label: 'Withdrawal' },
]

// ── Helpers ─────────────────────────────────────────────────
export function isWeekend(): boolean {
  const d = new Date().getDay()
  return d === 0 || d === 6
}

export function calcProfit(amount: number, rate: number) {
  const daily   = amount * rate / 100
  const weekly  = daily * 5
  const monthly = daily * 22        // ~22 trading days per 30-day term
  return { daily, weekly, monthly }
}

export function fmtTon(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// Telegram WebApp user
export function getTgUser() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user ?? null
}
