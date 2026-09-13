-- Create the trader activity table required by /api/trader-trades.
-- Safe to run on the new database after schema.sql.

CREATE TABLE IF NOT EXISTS public.trade_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT,
  trader_id INTEGER REFERENCES public.traders(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity NUMERIC(20, 4) NOT NULL,
  entry_price NUMERIC(20, 4) NOT NULL,
  exit_price NUMERIC(20, 4),
  pnl NUMERIC(20, 2),
  pnl_percent NUMERIC(10, 2),
  price_move_percent NUMERIC,
  trade_return_percent NUMERIC,
  account_return_percent NUMERIC,
  entry_time TIMESTAMPTZ,
  exit_time TIMESTAMPTZ,
  margin NUMERIC(30, 8),
  leverage NUMERIC(12, 4),
  notional NUMERIC(30, 8),
  status VARCHAR(10) NOT NULL DEFAULT 'CLOSED' CHECK (status IN ('OPEN', 'CLOSED')),
  traded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.trade_logs
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS price_move_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS trade_return_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS account_return_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS entry_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exit_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS margin NUMERIC(30, 8),
  ADD COLUMN IF NOT EXISTS leverage NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS notional NUMERIC(30, 8),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_trade_logs_trader_time
  ON public.trade_logs (trader_id, traded_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_logs_event_id
  ON public.trade_logs (event_id)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_trade_logs_event_id
  ON public.trade_logs (event_id)
  WHERE event_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
