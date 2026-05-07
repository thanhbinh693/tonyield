// ─── Supabase ─────────────────────────────────────────────────────
// 1. Go to https://supabase.com → Project → Settings → API
// 2. Copy "Project URL" and "anon public" key here
export const SUPABASE_URL      = 'https://xblsdppxltvyvlvxsrkn.supabase.co'  // ← REPLACE THIS
export const SUPABASE_ANON_KEY = 'sb_publishable_wZ7Dug3hq1G4Cs_IDwbTuQ_Aw-yvsu3'                   // ← REPLACE THIS

// ─── Supabase Edge Function (withdraw) ────────────────────────────
// Không cần server riêng — dùng Supabase Edge Function
// Deploy: supabase functions deploy withdraw
export const WITHDRAW_URL = `https://xblsdppxltvyvlvxsrkn.supabase.co/functions/v1/withdraw`

// ─── NETWORK ──────────────────────────────────────────────────────
// 'testnet' = use TON Testnet for deposit/withdraw testing
// 'mainnet'  = production
export const TON_NETWORK = 'testnet'

// ─── ADMIN WALLET ADDRESS — receives deposits ─────────────────────
// ⚠️  MUST fill in your TON TESTNET wallet address here!
// Get testnet wallet: open Tonkeeper → Settings → Switch to Testnet
export const ADMIN_WALLET = '0QCKAawZmCsi6MVFQ87Jn7LZ7Tr-4jm6w9r_2M8SdN645TAK'
// Testnet: short duration + small interval for fast testing
// Production: change durationUnit='days', duration=30, profitIntervalMinutes=1440
export const DEFAULT_PLANS = [
  { id: 1, name: 'Basic', tier: 'Starter', min: 0.01, max: 0.99, rate: 2.5, duration: 1, durationUnit: 'hours', durationMs: 3_600_000, profitIntervalMinutes: 5, profitIntervalMs: 300_000, activeDays: [0, 1, 2, 3, 4, 5, 6], color: 'gold', hot: false },
  { id: 2, name: 'Professional', tier: 'Pro', min: 1, max: 4.99, rate: 3.0, duration: 2, durationUnit: 'hours', durationMs: 7_200_000, profitIntervalMinutes: 15, profitIntervalMs: 900_000, activeDays: [0, 1, 2, 3, 4, 5, 6], color: 'blue', hot: true },
  { id: 3, name: 'Elite', tier: 'VIP', min: 5, max: null, rate: 3.5, duration: 3, durationUnit: 'hours', durationMs: 10_800_000, profitIntervalMinutes: 30, profitIntervalMs: 1_800_000, activeDays: [0, 1, 2, 3, 4, 5, 6], color: 'purple', hot: false },
]

// 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const MIN_WITHDRAW = 5
export const REFERRAL_RATE = 5

// ─── ADMIN TELEGRAM IDs ───────────────────────────────────────────
// Add your Telegram user ID here
// How to get your ID: message @userinfobot on Telegram
export const ADMIN_IDS = [
  7367805841,   // <-- replace with your actual Telegram ID
]

export const isAdmin = (telegramId) => ADMIN_IDS.includes(Number(telegramId))

export const isWeekend = () => {
  const d = new Date().getUTCDay()
  return d === 0 || d === 6
}