-- Additive changes: preserve existing orders, fills and valuation assumptions.
ALTER TABLE paper_orders ADD COLUMN client_order_id TEXT;
ALTER TABLE paper_orders ADD COLUMN request_fingerprint TEXT;
ALTER TABLE paper_orders ADD COLUMN time_in_force TEXT NOT NULL DEFAULT 'GTC';
ALTER TABLE paper_orders ADD COLUMN expires_at TEXT;
ALTER TABLE paper_orders ADD COLUMN intent TEXT NOT NULL DEFAULT 'open';
ALTER TABLE paper_orders ADD COLUMN reduce_position_id INTEGER REFERENCES paper_positions(id);
ALTER TABLE paper_orders ADD COLUMN trailing_percent REAL;
ALTER TABLE paper_orders ADD COLUMN reject_reason TEXT;
ALTER TABLE paper_orders ADD COLUMN received_at TEXT;
ALTER TABLE paper_orders ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_paper_orders_client_id ON paper_orders(user_id, client_order_id) WHERE client_order_id IS NOT NULL;

ALTER TABLE paper_positions ADD COLUMN initial_quantity REAL;
ALTER TABLE paper_positions ADD COLUMN contract_multiplier REAL NOT NULL DEFAULT 1;
ALTER TABLE paper_positions ADD COLUMN quote_currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE paper_positions ADD COLUMN quote_to_usd REAL NOT NULL DEFAULT 1;
ALTER TABLE paper_positions ADD COLUMN valuation_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE paper_positions ADD COLUMN trailing_percent REAL;
ALTER TABLE paper_positions ADD COLUMN trail_reference REAL;
ALTER TABLE paper_positions ADD COLUMN fees_paid REAL NOT NULL DEFAULT 0;
ALTER TABLE paper_positions ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE paper_positions ADD COLUMN mark_error TEXT;
UPDATE paper_positions SET initial_quantity = quantity;

CREATE TABLE paper_reductions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id),
  position_id INTEGER NOT NULL REFERENCES paper_positions(id),
  client_request_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK(quantity > 0),
  released_cash REAL NOT NULL,
  gross_pnl REAL NOT NULL,
  fee REAL NOT NULL,
  net_pnl REAL NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, client_request_id)
);

CREATE TABLE paper_preferences (
  user_id TEXT PRIMARY KEY REFERENCES auth_users(id),
  commission_bps REAL NOT NULL DEFAULT 0 CHECK(commission_bps BETWEEN 0 AND 1000),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE paper_journal (
  user_id TEXT NOT NULL REFERENCES auth_users(id),
  position_id INTEGER NOT NULL REFERENCES paper_positions(id),
  notes TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, position_id)
);
CREATE TABLE paper_alerts (
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
CREATE INDEX idx_paper_alerts_user_status ON paper_alerts(user_id, status);
CREATE INDEX idx_paper_reductions_position ON paper_reductions(user_id, position_id);
CREATE INDEX idx_paper_orders_expiry ON paper_orders(status, expires_at);

CREATE TABLE paper_live_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_paper_live_tickets_expiry ON paper_live_tickets(expires_at);
