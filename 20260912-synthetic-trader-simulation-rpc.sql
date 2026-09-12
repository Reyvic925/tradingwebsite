-- Atomic tick application for the deterministic synthetic trader cron.
-- Apply after 20260912-synthetic-trader-simulation.sql.

CREATE OR REPLACE FUNCTION apply_synthetic_tick(p_event JSONB)
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
  INSERT INTO synthetic_ticks (
    event_id, trader_id, tick_index, tick_at, equity_before, equity_after
  ) VALUES (
    event_id_value, trader_id_value, tick_index_value, tick_at_value,
    equity_before_value, equity_after_value
  )
  ON CONFLICT DO NOTHING
  RETURNING event_id INTO claimed_event;

  IF claimed_event IS NULL THEN
    RETURN jsonb_build_object(
      'applied', false,
      'duplicate', true,
      'event_id', event_id_value,
      'equity_before', equity_before_value,
      'equity_after', equity_after_value
    );
  END IF;

  IF trade_value IS NOT NULL AND trade_value <> 'null'::JSONB THEN
    INSERT INTO trade_logs (
      event_id, trader_id, symbol, side, quantity, entry_price, exit_price,
      margin, leverage, notional, pnl, pnl_percent, status, traded_at, closed_at,
      entry_time, exit_time, price_move_percent, trade_return_percent,
      account_return_percent
    ) VALUES (
      event_id_value,
      trader_id_value,
      trade_value->>'symbol',
      trade_value->>'side',
      (trade_value->>'quantity')::NUMERIC,
      (trade_value->>'entry_price')::NUMERIC,
      (trade_value->>'exit_price')::NUMERIC,
      (trade_value->>'margin')::NUMERIC,
      (trade_value->>'leverage')::NUMERIC,
      (trade_value->>'notional')::NUMERIC,
      (trade_value->>'pnl')::NUMERIC,
      (trade_value->>'pnl_percent')::NUMERIC,
      COALESCE(trade_value->>'status', 'CLOSED'),
      (trade_value->>'traded_at')::TIMESTAMPTZ,
      (trade_value->>'closed_at')::TIMESTAMPTZ,
      COALESCE(trade_value->>'entry_time', trade_value->>'traded_at')::TIMESTAMPTZ,
      COALESCE(trade_value->>'exit_time', trade_value->>'closed_at', trade_value->>'traded_at')::TIMESTAMPTZ,
      (trade_value->>'price_move_percent')::NUMERIC,
      (trade_value->>'trade_return_percent')::NUMERIC,
      (trade_value->>'account_return_percent')::NUMERIC
    );
  END IF;

  INSERT INTO synthetic_equity_snapshots (
    trader_id, event_id, tick_index, snapshot_at, equity, daily_return
  ) VALUES (
    trader_id_value,
    event_id_value,
    tick_index_value,
    tick_at_value,
    equity_after_value,
    CASE WHEN equity_before_value > 0
      THEN (equity_after_value - equity_before_value) / equity_before_value
      ELSE 0
    END
  );

  UPDATE trader_simulation_state
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

REVOKE ALL ON FUNCTION apply_synthetic_tick(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_synthetic_tick(JSONB) TO service_role;
