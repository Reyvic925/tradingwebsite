-- Referral rewards are 10% of each confirmed referred deposit.
-- Run once in the Supabase SQL editor. Safe to rerun.

CREATE TABLE IF NOT EXISTS referral_payouts (
  id BIGSERIAL PRIMARY KEY,
  deposit_id BIGINT NOT NULL UNIQUE REFERENCES deposits(id) ON DELETE CASCADE,
  referrer_id TEXT NOT NULL,
  referred_id TEXT NOT NULL,
  deposit_amount NUMERIC(20, 2) NOT NULL,
  reward NUMERIC(20, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_payouts_referrer
  ON referral_payouts (referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_referred
  ON referral_payouts (referred_id, created_at DESC);

ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS bonus NUMERIC DEFAULT 0;
