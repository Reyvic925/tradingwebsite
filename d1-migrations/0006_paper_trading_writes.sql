CREATE TABLE IF NOT EXISTS position_settlements (
  position_id INTEGER PRIMARY KEY REFERENCES positions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  margin_released REAL NOT NULL,
  pnl REAL NOT NULL,
  net_change REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

