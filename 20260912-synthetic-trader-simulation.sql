-- Persistent deterministic synthetic trader simulation.
-- Run after 20260816-copy-trading-schema.sql.
-- Large ROI is allowed; it is valid when derived from synthetic equity.

CREATE TABLE IF NOT EXISTS trader_simulation_state (
  trader_id INTEGER PRIMARY KEY REFERENCES traders(id) ON DELETE CASCADE,
  seed TEXT NOT NULL,
  config JSONB NOT NULL,
  state JSONB NOT NULL,
  last_processed_at TIMESTAMPTZ,
  tick_index BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS synthetic_ticks (
  event_id TEXT PRIMARY KEY,
  trader_id INTEGER NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  tick_index BIGINT NOT NULL,
  tick_at TIMESTAMPTZ NOT NULL,
  equity_before NUMERIC(30, 8),
  equity_after NUMERIC(30, 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trader_id, tick_index)
);

ALTER TABLE synthetic_ticks
  ADD COLUMN IF NOT EXISTS equity_before NUMERIC(30, 8),
  ADD COLUMN IF NOT EXISTS equity_after NUMERIC(30, 8);

ALTER TABLE trade_logs
  ALTER COLUMN quantity TYPE NUMERIC,
  ALTER COLUMN entry_price TYPE NUMERIC,
  ALTER COLUMN exit_price TYPE NUMERIC,
  ALTER COLUMN pnl TYPE NUMERIC,
  ALTER COLUMN pnl_percent TYPE NUMERIC,
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS price_move_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS trade_return_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS account_return_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS entry_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exit_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS margin NUMERIC(30, 8),
  ADD COLUMN IF NOT EXISTS leverage NUMERIC(12, 4);

CREATE UNIQUE INDEX IF NOT EXISTS ux_trade_logs_event_id
  ON trade_logs(event_id) WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS synthetic_equity_snapshots (
  id BIGSERIAL PRIMARY KEY,
  trader_id INTEGER NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL UNIQUE,
  tick_index BIGINT NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  equity NUMERIC(30, 8) NOT NULL,
  daily_return NUMERIC(30, 12) NOT NULL DEFAULT 0,
  UNIQUE (trader_id, tick_index)
);

CREATE INDEX IF NOT EXISTS idx_synthetic_equity_trader_time
  ON synthetic_equity_snapshots(trader_id, snapshot_at DESC);

CREATE TABLE IF NOT EXISTS synthetic_copier_snapshots (
  id BIGSERIAL PRIMARY KEY,
  follow_id UUID NOT NULL REFERENCES user_follows(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  current_value NUMERIC(30, 8) NOT NULL,
  realized_pnl NUMERIC(30, 8) NOT NULL DEFAULT 0,
  fees NUMERIC(30, 8) NOT NULL DEFAULT 0,
  UNIQUE (follow_id, event_id)
);

ALTER TABLE user_follows
  ADD COLUMN IF NOT EXISTS copy_start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC(30, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unrealized_pnl NUMERIC(30, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fees NUMERIC(30, 8) DEFAULT 0;

ALTER TABLE traders
  DROP CONSTRAINT IF EXISTS traders_total_return_range;

CREATE INDEX IF NOT EXISTS idx_sim_state_updated ON trader_simulation_state(updated_at);
CREATE INDEX IF NOT EXISTS idx_ticks_trader ON synthetic_ticks(trader_id, tick_index);
