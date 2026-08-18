-- Apex Prime schema
-- Run in the Supabase SQL editor on a fresh project.

create table if not exists features (
  id serial primary key,
  title text,
  description text,
  icon text
);

create table if not exists partners (
  id serial primary key,
  name text,
  mark text
);

create table if not exists platform_stats (
  id serial primary key,
  label text,
  value numeric,
  suffix text,
  prefix text
);

create table if not exists plans (
  id serial primary key,
  name text,
  tagline text,
  min_amount numeric,
  max_amount numeric,
  daily_rate numeric,
  duration_days integer,
  total_return numeric,
  featured boolean
);

create table if not exists testimonials (
  id serial primary key,
  name text,
  country text,
  amount numeric,
  quote text,
  video_url text,
  avatar_url text,
  role text
);

create table if not exists ticker_trades (
  id serial primary key,
  trader_name text,
  symbol text,
  side text,
  quantity numeric,
  price numeric,
  asset_class text,
  created_at timestamptz default now()
);

create table if not exists markets (
  id serial primary key,
  symbol text,
  name text,
  asset_class text,
  price numeric,
  change_24h numeric,
  volume numeric,
  high_24h numeric,
  low_24h numeric
);

create table if not exists market_indices (
  id serial primary key,
  code text,
  name text,
  country text,
  region text,
  ytd_low numeric,
  ytd_high numeric,
  note text
);

create table if not exists profiles (
  id serial primary key,
  user_id text not null,
  email text,
  full_name text,
  country text,
  phone text,
  kyc_status text,
  avatar_url text,
  referral_code text,
  referred_by text,
  role text not null default 'user',
  created_at timestamptz default now()
);

create unique index if not exists idx_profiles_user_id_unique on profiles (user_id);

create table if not exists crypto_addresses (
  id bigserial primary key,
  user_id text not null,
  currency text not null,
  network text,
  address text not null,
  encrypted_private_key text not null,
  encrypted_mnemonic text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  metadata jsonb default '{}'::jsonb
);

create unique index if not exists ux_crypto_addresses_user_currency_address on crypto_addresses (user_id, currency, address);
create index if not exists idx_crypto_addresses_user on crypto_addresses (user_id);
create index if not exists idx_crypto_addresses_network on crypto_addresses (network);

-- Per-user encrypted HD wallet mnemonic used to derive all deposit addresses.
-- Written and read only by the API with the service role key.
create table if not exists user_mnemonics (
  id bigserial primary key,
  user_id text not null unique,
  encrypted_mnemonic text not null,
  created_at timestamptz not null default now()
);
alter table user_mnemonics enable row level security; -- service_role bypasses RLS

create table if not exists wallets (
  id serial primary key,
  user_id text not null,
  currency text,
  available numeric,
  reserved numeric
);

create table if not exists orders (
  id serial primary key,
  user_id text,
  market_id integer,
  symbol text,
  side text,
  type text,
  quantity numeric,
  price numeric,
  stop_loss numeric,
  take_profit numeric,
  status text,
  filled_price numeric,
  created_at timestamptz default now()
);

create table if not exists positions (
  id serial primary key,
  user_id text,
  market_id integer,
  symbol text,
  side text,
  quantity numeric,
  entry_price numeric,
  current_price numeric,
  stop_loss numeric,
  take_profit numeric,
  pnl numeric,
  margin numeric,
  status text,
  created_at timestamptz default now(),
  closed_at timestamptz
);

create table if not exists watchlist (
  id serial primary key,
  user_id text,
  market_id integer,
  symbol text
);

create table if not exists investments (
  id serial primary key,
  user_id text,
  plan_id integer,
  plan_name text,
  amount numeric,
  daily_rate numeric,
  duration_days integer,
  start_date timestamptz,
  end_date timestamptz,
  status text,
  earned numeric,
  days_elapsed numeric default 0
);

create table if not exists transactions (
  id serial primary key,
  user_id text,
  type text,
  amount numeric,
  currency text,
  method text,
  status text,
  reference text,
  created_at timestamptz default now()
);

create table if not exists referrals (
  id serial primary key,
  referrer_id text,
  referred_id text,
  referred_email text,
  bonus numeric,
  status text,
  created_at timestamptz default now()
);

create table if not exists traders (
  id serial primary key,
  name text,
  country text,
  avatar_url text,
  win_rate numeric,
  followers integer,
  monthly_return numeric,
  bio text,
  risk_level text,
  specialty text
);

create table if not exists copy_trades (
  id serial primary key,
  user_id text,
  trader_id integer,
  trader_name text,
  allocated numeric,
  pnl numeric,
  status text,
  created_at timestamptz default now()
);

create table if not exists notifications (
  id serial primary key,
  user_id text,
  title text,
  body text,
  read boolean,
  created_at timestamptz default now()
);

create table if not exists market_indices (
  id serial primary key,
  code text,
  name text,
  country text,
  region text,
  ytd_low numeric,
  ytd_high numeric,
  note text
);

create table if not exists deposits (
  id bigserial primary key,
  user_id text not null,
  amount numeric not null,
  currency text default 'USD',
  status text default 'pending',
  method text default 'manual',
  tx_hash text,
  admin_notes text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallets_user on wallets (user_id);
create index if not exists idx_profiles_user on profiles (user_id);
create index if not exists idx_orders_user on orders (user_id);
create index if not exists idx_positions_user on positions (user_id, status);
create index if not exists idx_transactions_user on transactions (user_id);
create index if not exists idx_deposits_user on deposits (user_id);
create index if not exists idx_deposits_status on deposits (status);
create index if not exists idx_markets_symbol on markets (symbol);
create index if not exists idx_markets_class on markets (asset_class);

-- Configuration table for app-wide settings
create table if not exists app_config (
  id serial primary key,
  key text not null unique,
  value jsonb not null,
  description text,
  updated_at timestamptz default now()
);

create index if not exists idx_app_config_key on app_config (key);

-- KYC submissions table for document storage and verification tracking
create table if not exists kyc_submissions (
  id bigserial primary key,
  user_id text not null,
  personal_data jsonb,
  documents jsonb default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  status text default 'pending',
  reviewer_id text,
  reviewed_at timestamptz,
  admin_notes text,
  submitted_at timestamptz default now()
);

create index if not exists idx_kyc_submissions_user_id on kyc_submissions (user_id);
create index if not exists idx_kyc_submissions_status on kyc_submissions (status);
create index if not exists idx_kyc_submissions_submitted_at on kyc_submissions (submitted_at);

-- Uploaded KYC document images (base64 bytes; served only via /api/kyc-upload with owner-or-admin checks)
create table if not exists kyc_files (
  id bigserial primary key,
  user_id text not null,
  kind text not null,
  mime text not null,
  size integer,
  filename text,
  data_base64 text not null,
  created_at timestamptz default now()
);

create index if not exists idx_kyc_files_user_id on kyc_files (user_id);

-- Admin audit log for compliance and security
create table if not exists admin_audit_log (
  id bigserial primary key,
  admin_id text,
  action text not null,
  target_type text,
  target_id text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_admin_audit_log_admin_id on admin_audit_log (admin_id);
create index if not exists idx_admin_audit_log_action on admin_audit_log (action);
create index if not exists idx_admin_audit_log_created_at on admin_audit_log (created_at);
