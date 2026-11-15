-- Separate wallet-funded execution from the preserved legacy demo ledger.
-- No legacy cash, positions, fills or P&L are credited to wallets.
CREATE TABLE IF NOT EXISTS funded_accounts (
  user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  initial_cash REAL NOT NULL DEFAULT 0 CHECK (initial_cash = 0),
  cash_balance REAL NOT NULL DEFAULT 0,
  reserved_cash REAL NOT NULL DEFAULT 0 CHECK (reserved_cash >= 0),
  realized_pnl REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS funded_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  market_id INTEGER NOT NULL REFERENCES markets(id),
  operation_id TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  type TEXT NOT NULL CHECK (type IN ('market', 'limit', 'stop', 'stop_limit', 'close')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  limit_price REAL,
  stop_price REAL,
  stop_loss REAL,
  take_profit REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'triggered', 'filled', 'cancelled', 'rejected')),
  filled_price REAL,
  quote_source TEXT,
  quote_updated_at TEXT,
  triggered_at TEXT,
  filled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS funded_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  market_id INTEGER NOT NULL REFERENCES markets(id),
  entry_order_id INTEGER NOT NULL UNIQUE REFERENCES funded_orders(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  entry_price REAL NOT NULL CHECK (entry_price > 0),
  current_price REAL NOT NULL CHECK (current_price > 0),
  reserved_cash REAL NOT NULL CHECK (reserved_cash >= 0),
  stop_loss REAL,
  take_profit REAL,
  unrealized_pnl REAL NOT NULL DEFAULT 0,
  realized_pnl REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  price_source TEXT,
  quote_updated_at TEXT,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS funded_fills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES funded_orders(id) ON DELETE CASCADE,
  position_id INTEGER NOT NULL REFERENCES funded_positions(id) ON DELETE CASCADE,
  market_id INTEGER NOT NULL REFERENCES markets(id),
  symbol TEXT NOT NULL,
  fill_type TEXT NOT NULL CHECK (fill_type IN ('entry', 'close')),
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  price REAL NOT NULL CHECK (price > 0),
  quote_source TEXT NOT NULL,
  quote_updated_at TEXT,
  filled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_funded_orders_user_status
  ON funded_orders(user_id, status, id);
CREATE INDEX IF NOT EXISTS idx_funded_positions_user_status
  ON funded_positions(user_id, status, id);
CREATE INDEX IF NOT EXISTS idx_funded_fills_user_created
  ON funded_fills(user_id, filled_at DESC, id DESC);
-- Additive changes: preserve existing orders, fills and valuation assumptions.
ALTER TABLE funded_orders ADD COLUMN client_order_id TEXT;
ALTER TABLE funded_orders ADD COLUMN request_fingerprint TEXT;
ALTER TABLE funded_orders ADD COLUMN time_in_force TEXT NOT NULL DEFAULT 'GTC';
ALTER TABLE funded_orders ADD COLUMN expires_at TEXT;
ALTER TABLE funded_orders ADD COLUMN intent TEXT NOT NULL DEFAULT 'open';
ALTER TABLE funded_orders ADD COLUMN reduce_position_id INTEGER REFERENCES funded_positions(id);
ALTER TABLE funded_orders ADD COLUMN trailing_percent REAL;
ALTER TABLE funded_orders ADD COLUMN reject_reason TEXT;
ALTER TABLE funded_orders ADD COLUMN received_at TEXT;
ALTER TABLE funded_orders ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_funded_orders_client_id ON funded_orders(user_id, client_order_id) WHERE client_order_id IS NOT NULL;

ALTER TABLE funded_positions ADD COLUMN initial_quantity REAL;
ALTER TABLE funded_positions ADD COLUMN contract_multiplier REAL NOT NULL DEFAULT 1;
ALTER TABLE funded_positions ADD COLUMN quote_currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE funded_positions ADD COLUMN quote_to_usd REAL NOT NULL DEFAULT 1;
ALTER TABLE funded_positions ADD COLUMN valuation_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE funded_positions ADD COLUMN trailing_percent REAL;
ALTER TABLE funded_positions ADD COLUMN trail_reference REAL;
ALTER TABLE funded_positions ADD COLUMN fees_paid REAL NOT NULL DEFAULT 0;
ALTER TABLE funded_positions ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE funded_positions ADD COLUMN mark_error TEXT;
UPDATE funded_positions SET initial_quantity = quantity;

CREATE TABLE funded_reductions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id),
  position_id INTEGER NOT NULL REFERENCES funded_positions(id),
  client_request_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK(quantity > 0),
  released_cash REAL NOT NULL,
  gross_pnl REAL NOT NULL,
  fee REAL NOT NULL,
  net_pnl REAL NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, client_request_id)
);

CREATE TABLE funded_preferences (
  user_id TEXT PRIMARY KEY REFERENCES auth_users(id),
  commission_bps REAL NOT NULL DEFAULT 0 CHECK(commission_bps BETWEEN 0 AND 1000),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE funded_journal (
  user_id TEXT NOT NULL REFERENCES auth_users(id),
  position_id INTEGER NOT NULL REFERENCES funded_positions(id),
  notes TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, position_id)
);
CREATE TABLE funded_alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('above','below')),
  target REAL NOT NULL CHECK(target > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','triggered','cancelled')),
  triggered_price REAL,
  triggered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_funded_alerts_user_status ON funded_alerts(user_id, status);
CREATE INDEX idx_funded_reductions_position ON funded_reductions(user_id, position_id);
CREATE INDEX idx_funded_orders_expiry ON funded_orders(status, expires_at);

CREATE TABLE funded_live_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_funded_live_tickets_expiry ON funded_live_tickets(expires_at);

-- Old code must fail closed rather than issue new demo funds or settle demo P&L.
CREATE TRIGGER disable_demo_account_insert BEFORE INSERT ON paper_accounts BEGIN
  SELECT RAISE(ABORT, 'Demo accounts are disabled');
END;
CREATE TRIGGER disable_demo_account_update BEFORE UPDATE ON paper_accounts BEGIN
  SELECT RAISE(ABORT, 'Legacy demo accounts are archived');
END;
