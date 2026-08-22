-- Ensure the copy-trading cron has a table for completed BUY/SELL P&L records.
-- Run once in the Supabase SQL editor. Safe to rerun.

CREATE TABLE IF NOT EXISTS trade_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id INTEGER REFERENCES traders(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity NUMERIC(20, 4) NOT NULL,
  entry_price NUMERIC(20, 4) NOT NULL,
  exit_price NUMERIC(20, 4),
  pnl NUMERIC(20, 2),
  pnl_percent NUMERIC(10, 2),
  status VARCHAR(10) NOT NULL DEFAULT 'CLOSED' CHECK (status IN ('OPEN', 'CLOSED')),
  traded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trade_logs_trader_time
  ON trade_logs (trader_id, traded_at DESC);
