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
  created_at timestamptz default now()
);

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
  earned numeric
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

create index if not exists idx_wallets_user on wallets (user_id);
create index if not exists idx_profiles_user on profiles (user_id);
create index if not exists idx_orders_user on orders (user_id);
create index if not exists idx_positions_user on positions (user_id, status);
create index if not exists idx_transactions_user on transactions (user_id);
create index if not exists idx_markets_symbol on markets (symbol);
create index if not exists idx_markets_class on markets (asset_class);
