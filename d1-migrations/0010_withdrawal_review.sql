ALTER TABLE transactions ADD COLUMN external_address TEXT;
ALTER TABLE transactions ADD COLUMN reviewed_at TEXT;
ALTER TABLE transactions ADD COLUMN reviewed_by TEXT REFERENCES auth_users(id);
ALTER TABLE transactions ADD COLUMN admin_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_withdrawal_status_created
  ON transactions(type, status, created_at DESC);