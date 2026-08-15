-- Migration: repair production schema for wallet generation + KYC
-- Date: 2026-08-15
-- README: How to run this migration
--  - Use the Supabase SQL editor (https://app.supabase.com) and paste the SQL, or run locally with psql:
--      psql "postgresql://<user>:<pass>@<host>:<port>/<db>" -f 20260815-fix-production-schema.sql
--  - No special environment variables are required beyond a working DB connection.
--  - This migration is safe to re-run (uses CREATE ... IF NOT EXISTS and ADD COLUMN IF NOT EXISTS).
--
-- WHY: the live database was created from an older revision. crypto_addresses was
-- missing the network/encrypted_mnemonic/last_used_at/metadata columns and the
-- user_mnemonics table did not exist, so every wallet-generation insert failed
-- silently (the API treats missing-schema errors as non-fatal). Additionally the
-- unique index on (user_id, network) conflicts with the wallet-variant design
-- where several variants intentionally share one network (eth + usdt_erc20 on
-- 'ethereum', bnb + usdc_erc20 on 'binance').

-- 1) user_mnemonics: per-user encrypted HD wallet mnemonic (was missing entirely).
--    Written and read only by the API with the service role key.
CREATE TABLE IF NOT EXISTS user_mnemonics (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL UNIQUE,
  encrypted_mnemonic text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_mnemonics ENABLE ROW LEVEL SECURITY; -- service_role bypasses RLS

-- 2) crypto_addresses: add every column the wallet generator writes.
ALTER TABLE IF EXISTS crypto_addresses
  ADD COLUMN IF NOT EXISTS network text,
  ADD COLUMN IF NOT EXISTS encrypted_mnemonic text,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 3) Drop the unique index that rejects multiple variants per network.
DROP INDEX IF EXISTS ux_crypto_addresses_user_network;

-- 4) Keep the correct uniqueness: one row per user/currency/address combination.
CREATE UNIQUE INDEX IF NOT EXISTS ux_crypto_addresses_user_currency_address
  ON crypto_addresses (user_id, currency, address);
CREATE INDEX IF NOT EXISTS idx_crypto_addresses_user ON crypto_addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_addresses_network ON crypto_addresses (network);

-- 5) Ensure KYC tables exist (they already do in production; kept for fresh installs).
CREATE TABLE IF NOT EXISTS kyc_files (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  kind text NOT NULL,
  mime text NOT NULL,
  size integer,
  filename text,
  data_base64 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyc_files_user ON kyc_files (user_id);

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  personal_data jsonb DEFAULT '{}'::jsonb,
  documents jsonb DEFAULT '[]'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewer_id text,
  admin_notes text,
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_kyc_user_status ON kyc_submissions (user_id, status);

-- End of migration
