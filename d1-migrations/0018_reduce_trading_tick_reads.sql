CREATE INDEX IF NOT EXISTS idx_paper_orders_status_user
  ON paper_orders(status, user_id);

CREATE INDEX IF NOT EXISTS idx_paper_positions_status_user
  ON paper_positions(status, user_id);
