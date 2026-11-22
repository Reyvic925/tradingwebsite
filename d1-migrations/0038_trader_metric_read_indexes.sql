-- Cover the closed-trade aggregates used to refresh stored trader metrics.
CREATE INDEX IF NOT EXISTS idx_trader_trades_trader_closed_pnl
  ON trader_trades(trader_id, pnl)
  WHERE status='CLOSED';

-- Cover active copier counts and AUM sums by trader without scanning follows
-- ordered by user_id, which cannot serve trader_id-first aggregate lookups.
CREATE INDEX IF NOT EXISTS idx_copy_follows_trader_active_value
  ON copy_follows(trader_id, current_value)
  WHERE status <> 'stopped';
