CREATE TABLE IF NOT EXISTS referral_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  referred_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  deposit_id INTEGER NOT NULL UNIQUE REFERENCES deposits(id) ON DELETE CASCADE,
  reward_amount REAL NOT NULL CHECK (reward_amount > 0),
  credited_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (referrer_user_id != referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer
  ON referral_rewards(referrer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referred
  ON referral_rewards(referred_user_id, created_at DESC);

INSERT OR IGNORE INTO referral_rewards
  (referrer_user_id, referred_user_id, deposit_id, reward_amount)
SELECT referrer.user_id, referred.user_id, d.id, ROUND(d.credited_usd * 0.10, 2)
FROM deposits d
JOIN profiles referred ON referred.user_id = d.user_id
JOIN profiles referrer ON lower(referrer.referral_code) = lower(referred.referred_by)
WHERE d.status = 'confirmed'
  AND d.credited_usd > 0
  AND ROUND(d.credited_usd * 0.10, 2) > 0
  AND referrer.user_id != referred.user_id;

INSERT OR IGNORE INTO wallets (user_id, currency, available, reserved, locked_balance)
SELECT DISTINCT referrer_user_id, 'USD', 0, 0, 0
FROM referral_rewards
WHERE credited_at IS NULL;

UPDATE wallets
SET available = available + (
  SELECT COALESCE(SUM(r.reward_amount), 0)
  FROM referral_rewards r
  WHERE r.referrer_user_id = wallets.user_id AND r.credited_at IS NULL
)
WHERE currency = 'USD'
  AND EXISTS (
    SELECT 1 FROM referral_rewards r
    WHERE r.referrer_user_id = wallets.user_id AND r.credited_at IS NULL
  );

INSERT OR IGNORE INTO wallet_ledger
  (user_id, currency, entry_type, amount, source_type, source_id)
SELECT referrer_user_id, 'USD', 'credit', reward_amount, 'referral_reward', id
FROM referral_rewards
WHERE credited_at IS NULL;

UPDATE referral_rewards SET credited_at = CURRENT_TIMESTAMP
WHERE credited_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_confirmed_deposit_referral_reward
AFTER UPDATE OF status ON deposits
WHEN OLD.status = 'pending' AND NEW.status = 'confirmed'
BEGIN
  INSERT OR IGNORE INTO wallets (user_id, currency, available, reserved, locked_balance)
  SELECT referrer.user_id, 'USD', 0, 0, 0
  FROM profiles referred
  JOIN profiles referrer ON lower(referrer.referral_code) = lower(referred.referred_by)
  WHERE referred.user_id = NEW.user_id
    AND referrer.user_id != referred.user_id;

  INSERT OR IGNORE INTO referral_rewards
    (referrer_user_id, referred_user_id, deposit_id, reward_amount)
  SELECT referrer.user_id, referred.user_id, NEW.id, ROUND(NEW.credited_usd * 0.10, 2)
  FROM profiles referred
  JOIN profiles referrer ON lower(referrer.referral_code) = lower(referred.referred_by)
  WHERE referred.user_id = NEW.user_id
    AND referrer.user_id != referred.user_id
    AND NEW.credited_usd > 0
    AND ROUND(NEW.credited_usd * 0.10, 2) > 0;

  UPDATE wallets
  SET available = available + (
    SELECT reward_amount FROM referral_rewards WHERE deposit_id = NEW.id
  )
  WHERE currency = 'USD'
    AND user_id = (SELECT referrer_user_id FROM referral_rewards WHERE deposit_id = NEW.id)
    AND EXISTS (SELECT 1 FROM referral_rewards WHERE deposit_id = NEW.id AND credited_at IS NULL)
    AND changes() = 1;

  INSERT INTO wallet_ledger
    (user_id, currency, entry_type, amount, source_type, source_id)
  SELECT referrer_user_id, 'USD', 'credit', reward_amount, 'referral_reward', id
  FROM referral_rewards
  WHERE deposit_id = NEW.id AND credited_at IS NULL AND changes() = 1;

  UPDATE referral_rewards SET credited_at = CURRENT_TIMESTAMP
  WHERE deposit_id = NEW.id AND credited_at IS NULL AND changes() = 1;
END;