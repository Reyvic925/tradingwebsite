-- Cloudflare D1 foundation schema.
-- This migration intentionally keeps the legacy Supabase schema untouched while
-- the Worker API is ported route by route.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  country TEXT,
  phone TEXT,
  kyc_status TEXT NOT NULL DEFAULT 'unverified',
  avatar_url TEXT,
  referral_code TEXT,
  referred_by TEXT,
  tier TEXT NOT NULL DEFAULT 'Starter',
  locked_balance REAL NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tagline TEXT,
  min_amount REAL,
  max_amount REAL,
  daily_rate REAL,
  duration_days INTEGER,
  total_return REAL,
  featured INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS investment_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  tier_level INTEGER NOT NULL,
  percent_return REAL NOT NULL,
  duration_days INTEGER NOT NULL,
  min_investment REAL NOT NULL,
  max_investment REAL NOT NULL,
  roi_min REAL NOT NULL DEFAULT 15,
  roi_max REAL NOT NULL DEFAULT 22,
  volatility_min REAL NOT NULL DEFAULT 5,
  volatility_max REAL NOT NULL DEFAULT 10,
  simulation_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS markets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  name TEXT,
  asset_class TEXT,
  price REAL,
  change_24h REAL,
  volume REAL,
  high_24h REAL,
  low_24h REAL
);

CREATE INDEX IF NOT EXISTS idx_markets_symbol ON markets(symbol);
CREATE INDEX IF NOT EXISTS idx_markets_class ON markets(asset_class);

CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'USD',
  available REAL NOT NULL DEFAULT 0,
  reserved REAL NOT NULL DEFAULT 0,
  locked_balance REAL NOT NULL DEFAULT 0,
  UNIQUE(user_id, currency)
);

CREATE TABLE IF NOT EXISTS investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES plans(id),
  tier_id INTEGER REFERENCES investment_tiers(id),
  plan_name TEXT,
  amount REAL NOT NULL,
  current_value REAL NOT NULL DEFAULT 0,
  daily_rate REAL,
  duration_days INTEGER,
  start_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_date TEXT NOT NULL,
  mature_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  earned REAL NOT NULL DEFAULT 0,
  days_elapsed REAL NOT NULL DEFAULT 0,
  roi_withdrawn INTEGER NOT NULL DEFAULT 0,
  roi_withdrawal_pending INTEGER NOT NULL DEFAULT 0,
  roi_withdrawn_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_investments_user_status ON investments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_investments_end_date ON investments(end_date);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  method TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reference TEXT,
  tx_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  personal_data TEXT,
  documents TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  reviewer_id TEXT,
  reviewed_at TEXT,
  admin_notes TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kyc_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER,
  filename TEXT,
  r2_object_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kyc_files_user_id ON kyc_files(user_id);
