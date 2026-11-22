-- Keep the minutely copy-trade retention cleanup on the tick index instead of
-- scanning the composite (trader_id, tick) primary key for every trader.
CREATE INDEX IF NOT EXISTS idx_copy_simulation_ticks_expiry
  ON copy_simulation_ticks(tick);

-- Historical quote capture only needs unresolved provider-backed trades, in
-- chronological order. This partial index avoids rescanning the full ledger.
CREATE INDEX IF NOT EXISTS idx_trader_trades_history_capture
  ON trader_trades(traded_at, symbol)
  WHERE price_review_status='awaiting_history';
