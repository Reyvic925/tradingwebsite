ALTER TABLE orders ADD COLUMN operation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_operation_id
  ON orders(operation_id)
  WHERE operation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_one_open_per_market
  ON positions(user_id, market_id)
  WHERE status = 'open';