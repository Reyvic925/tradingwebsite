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

-- Copy-trading follows used by /api/copy-trades and /api/copy-summary.
-- user_id stays text to match the existing application schema and auth IDs.
CREATE TABLE IF NOT EXISTS user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  trader_id INTEGER REFERENCES traders(id) ON DELETE CASCADE,
  allocated_amount NUMERIC DEFAULT 0.00,
  current_value NUMERIC DEFAULT 0.00,
  pnl NUMERIC DEFAULT 0.00,
  pnl_percent NUMERIC DEFAULT 0.00,
  stop_loss_percent NUMERIC DEFAULT 20.00,
  take_profit_percent NUMERIC DEFAULT 200.00,
  leverage_multiplier NUMERIC DEFAULT 1.0,
  is_copying BOOLEAN DEFAULT true,
  followed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, trader_id)
);

ALTER TABLE IF EXISTS user_follows
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS trader_id INTEGER,
  ADD COLUMN IF NOT EXISTS allocated_amount NUMERIC DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS current_value NUMERIC DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS pnl NUMERIC DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS pnl_percent NUMERIC DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS stop_loss_percent NUMERIC DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS take_profit_percent NUMERIC DEFAULT 200.00,
  ADD COLUMN IF NOT EXISTS leverage_multiplier NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS is_copying BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS followed_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Some older deployments created trader_id as UUID. Trader records in this
-- application use serial/integer IDs, so normalize an empty legacy column.
DO $$
DECLARE
  trader_id_type text;
  follow_count bigint;
BEGIN
  SELECT data_type INTO trader_id_type
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'user_follows'
    AND column_name = 'trader_id';

  IF trader_id_type = 'uuid' THEN
    SELECT COUNT(*) INTO follow_count FROM user_follows;
    IF follow_count > 0 THEN
      RAISE EXCEPTION 'user_follows.trader_id is UUID but contains % existing rows; migrate those trader IDs before rerunning this repair', follow_count;
    END IF;
    ALTER TABLE user_follows DROP COLUMN trader_id;
    ALTER TABLE user_follows ADD COLUMN trader_id INTEGER REFERENCES traders(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE IF EXISTS notifications
  ADD COLUMN IF NOT EXISTS type VARCHAR DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS trader_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_follows_user ON user_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_trader ON user_follows(trader_id);
