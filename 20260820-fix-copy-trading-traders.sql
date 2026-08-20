-- Repair migration for the live database's older traders table.
-- Run once in the Supabase SQL editor before creating traders.
-- Safe to re-run: every column uses IF NOT EXISTS.

ALTER TABLE IF EXISTS traders
  ADD COLUMN IF NOT EXISTS asset_focus TEXT[] DEFAULT '{"BTC-USD", "ETH-USD"}',
  ADD COLUMN IF NOT EXISTS current_equity NUMERIC DEFAULT 10000.00,
  ADD COLUMN IF NOT EXISTS total_return NUMERIC DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS daily_return NUMERIC DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_trades INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS win_rate_trades NUMERIC DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS max_drawdown NUMERIC DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS volatility NUMERIC DEFAULT 0.005,
  ADD COLUMN IF NOT EXISTS drift NUMERIC DEFAULT 0.001,
  ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS session_type VARCHAR DEFAULT 'nyc',
  ADD COLUMN IF NOT EXISTS session_start DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS session_end DATE DEFAULT (CURRENT_DATE + INTERVAL '7 days'),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_traders_active ON traders(is_active);
CREATE INDEX IF NOT EXISTS idx_traders_session ON traders(session_type);
CREATE INDEX IF NOT EXISTS idx_traders_return ON traders(total_return DESC);
