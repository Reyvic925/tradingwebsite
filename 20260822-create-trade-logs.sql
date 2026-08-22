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

ALTER TABLE trade_logs
  ADD COLUMN IF NOT EXISTS trader_id INTEGER,
  ADD COLUMN IF NOT EXISTS symbol VARCHAR(20),
  ADD COLUMN IF NOT EXISTS side VARCHAR(4),
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(20, 4),
  ADD COLUMN IF NOT EXISTS entry_price NUMERIC(20, 4),
  ADD COLUMN IF NOT EXISTS exit_price NUMERIC(20, 4),
  ADD COLUMN IF NOT EXISTS pnl NUMERIC(20, 2),
  ADD COLUMN IF NOT EXISTS pnl_percent NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS status VARCHAR(10) DEFAULT 'CLOSED',
  ADD COLUMN IF NOT EXISTS traded_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

DO $$
DECLARE
  trader_id_type TEXT;
  trade_count BIGINT;
BEGIN
  SELECT data_type INTO trader_id_type
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'trade_logs'
    AND column_name = 'trader_id';

  IF trader_id_type = 'uuid' THEN
    SELECT COUNT(*) INTO trade_count FROM trade_logs;
    IF trade_count > 0 THEN
      RAISE EXCEPTION 'trade_logs.trader_id is UUID and contains % rows; migrate those rows before rerunning', trade_count;
    END IF;
    ALTER TABLE trade_logs DROP COLUMN trader_id;
    ALTER TABLE trade_logs ADD COLUMN trader_id INTEGER REFERENCES traders(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trade_logs_trader_time
  ON trade_logs (trader_id, traded_at DESC);
