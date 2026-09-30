CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  investment_id INTEGER REFERENCES investments(id),
  type TEXT NOT NULL CHECK (type IN ('regular', 'roi')),
  amount REAL NOT NULL CHECK (amount > 0),
  reserved_amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  network TEXT,
  wallet_address TEXT,
  fee_stage TEXT NOT NULL DEFAULT 'awaiting_activation_fee',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  activation_fee_amount REAL NOT NULL DEFAULT 0,
  activation_fee_paid REAL NOT NULL DEFAULT 0,
  deducted_from_available INTEGER NOT NULL DEFAULT 0 CHECK (deducted_from_available IN (0, 1)),
  from_locked_balance INTEGER NOT NULL DEFAULT 0 CHECK (from_locked_balance IN (0, 1)),
  admin_notes TEXT,
  approved_at TEXT,
  processed_at TEXT,
  processed_by TEXT REFERENCES auth_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_status_created
  ON withdrawals(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_type_status_created
  ON withdrawals(type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_investment
  ON withdrawals(investment_id);