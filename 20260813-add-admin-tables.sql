-- Migration: Add admin and supporting tables for price history, crypto deposit addresses, KYC, and admin audit
-- README: How to run this migration
--  - Use the Supabase SQL editor (https://app.supabase.com) and paste the SQL, or run locally with psql:
--      psql "postgresql://<user>:<pass>@<host>:<port>/<db>" -f 20260813-add-admin-tables.sql
--  - No special environment variables are required for the SQL file itself beyond a working DB connection.
--  - This migration is safe to re-run (uses CREATE ... IF NOT EXISTS and ALTER ... IF NOT EXISTS).

-- price_history: OHLCV time series for each market
CREATE TABLE IF NOT EXISTS price_history (
  id bigserial PRIMARY KEY,
  market_id integer NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  close numeric NOT NULL,
  volume numeric DEFAULT 0,
  meta jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_price_history_market_ts ON price_history (market_id, ts DESC);

-- crypto_addresses: per-user generated deposit addresses with encrypted keys
CREATE TABLE IF NOT EXISTS crypto_addresses (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  currency text NOT NULL,
  network text,
  address text NOT NULL,
  encrypted_private_key text NOT NULL,
  encrypted_mnemonic text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE IF EXISTS crypto_addresses
  ADD COLUMN IF NOT EXISTS network text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_crypto_addresses_user_currency_address ON crypto_addresses (user_id, currency, address);
CREATE UNIQUE INDEX IF NOT EXISTS ux_crypto_addresses_user_network ON crypto_addresses (user_id, network) WHERE network IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crypto_addresses_user ON crypto_addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_addresses_network ON crypto_addresses (network);

-- kyc_submissions: user KYC payloads and administrative review state
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  personal_data jsonb DEFAULT '{}'::jsonb,
  documents jsonb DEFAULT '[]'::jsonb, -- array of file URLs/objects
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewer_id text,
  admin_notes text,
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_kyc_user_status ON kyc_submissions (user_id, status);

-- admin_audit_log: records of admin actions for auditing
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id bigserial PRIMARY KEY,
  admin_id text NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log (admin_id, created_at DESC);

-- Markets: extend existing markets table with admin/metadata columns used by the application
ALTER TABLE IF EXISTS markets
  ADD COLUMN IF NOT EXISTS hidden_drift boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extras jsonb DEFAULT '{}'::jsonb;

-- Note: asset_class already exists in the canonical schema (see schema.sql). We only add metadata columns here to avoid destructive migrations.

-- Optional: ensure markets table exists before creating fk index; create a lightweight index reference
-- (Do not create foreign key constraints here to keep migrations painless across environments.)

-- End of migration
