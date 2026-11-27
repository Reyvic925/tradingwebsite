-- Distinguish backfilled modelled strategy history from live observed activity.
-- Default 0 keeps every existing row classified as before.
ALTER TABLE trader_history ADD COLUMN modelled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trader_trades ADD COLUMN modelled INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_trader_history_modelled ON trader_history(trader_id, modelled);
