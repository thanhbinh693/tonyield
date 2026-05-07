-- ═══════════════════════════════════════════════════════════════
-- TonYield Mini App — Supabase Schema
-- Chạy file này trong Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. USERS ────────────────────────────────────────────────────
create table if not exists users (
  id            bigint primary key,
  username      text    default '',
  first_name    text    default '',
  balance       numeric default 0,
  total_deposit numeric default 0,
  total_withdraw numeric default 0,
  today_profit  numeric default 0,
  referrals     int     default 0,
  wallet_addr   text    default '',
  join_date     text    default '',
  status        text    default 'active',
  referral_code text    default '',
  referral_friends   int     default 0,
  referral_commission numeric default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─── 2. INVESTMENTS ──────────────────────────────────────────────
create table if not exists investments (
  id                      text primary key,
  user_id                 bigint references users(id) on delete cascade,
  plan                    text,
  plan_color              text    default 'gold',
  amount                  numeric,
  rate                    numeric,
  earned                  numeric default 0,
  days_total              int,
  profit_interval_hours   numeric default 24,
  profit_interval_minutes numeric default 1440,
  profit_interval_ms      bigint  default 86400000,
  active_days             int[]   default '{1,2,3,4,5}',
  start_time              bigint,
  end_time                bigint,
  next_profit_time        bigint,
  status                  text    default 'active',
  activated               boolean default false,
  invoice_id              text    default '',
  plan_id                 int,
  created_at              timestamptz default now()
);

-- ─── 3. TRANSACTIONS ─────────────────────────────────────────────
create table if not exists transactions (
  id            text primary key,
  user_id       bigint references users(id) on delete cascade,
  type          text,
  label         text,
  amount        numeric,
  status        text    default 'pending',
  invoice_id    text    default '',
  to_wallet     text    default '',
  plan_id       int,
  fail_reason   text    default '',
  created_at    bigint,
  created_at_ts timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─── 4. ADMIN CONFIG ─────────────────────────────────────────────
create table if not exists admin_config (
  id              int primary key default 1,
  min_withdraw    numeric default 5,
  referral_rate   numeric default 5,
  maintenance_mode boolean default false,
  admin_wallet    text    default '',
  admin_ids       bigint[] default '{}',
  bot_username    text    default '',
  ton_network     text    not null default 'testnet' check (ton_network in ('mainnet', 'testnet')),
  updated_at      timestamptz default now(),
  constraint single_row check (id = 1)
);

insert into admin_config (id) values (1) on conflict (id) do update set updated_at = now();

-- ─── 5. PLANS ────────────────────────────────────────────────────
create table if not exists plans (
  id                      int primary key,
  name                    text,
  tier                    text    default 'Starter',
  min_amount              numeric default 10,
  max_amount              numeric,
  rate                    numeric default 2.5,
  duration                int     default 30,
  duration_unit           text    default 'days',
  duration_ms             bigint  default 2592000000,
  profit_interval_hours   numeric default 24,
  profit_interval_minutes numeric default 1440,
  profit_interval_ms      bigint  default 86400000,
  active_days             int[]   default '{1,2,3,4,5}',
  color                   text    default 'gold',
  hot                     boolean default false,
  updated_at              timestamptz default now()
);

-- Seed default plans (testnet: 5-min interval, hours duration)
-- ⚠️  Nếu muốn production: đổi duration_unit='days', duration=30, profit_interval_minutes=1440
insert into plans (id, name, tier, min_amount, max_amount, rate, duration, duration_unit, duration_ms, profit_interval_hours, profit_interval_minutes, profit_interval_ms, active_days, color, hot) values
  (1, 'Basic',        'Starter', 0.01, 0.99, 2.5, 1, 'hours', 3600000,  0.0833, 5,  300000,  '{0,1,2,3,4,5,6}', 'gold',   false),
  (2, 'Professional', 'Pro',     1,    4.99, 3.0, 2, 'hours', 7200000,  0.25,   15, 900000,  '{0,1,2,3,4,5,6}', 'blue',   true),
  (3, 'Elite',        'VIP',     5,    null, 3.5, 3, 'hours', 10800000, 0.5,    30, 1800000, '{0,1,2,3,4,5,6}', 'purple', false)
on conflict (id) do update set
  name                    = excluded.name,
  tier                    = excluded.tier,
  min_amount              = excluded.min_amount,
  max_amount              = excluded.max_amount,
  rate                    = excluded.rate,
  duration                = excluded.duration,
  duration_unit           = excluded.duration_unit,
  duration_ms             = excluded.duration_ms,
  profit_interval_hours   = excluded.profit_interval_hours,
  profit_interval_minutes = excluded.profit_interval_minutes,
  profit_interval_ms      = excluded.profit_interval_ms,
  active_days             = excluded.active_days,
  color                   = excluded.color,
  hot                     = excluded.hot;

-- ─── 6. VIEWS ────────────────────────────────────────────────────
create or replace view withdrawal_queue as
  select
    t.id,
    t.user_id,
    u.username,
    u.first_name,
    t.amount,
    t.to_wallet,
    t.status,
    t.fail_reason,
    to_timestamp(t.created_at / 1000) as requested_at,
    t.updated_at
  from transactions t
  left join users u on u.id = t.user_id
  where t.type = 'withdraw'
  order by t.created_at desc;

-- ─── 7. ROW LEVEL SECURITY ───────────────────────────────────────
alter table users        enable row level security;
alter table investments  enable row level security;
alter table transactions enable row level security;
alter table admin_config enable row level security;
alter table plans        enable row level security;

drop policy if exists "allow_all_users"        on users;
drop policy if exists "allow_all_investments"  on investments;
drop policy if exists "allow_all_transactions" on transactions;
drop policy if exists "allow_all_config"       on admin_config;
drop policy if exists "allow_all_plans"        on plans;

create policy "allow_all_users"        on users        for all using (true) with check (true);
create policy "allow_all_investments"  on investments  for all using (true) with check (true);
create policy "allow_all_transactions" on transactions for all using (true) with check (true);
create policy "allow_all_config"       on admin_config for all using (true) with check (true);
create policy "allow_all_plans"        on plans        for all using (true) with check (true);

-- ─── 8. INDEXES ──────────────────────────────────────────────────
create index if not exists idx_investments_user_id  on investments  (user_id);
create index if not exists idx_transactions_user_id on transactions (user_id);
create index if not exists idx_investments_status   on investments  (status);
create index if not exists idx_transactions_type    on transactions (type, status);

create index if not exists idx_tx_withdraw_pending
  on transactions (type, status, created_at)
  where type = 'withdraw' and status = 'pending';

create index if not exists idx_tx_withdraw_processing
  on transactions (type, status)
  where type = 'withdraw' and status = 'processing';
