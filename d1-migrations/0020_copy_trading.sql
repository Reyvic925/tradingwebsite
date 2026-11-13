CREATE TABLE copy_follows (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id),
  trader_id INTEGER NOT NULL REFERENCES traders(id),
  allocated_amount REAL NOT NULL CHECK (allocated_amount >= 100),
  current_value REAL NOT NULL CHECK (current_value >= 0),
  peak_value REAL NOT NULL,
  fee_high_water REAL NOT NULL,
  fees REAL NOT NULL DEFAULT 0,
  stop_loss_percent REAL NOT NULL CHECK (stop_loss_percent BETWEEN 5 AND 100),
  take_profit_percent REAL NOT NULL CHECK (take_profit_percent BETWEEN 10 AND 1000),
  leverage_multiplier REAL NOT NULL CHECK (leverage_multiplier IN (0.5, 1, 2)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','stopped')),
  stop_reason TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  last_tick INTEGER NOT NULL DEFAULT 0,
  followed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX copy_one_running ON copy_follows(user_id, trader_id) WHERE status <> 'stopped';
CREATE INDEX copy_user ON copy_follows(user_id, followed_at);
CREATE TABLE copy_activity (
  id TEXT PRIMARY KEY,
  follow_id TEXT NOT NULL REFERENCES copy_follows(id),
  kind TEXT NOT NULL,
  symbol TEXT, side TEXT, quantity REAL, entry_price REAL, exit_price REAL,
  gross_pnl REAL NOT NULL DEFAULT 0, fees REAL NOT NULL DEFAULT 0,
  net_pnl REAL NOT NULL DEFAULT 0, trade_pnl REAL, value_after REAL NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX copy_activity_recent ON copy_activity(follow_id, created_at DESC);
CREATE TABLE copy_positions (
  follow_id TEXT PRIMARY KEY REFERENCES copy_follows(id),
  event_id TEXT NOT NULL, symbol TEXT NOT NULL, side TEXT NOT NULL,
  quantity REAL NOT NULL, entry_price REAL NOT NULL, mark_price REAL NOT NULL,
  total_fees REAL NOT NULL DEFAULT 0
);
CREATE TABLE copy_simulation_state (
  trader_id INTEGER PRIMARY KEY REFERENCES traders(id),
  last_tick INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL,
  state TEXT NOT NULL
);
CREATE TABLE copy_simulation_ticks (
  trader_id INTEGER NOT NULL REFERENCES traders(id), tick INTEGER NOT NULL,
  change REAL NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(trader_id, tick)
);
ALTER TABLE trader_trades ADD COLUMN event_id TEXT;
ALTER TABLE trader_trades ADD COLUMN fees REAL NOT NULL DEFAULT 0;
ALTER TABLE trader_trades ADD COLUMN close_reason TEXT;
CREATE UNIQUE INDEX trader_trade_event ON trader_trades(event_id) WHERE event_id IS NOT NULL;

-- Reserve and release funds in the same transaction as the copy lifecycle.
CREATE TRIGGER copy_reserve BEFORE INSERT ON copy_follows BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM wallets WHERE user_id = NEW.user_id AND currency = 'USD' AND available >= NEW.allocated_amount
  ) THEN RAISE(ABORT, 'Insufficient balance') END;
  UPDATE wallets SET available = round(available - NEW.allocated_amount, 2),
    reserved = round(reserved + NEW.allocated_amount, 2)
    WHERE user_id = NEW.user_id AND currency = 'USD';
END;
CREATE TRIGGER copy_release AFTER UPDATE OF status ON copy_follows
WHEN NEW.status = 'stopped' AND OLD.status <> 'stopped' BEGIN
  UPDATE wallets SET available = round(available + NEW.current_value, 2),
    reserved = max(0, round(reserved - NEW.allocated_amount, 2))
    WHERE user_id = NEW.user_id AND currency = 'USD';
END;
