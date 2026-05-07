# TONYield Mini App — Setup Guide

## Project Structure
```
tonyield/
├── public/
│   └── tonconnect-manifest.json   ← Edit this with your domain
├── src/
│   ├── assets/                    ← Drop logo.png, coin.png here
│   ├── components/
│   │   ├── BottomNav.jsx/css
│   │   ├── DepositModal.jsx
│   │   ├── WithdrawModal.jsx
│   │   ├── Modal.css
│   │   └── Toast.jsx/css
│   ├── hooks/
│   │   └── useApp.js              ← Central state + API calls
│   ├── pages/
│   │   ├── HomePage.jsx/css
│   │   ├── PlansPage.jsx/css
│   │   └── ProfilePage.jsx/css
│   ├── utils/
│   │   ├── api.js                 ← All backend API calls
│   │   └── config.js              ← Plans, API URL, constants
│   ├── App.jsx / App.css
│   ├── index.css
│   └── main.jsx
├── index.html
├── package.json
└── vite.config.js
```

---

## Step 1 — Install dependencies

```bash
npm install
```

---

## Step 2 — Configure your backend URL

Open `src/utils/config.js`:

```js
export const API_BASE = 'https://your-api.com/api'
// Change this to your real backend URL
```

---

## Step 3 — Add your images

Copy your images into `src/assets/`:
- `logo.png` — app logo (recommended 64×64 px, transparent background)
- `coin.png` — TON coin graphic (transparent background)

Then reference them in the components:

**Logo** — in `src/pages/HomePage.jsx`, find the comment `{/* REPLACE with: */}` and update:
```jsx
// Before:
<span>T</span>

// After:
<img src="/logo.png" alt="logo" />
```

**Coin** — same file, find the coin-deco section:
```jsx
// Before:
<span>◎</span>

// After:
<img src="/coin.png" alt="coin" />
```

Also copy images to `public/` folder so they are served as static assets:
```
public/logo.png
public/coin.png
```

---

## Step 4 — TON Connect manifest

Edit `public/tonconnect-manifest.json`:
```json
{
  "url": "https://your-domain.com",
  "name": "TONYield",
  "iconUrl": "https://your-domain.com/logo.png"
}
```

Then update `src/main.jsx`:
```js
const MANIFEST_URL = 'https://your-domain.com/tonconnect-manifest.json'
```

---

## Step 5 — Connect to real backend

Open `src/hooks/useApp.js` and replace the `loadMockData()` call with real API calls:

```js
// Replace this block:
loadMockData()

// With:
Promise.all([
  getMe(),
  getPlans(),
  getMyInvestments(),
  getTransactions(),
  getReferralInfo(),
  getSystemConfig()
])
.then(([u, p, inv, tx, ref, cfg]) => {
  setUser(u)
  setPlans(p)
  setInvestments(inv)
  setTransactions(tx)
  setReferral(ref)
  setConfig(cfg)
})
.catch(e => showToast(e.message, 'err'))
.finally(() => setLoading(false))
```

---

## Step 6 — Wire up TON Connect deposit

In `src/components/DepositModal.jsx`, uncomment and fill in the `handleDeposit` function:

```js
// 1. Send TON to your hot wallet
await tonConnectUI.sendTransaction({
  validUntil: Math.floor(Date.now() / 1000) + 300,
  messages: [{
    address: 'YOUR_HOT_WALLET_TON_ADDRESS',
    amount: String(Math.floor(amt * 1e9)), // nanoTON
  }]
})

// 2. Notify backend with investment plan
await createInvestment(selectedPlan.id, amt)
```

---

## Step 7 — Run locally

```bash
npm run dev
# Opens at http://localhost:3000
```

For Telegram testing, use [ngrok](https://ngrok.com) to expose localhost:
```bash
ngrok http 3000
# Copy the https URL → use as your Telegram Mini App URL
```

---

## Step 8 — Deploy (Vercel recommended)

```bash
npm run build
# dist/ folder is generated

# Deploy with Vercel CLI:
npx vercel --prod
```

Or connect your GitHub repo to [vercel.com](https://vercel.com) for auto-deploy.

After deploy, update:
1. `tonconnect-manifest.json` URL → your Vercel URL
2. Telegram BotFather → `/newapp` → set Mini App URL → your Vercel URL

---

## Telegram Bot Setup

1. Open [@BotFather](https://t.me/BotFather) on Telegram
2. `/newbot` → create your bot, save the **Bot Token**
3. `/newapp` → select your bot → set the Mini App URL
4. Your app launches via: `https://t.me/YourBotName/app`

---

## Backend API Contract

Your backend must implement these endpoints (all authenticated via `X-Telegram-Init-Data` header):

| Method | Endpoint | Returns |
|--------|----------|---------|
| GET | `/api/user/me` | `{ id, username, balance, todayProfit }` |
| GET | `/api/plans` | `[{ id, name, tier, min, max, rate, duration, color, hot }]` |
| GET | `/api/investments` | `[{ id, plan, amount, rate, earned, daysLeft, progress, color }]` |
| POST | `/api/investments` | `{ planId, amount }` → creates investment |
| GET | `/api/transactions` | `[{ id, type, label, date, amount }]` |
| POST | `/api/withdraw` | `{ amount }` → creates withdrawal |
| GET | `/api/referral` | `{ code, friends, commission }` |
| GET | `/api/config` | `{ minWithdraw, referralRate }` |

---

## Weekend Logic

Weekend pause is handled automatically in the frontend:
- `src/utils/config.js` → `isWeekend()` checks UTC day
- Plans page shows a warning banner on Sat/Sun
- Home page status pill switches to "Weekend pause"

Backend cron job should also skip profit distribution on weekends:
```js
// In your daily cron:
const day = new Date().getUTCDay()
if (day === 0 || day === 6) return // skip Sat & Sun
```

---

## Customization Checklist

- [ ] Replace logo placeholder with `logo.png`
- [ ] Replace coin placeholder with `coin.png`  
- [ ] Set `API_BASE` in `config.js`
- [ ] Update `tonconnect-manifest.json` with real domain
- [ ] Update `MANIFEST_URL` in `main.jsx`
- [ ] Replace `loadMockData()` with real API calls in `useApp.js`
- [ ] Add hot wallet TON address in `DepositModal.jsx`
- [ ] Set up Telegram bot via BotFather
- [ ] Deploy to Vercel and configure Mini App URL
