CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  network TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  credited_usd REAL CHECK (credited_usd IS NULL OR credited_usd > 0),
  method TEXT NOT NULL DEFAULT 'manual_crypto',
  admin_notes TEXT,
  reviewed_by TEXT REFERENCES auth_users(id),
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status != 'confirmed' OR credited_usd IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_network_tx_hash
  ON deposits(network, lower(tx_hash));
CREATE INDEX IF NOT EXISTS idx_deposits_user_created
  ON deposits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_status_created
  ON deposits(status, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('credit', 'debit')),
  amount REAL NOT NULL CHECK (amount > 0),
  source_type TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  created_by TEXT REFERENCES auth_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created
  ON wallet_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id TEXT NOT NULL REFERENCES auth_users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_entity
  ON admin_audit_logs(entity_type, entity_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_deposit_confirm_credit
AFTER UPDATE OF status ON deposits
WHEN OLD.status = 'pending' AND NEW.status = 'confirmed'
BEGIN
  INSERT OR IGNORE INTO wallets (user_id, currency, available, reserved, locked_balance)
  VALUES (NEW.user_id, 'USD', 0, 0, 0);

  INSERT OR IGNORE INTO wallet_ledger
    (user_id, currency, entry_type, amount, source_type, source_id, created_by)
  VALUES
    (NEW.user_id, 'USD', 'credit', NEW.credited_usd, 'deposit', NEW.id, NEW.reviewed_by);

  UPDATE wallets
  SET available = available + NEW.credited_usd
  WHERE user_id = NEW.user_id AND currency = 'USD' AND changes() = 1;

  INSERT INTO transactions (user_id, type, amount, currency, method, status, reference, tx_hash)
  SELECT NEW.user_id, 'deposit', NEW.amount, NEW.currency, NEW.method, 'completed', 'DEP-' || NEW.id, NEW.tx_hash
  WHERE changes() = 1;

  INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, details_json)
  SELECT NEW.reviewed_by, 'deposit.approve', 'deposit', CAST(NEW.id AS TEXT),
    json_object('credited_usd', NEW.credited_usd, 'amount', NEW.amount, 'currency', NEW.currency, 'network', NEW.network)
  WHERE changes() = 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_deposit_reject_audit
AFTER UPDATE OF status ON deposits
WHEN OLD.status = 'pending' AND NEW.status = 'rejected'
BEGIN
  INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, details_json)
  VALUES (
    NEW.reviewed_by,
    'deposit.reject',
    'deposit',
    CAST(NEW.id AS TEXT),
    json_object('amount', NEW.amount, 'currency', NEW.currency, 'network', NEW.network, 'admin_notes', NEW.admin_notes)
  );
END;