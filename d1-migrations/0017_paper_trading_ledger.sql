CREATE TABLE IF NOT EXISTS paper_accounts (
  user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  initial_cash REAL NOT NULL DEFAULT 100000 CHECK (initial_cash > 0),
  cash_balance REAL NOT NULL DEFAULT 100000,
  reserved_cash REAL NOT NULL DEFAULT 0 CHECK (reserved_cash >= 0),
  realized_pnl REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paper_orders (
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

CREATE TABLE IF NOT EXISTS paper_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  market_id INTEGER NOT NULL REFERENCES markets(id),
  entry_order_id INTEGER NOT NULL UNIQUE REFERENCES paper_orders(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS paper_fills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES paper_orders(id) ON DELETE CASCADE,
  position_id INTEGER NOT NULL REFERENCES paper_positions(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_paper_orders_user_status
  ON paper_orders(user_id, status, id);
CREATE INDEX IF NOT EXISTS idx_paper_positions_user_status
  ON paper_positions(user_id, status, id);
CREATE INDEX IF NOT EXISTS idx_paper_fills_user_created
  ON paper_fills(user_id, filled_at DESC, id DESC);