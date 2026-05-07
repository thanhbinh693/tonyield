# 🤖 Auto-Withdrawal System — Setup Guide

## Tổng quan

Flow rút tiền **hoàn toàn tự động** qua backend API:

```
User nhấn "Withdraw"
  → Frontend validate + optimistic UI update
  → POST /api/withdraw → backend xác thực, trừ balance DB, tạo tx pending
  → Backend trả { success, txId, newBalance }
  → Worker gửi TON từ ví admin đến ví user ngay lập tức (fire-and-forget)
  → Polling worker tiếp tục kiểm tra mỗi POLL_INTERVAL_MS
  → Cập nhật status → completed / failed + hoàn tiền nếu lỗi
```

---

## 1. Chạy SQL Migration

Vào **Supabase Dashboard → SQL Editor**, chạy file:
```
backend/migration_auto_withdraw.sql
```

---

## 2. Chuẩn bị Ví Admin

1. Tạo ví TON mới (khuyến nghị **Tonkeeper** hoặc **MyTonWallet**)
2. Lưu lại **24 từ seed phrase** — đây là `ADMIN_MNEMONIC`
3. Nạp TON vào ví (phải đủ để thanh toán withdrawals)

> ⚠️ **Bảo mật**: Seed phrase chỉ lưu trong `.env` trên server. Không commit git.

---

## 3. Cài đặt và chạy

```bash
cd backend/
npm install
cp .env.example .env
nano .env
```

Nội dung `.env`:
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...   # Service role key (không phải anon!)
ADMIN_MNEMONIC=word1 word2 ... word24
BOT_TOKEN=123456:ABC...          # Telegram Bot Token (để xác thực initData)
TON_NETWORK=mainnet
POLL_INTERVAL_MS=15000
PORT=3001
TON_API_KEY=                     # Tùy chọn — tăng TonCenter rate limit
```

Frontend `.env` (Vite):
```env
VITE_API_URL=https://your-backend.com/api
```
*(Mặc định fallback: `http://localhost:3001/api`)*

Chạy (worker + API server cùng một process):
```bash
# Development
npm run dev

# Production (dùng PM2)
npm install -g pm2
pm2 start withdrawal-worker.js --name ton-withdraw-worker
pm2 save && pm2 startup
```

---

## 4. Lấy Service Role Key từ Supabase

1. **Supabase Dashboard → Project → Settings → API**
2. **"Project API keys"** → copy **"service_role"** key
3. ⚠️ Key này bypass RLS — chỉ dùng trên server

---

## 5. Lifecycle của Withdrawal

| Status | Ý nghĩa |
|--------|---------|
| `pending` | API đã nhận, chờ worker gửi lên chain |
| `processing` | Worker đã claim, đang gửi giao dịch |
| `completed` | TON gửi thành công, đã confirm on-chain |
| `failed` | Thất bại — balance user được hoàn lại tự động |

---

## 6. API Endpoint

**`POST /api/withdraw`**

| Field | Type | Mô tả |
|-------|------|-------|
| `initData` | string | Telegram WebApp initData (để xác thực) |
| `userId` | string/number | Telegram user ID |
| `amount` | number | Số TON muốn rút |
| `destWallet` | string | Địa chỉ ví TON nhận tiền |

Response: `{ success: true, txId, newBalance }`

---

## 7. Monitoring

```bash
pm2 logs ton-withdraw-worker
```

```sql
-- Xem withdrawal queue
select id, user_id, amount, status, to_wallet, created_at
from transactions
where type = 'withdraw'
order by created_at desc;
```


## Tổng quan

Flow rút tiền mới **hoàn toàn tự động**:

```
User nhấn "Withdraw" 
  → Nhập địa chỉ ví TON + số tiền
  → Frontend tạo bản ghi `pending` trong Supabase
  → Backend worker phát hiện lệnh pending
  → Worker gửi TON từ ví admin trực tiếp đến ví user
  → Cập nhật status → completed
```

**Không cần**: user gửi TON, user kết nối ví TonConnect, admin xác nhận thủ công.

---

## 1. Chạy SQL Migration

Vào **Supabase Dashboard → SQL Editor**, chạy file:
```
backend/migration_auto_withdraw.sql
```

---

## 2. Chuẩn bị Ví Admin

Ví admin là ví TON dùng để **chi trả** cho user khi họ rút tiền.

1. Tạo ví TON mới (khuyến nghị dùng **Tonkeeper** hoặc **MyTonWallet**)
2. Lưu lại **24 từ seed phrase** cẩn thận — đây là `ADMIN_MNEMONIC`
3. Nạp TON vào ví này (phải có đủ TON để thanh toán withdrawal)
4. Địa chỉ ví này là `ADMIN_WALLET` trong `config.js`

> ⚠️ **Bảo mật**: Seed phrase chỉ được lưu trong file `.env` trên server.
> Không commit vào git, không chia sẻ với ai.

---

## 3. Cài đặt và chạy Worker

```bash
cd backend/
npm install
cp .env.example .env
# Chỉnh sửa .env với thông tin thật
nano .env
```

Nội dung `.env`:
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...   # Service role key (không phải anon!)
ADMIN_MNEMONIC=word1 word2 ... word24
TON_NETWORK=mainnet
POLL_INTERVAL_MS=15000
```

Chạy worker:
```bash
# Development
npm run dev

# Production (dùng PM2)
npm install -g pm2
pm2 start withdrawal-worker.js --name ton-withdraw-worker
pm2 save
pm2 startup
```

---

## 4. Lấy Service Role Key từ Supabase

1. Vào **Supabase Dashboard → Project → Settings → API**
2. Phần **"Project API keys"** → copy **"service_role"** key
3. ⚠️ Key này có quyền bypass RLS — chỉ dùng trên server, không bao giờ expose ra client

---

## 5. Lifecycle của Withdrawal

| Status | Ý nghĩa |
|--------|---------|
| `pending` | User vừa tạo lệnh, chờ worker xử lý |
| `processing` | Worker đang gửi giao dịch lên blockchain |
| `completed` | TON đã gửi thành công đến ví user |
| `failed` | Thất bại (ví không hợp lệ, admin balance thấp, v.v.) |

Nếu `failed`, balance của user sẽ được **hoàn lại tự động**.

---

## 6. Monitoring

Xem trạng thái withdrawal queue trong Supabase:
```sql
select * from withdrawal_queue order by requested_at desc;
```

Xem log worker:
```bash
pm2 logs ton-withdraw-worker
```

---

## 7. Lưu ý quan trọng

- Worker cần chạy **liên tục** trên server (VPS/cloud)
- Ví admin phải luôn có **đủ số dư** TON
- Khuyến nghị: cài cảnh báo khi balance ví admin < 10 TON
- Mỗi lệnh withdraw tốn thêm ~0.01 TON phí network (platform chịu)
