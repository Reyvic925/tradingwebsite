ALTER TABLE trader_trades ADD COLUMN price_basis TEXT NOT NULL DEFAULT 'synthetic';
ALTER TABLE trader_trades ADD COLUMN entry_price_source TEXT;
ALTER TABLE trader_trades ADD COLUMN entry_quote_at TEXT;
ALTER TABLE trader_trades ADD COLUMN exit_price_source TEXT;
ALTER TABLE trader_trades ADD COLUMN exit_quote_at TEXT;
