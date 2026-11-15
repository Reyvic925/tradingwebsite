CREATE TABLE IF NOT EXISTS trade_price_audit (
  entity TEXT NOT NULL,
  record_id TEXT NOT NULL,
  original_json TEXT NOT NULL CHECK (json_valid(original_json)),
  repair_json TEXT NOT NULL CHECK (json_valid(repair_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity, record_id)
);

ALTER TABLE trader_trades ADD COLUMN price_review_status TEXT NOT NULL DEFAULT 'pending';
