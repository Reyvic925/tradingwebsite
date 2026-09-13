-- Enable the synthetic trader cron on an existing database.
-- Run after schema.sql and 20260913-create-trade-logs.sql.

CREATE TABLE IF NOT EXISTS public.user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  trader_id INTEGER REFERENCES public.traders(id) ON DELETE CASCADE,
  allocated_amount NUMERIC DEFAULT 0,
  current_value NUMERIC DEFAULT 0,
  pnl NUMERIC DEFAULT 0,
  pnl_percent NUMERIC DEFAULT 0,
  stop_loss_percent NUMERIC DEFAULT 20,
  take_profit_percent NUMERIC DEFAULT 200,
  leverage_multiplier NUMERIC DEFAULT 1,
  is_copying BOOLEAN DEFAULT true,
  followed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, trader_id)
);

ALTER TABLE public.user_follows
  ADD COLUMN IF NOT EXISTS allocated_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pnl NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pnl_percent NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leverage_multiplier NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_copying BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS followed_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.trader_simulation_state (
  trader_id INTEGER PRIMARY KEY REFERENCES public.traders(id) ON DELETE CASCADE,
  seed TEXT NOT NULL,
  config JSONB NOT NULL,
  state JSONB NOT NULL,
  last_processed_at TIMESTAMPTZ,
  tick_index BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.synthetic_ticks (
  event_id TEXT PRIMARY KEY,
  trader_id INTEGER NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  tick_index BIGINT NOT NULL,
  tick_at TIMESTAMPTZ NOT NULL,
  equity_before NUMERIC(30, 8),
  equity_after NUMERIC(30, 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trader_id, tick_index)
);

CREATE TABLE IF NOT EXISTS public.synthetic_equity_snapshots (
  id BIGSERIAL PRIMARY KEY,
  trader_id INTEGER NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL UNIQUE,
  tick_index BIGINT NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  equity NUMERIC(30, 8) NOT NULL,
  daily_return NUMERIC(30, 12) NOT NULL DEFAULT 0,
  UNIQUE (trader_id, tick_index)
);

CREATE TABLE IF NOT EXISTS public.synthetic_copier_snapshots (
  id BIGSERIAL PRIMARY KEY,
  follow_id UUID NOT NULL REFERENCES public.user_follows(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  current_value NUMERIC(30, 8) NOT NULL,
  realized_pnl NUMERIC(30, 8) NOT NULL DEFAULT 0,
  fees NUMERIC(30, 8) NOT NULL DEFAULT 0,
  UNIQUE (follow_id, event_id)
);

ALTER TABLE public.user_follows
  ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC(30, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unrealized_pnl NUMERIC(30, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fees NUMERIC(30, 8) DEFAULT 0;

ALTER TABLE public.trade_logs
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS price_move_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS trade_return_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS account_return_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS entry_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exit_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS margin NUMERIC(30, 8),
  ADD COLUMN IF NOT EXISTS leverage NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS notional NUMERIC(30, 8);

CREATE INDEX IF NOT EXISTS idx_sim_state_updated
  ON public.trader_simulation_state (updated_at);

CREATE INDEX IF NOT EXISTS idx_ticks_trader
  ON public.synthetic_ticks (trader_id, tick_index);

CREATE INDEX IF NOT EXISTS idx_synthetic_equity_trader_time
  ON public.synthetic_equity_snapshots (trader_id, snapshot_at DESC);

INSERT INTO public.trader_simulation_state (trader_id, seed, config, state)
SELECT
  t.id,
  'trader-' || t.id,
  jsonb_build_object(
    'strategyType', 'momentum',
    'assetClass', 'multi_asset',
    'assets', COALESCE(to_jsonb(t.asset_focus), '["BTC-USD"]'::jsonb),
    'session', COALESCE(t.session_type, 'crypto'),
    'startingEquity', COALESCE(t.current_equity, 100000),
    'targetReturnProfile', COALESCE(t.total_return, 30),
    'targetWinRate', GREATEST(0.01, LEAST(0.99, COALESCE(t.win_rate_trades, 60) / 100)),
    'riskProfile', COALESCE(t.risk_score, 5)
  ),
  jsonb_build_object(
    'equity', COALESCE(t.current_equity, 100000),
    'peakEquity', COALESCE(t.current_equity, 100000),
    'prices', '{}'::jsonb,
    'lossStreak', 0
  )
FROM public.traders t
WHERE t.is_active = true
ON CONFLICT (trader_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.apply_synthetic_tick(p_event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_event TEXT;
  event_id_value TEXT := p_event->>'event_id';
  trader_id_value INTEGER := (p_event->>'trader_id')::INTEGER;
  tick_index_value BIGINT := (p_event->>'tick_index')::BIGINT;
  tick_at_value TIMESTAMPTZ := (p_event->>'tick_at')::TIMESTAMPTZ;
  equity_before_value NUMERIC := (p_event->>'equity_before')::NUMERIC;
  equity_after_value NUMERIC := (p_event->>'equity_after')::NUMERIC;
  trade_value JSONB := p_event->'trade';
  updated_state_count INTEGER;
BEGIN
  INSERT INTO public.synthetic_ticks (
    event_id, trader_id, tick_index, tick_at, equity_before, equity_after
  ) VALUES (
    event_id_value, trader_id_value, tick_index_value, tick_at_value,
    equity_before_value, equity_after_value
  )
  ON CONFLICT DO NOTHING
  RETURNING event_id INTO claimed_event;

  IF claimed_event IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'duplicate', true, 'event_id', event_id_value);
  END IF;

  IF trade_value IS NOT NULL AND trade_value <> 'null'::JSONB THEN
    INSERT INTO public.trade_logs (
      event_id, trader_id, symbol, side, quantity, entry_price, exit_price,
      margin, leverage, notional, pnl, pnl_percent, status, traded_at, closed_at,
      entry_time, exit_time, price_move_percent, trade_return_percent,
      account_return_percent
    ) VALUES (
      event_id_value, trader_id_value, trade_value->>'symbol', trade_value->>'side',
      (trade_value->>'quantity')::NUMERIC, (trade_value->>'entry_price')::NUMERIC,
      (trade_value->>'exit_price')::NUMERIC, (trade_value->>'margin')::NUMERIC,
      (trade_value->>'leverage')::NUMERIC, (trade_value->>'notional')::NUMERIC,
      (trade_value->>'pnl')::NUMERIC, (trade_value->>'pnl_percent')::NUMERIC,
      COALESCE(trade_value->>'status', 'CLOSED'),
      (trade_value->>'traded_at')::TIMESTAMPTZ, (trade_value->>'closed_at')::TIMESTAMPTZ,
      COALESCE(trade_value->>'entry_time', trade_value->>'traded_at')::TIMESTAMPTZ,
      COALESCE(trade_value->>'exit_time', trade_value->>'closed_at', trade_value->>'traded_at')::TIMESTAMPTZ,
      (trade_value->>'price_move_percent')::NUMERIC,
      (trade_value->>'trade_return_percent')::NUMERIC,
      (trade_value->>'account_return_percent')::NUMERIC
    );
  END IF;

  INSERT INTO public.synthetic_equity_snapshots (
    trader_id, event_id, tick_index, snapshot_at, equity, daily_return
  ) VALUES (
    trader_id_value, event_id_value, tick_index_value, tick_at_value,
    equity_after_value,
    CASE WHEN equity_before_value > 0
      THEN (equity_after_value - equity_before_value) / equity_before_value
      ELSE 0
    END
  );

  UPDATE public.trader_simulation_state
  SET state = p_event->'state',
      config = p_event->'config',
      tick_index = tick_index_value,
      last_processed_at = tick_at_value,
      updated_at = NOW()
  WHERE trader_id = trader_id_value;

  GET DIAGNOSTICS updated_state_count = ROW_COUNT;
  IF updated_state_count <> 1 THEN
    RAISE EXCEPTION 'Missing simulation state for trader %', trader_id_value;
  END IF;

  RETURN jsonb_build_object(
    'applied', true,
    'duplicate', false,
    'event_id', event_id_value,
    'equity_before', equity_before_value,
    'equity_after', equity_after_value
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_synthetic_tick(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_synthetic_tick(JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
