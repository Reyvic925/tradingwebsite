CREATE TABLE IF NOT EXISTS traders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  country TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  specialty TEXT NOT NULL DEFAULT '',
  asset_focus TEXT NOT NULL DEFAULT '["BTC-USD","ETH-USD"]' CHECK (json_valid(asset_focus)),
  session_type TEXT NOT NULL DEFAULT 'nyc',
  current_equity REAL NOT NULL DEFAULT 10000,
  total_return REAL NOT NULL DEFAULT 0,
  daily_return REAL NOT NULL DEFAULT 0,
  monthly_return REAL NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  win_rate_trades REAL NOT NULL DEFAULT 50,
  max_drawdown REAL NOT NULL DEFAULT 0,
  volatility REAL NOT NULL DEFAULT 0.005,
  drift REAL NOT NULL DEFAULT 0.001,
  risk_score INTEGER NOT NULL DEFAULT 5,
  risk_level TEXT NOT NULL DEFAULT 'Medium',
  badge TEXT NOT NULL DEFAULT 'Gold',
  followers INTEGER NOT NULL DEFAULT 0,
  copiers_current INTEGER NOT NULL DEFAULT 0,
  copiers_all_time INTEGER NOT NULL DEFAULT 0,
  under_management REAL NOT NULL DEFAULT 0,
  profit_for_copiers REAL NOT NULL DEFAULT 0,
  profit_sharing_fee REAL NOT NULL DEFAULT 20,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  session_start TEXT NOT NULL DEFAULT CURRENT_DATE,
  session_end TEXT NOT NULL DEFAULT (date('now', '+365 days')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_traders_active_return
  ON traders(is_active, total_return DESC);

CREATE TABLE IF NOT EXISTS trader_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trader_id INTEGER NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  exit_price REAL,
  pnl REAL,
  pnl_percent REAL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  traded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_trader_trades_recent
  ON trader_trades(trader_id, traded_at DESC);

CREATE TABLE IF NOT EXISTS trader_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trader_id INTEGER NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  equity REAL NOT NULL,
  daily_return REAL NOT NULL DEFAULT 0,
  UNIQUE (trader_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_trader_history_recent
  ON trader_history(trader_id, snapshot_date);

INSERT OR IGNORE INTO traders (
  name, country, avatar_url, bio, specialty, asset_focus, session_type,
  current_equity, total_return, daily_return, monthly_return, total_trades,
  win_rate_trades, max_drawdown, risk_score, risk_level, badge,
  followers, copiers_current, copiers_all_time, under_management,
  is_active, session_start, session_end
)
VALUES
  ('Sofia Alvarez', 'Spain', '/images/avatar-1.jpg', 'Systematic FX trader focused on disciplined entries and controlled downside.', 'FX and gold', '["EUR-USD","GBP-USD","XAU-USD"]', 'london', 100000, 34.80, 0.72, 6.90, 684, 71.40, 11.20, 5, 'Medium', 'Gold', 48, 48, 72, 72000, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Marcus Reed', 'United States', '/images/avatar-2.jpg', 'US equities specialist using momentum and earnings strength during New York hours.', 'US equities', '["AAPL","NVDA","TSLA","SPX500"]', 'nyc', 100000, 48.60, 1.05, 8.40, 921, 68.90, 15.80, 6, 'Medium', 'Platinum', 76, 76, 118, 114000, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Kenji Watanabe', 'Japan', '/images/avatar-3.jpg', 'Patient multi-asset trader combining crypto liquidity analysis with major currency pairs.', 'Crypto and FX', '["BTC-USD","ETH-USD","USD-JPY"]', 'asia', 100000, 27.35, 0.41, 5.30, 512, 74.20, 8.60, 4, 'Low', 'Silver', 35, 35, 59, 52500, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Priya Nair', 'India', '/images/avatar-4.jpg', 'Quantitative crypto trader using volatility bands and strict exposure limits.', 'Crypto quant', '["BTC-USD","ETH-USD","SOL-USD"]', 'crypto', 100000, 62.40, 1.32, 10.20, 1186, 72.50, 19.10, 8, 'High', 'Diamond', 112, 112, 176, 224000, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Liam Oconnell', 'Ireland', '/images/avatar-5.jpg', 'Conservative portfolio manager prioritizing steady returns and small position sizes.', 'Conservative FX', '["EUR-USD","GBP-USD","DAX40"]', 'london', 100000, 19.75, 0.29, 3.80, 403, 79.60, 6.90, 3, 'Low', 'Silver', 29, 29, 44, 43500, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Fatima Hassan', 'United Arab Emirates', '/images/avatar-6.jpg', 'Active commodities trader focused on gold and energy momentum across global sessions.', 'Commodities', '["XAU-USD","BRENT","WTI"]', 'asia', 100000, 53.70, 1.10, 9.30, 902, 67.10, 18.30, 7, 'High', 'Platinum', 89, 89, 136, 178000, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Daniel Silva', 'Brazil', '/images/avatar-7.jpg', 'Price-action trader specializing in index breakouts and short intraday opportunities.', 'Indices', '["NASDAQ","SPX500","USD-BRL"]', 'nyc', 100000, 38.90, 0.67, 7.10, 806, 64.70, 14.60, 6, 'Medium', 'Gold', 58, 58, 91, 87000, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Elena Petrova', 'Bulgaria', '/images/avatar-8.jpg', 'Technical FX trader combining trend structure with carefully timed London reversals.', 'Technical FX', '["GBP-USD","EUR-USD","GBP-JPY"]', 'london', 100000, 29.45, 0.56, 5.90, 597, 70.30, 10.80, 5, 'Medium', 'Gold', 41, 41, 68, 61500, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Noah Williams', 'Canada', '/images/avatar-1.jpg', 'Balanced multi-asset trader with a preference for liquid US shares and precious metals.', 'Balanced assets', '["MSFT","AMZN","XAU-USD"]', 'nyc', 100000, 24.10, 0.36, 4.70, 455, 69.80, 9.70, 4, 'Low', 'Silver', 33, 33, 52, 49500, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Ethan Brooks', 'Australia', '/images/avatar-2.jpg', 'Digital-asset trader seeking liquid setups while keeping leverage measured.', 'Digital assets', '["BTC-USD","ETH-USD","AVAX-USD"]', 'crypto', 100000, 45.25, 0.93, 8.10, 1004, 70.90, 16.40, 6, 'Medium', 'Platinum', 69, 69, 106, 103500, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Maya Thompson', 'United Kingdom', '/images/avatar-3.jpg', 'London-session trader using structured entries across sterling, euro, and European indices.', 'European markets', '["GBP-USD","EUR-USD","DAX40"]', 'london', 100000, 31.60, 0.62, 6.40, 645, 73.10, 12.50, 5, 'Medium', 'Gold', 46, 46, 74, 69000, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Victor Mensah', 'Ghana', '/images/avatar-4.jpg', 'Day trader combining New York momentum with clear risk limits and repeatable execution.', 'Day trading', '["BTC-USD","ETH-USD","XAU-USD"]', 'nyc', 100000, 46.07, 0.46, 8.20, 890, 69.60, 13.80, 5, 'Medium', 'Platinum', 84, 84, 124, 126000, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Lucas Martin', 'France', '/images/avatar-5.jpg', 'Rule-based European trader focused on major FX pairs and low-frequency setups.', 'Major FX pairs', '["EUR-USD","USD-CHF","CAC40"]', 'london', 100000, 22.85, 0.33, 4.10, 376, 77.20, 7.40, 3, 'Low', 'Silver', 28, 28, 43, 42000, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Aisha Williams', 'South Africa', '/images/avatar-6.jpg', 'Momentum trader moving between crypto and global indices when liquidity is strongest.', 'Momentum', '["BTC-USD","NASDAQ","USD-JPY"]', 'crypto', 100000, 57.30, 1.18, 9.80, 1098, 65.90, 20.20, 8, 'High', 'Platinum', 97, 97, 149, 195000, 1, CURRENT_DATE, date('now', '+365 days')),
  ('James Carter', 'United States', '/images/avatar-7.jpg', 'Trend-following trader focused on liquid technology shares and index momentum.', 'Tech momentum', '["AAPL","MSFT","NASDAQ"]', 'nyc', 100000, 36.40, 0.74, 6.80, 612, 70.20, 12.80, 5, 'Medium', 'Gold', 52, 52, 83, 78000, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Isabella Rossi', 'Italy', '/images/avatar-8.jpg', 'European market specialist trading currency reversals around major economic releases.', 'European FX', '["EUR-USD","GBP-USD","DAX40"]', 'london', 100000, 26.70, 0.48, 5.10, 488, 72.60, 9.30, 4, 'Low', 'Silver', 37, 37, 58, 55500, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Oliver Schmidt', 'Germany', '/images/avatar-1.jpg', 'Structured index trader using measured breakouts and strict daily loss limits.', 'Index breakouts', '["DAX40","CAC40","EUR-USD"]', 'london', 100000, 33.15, 0.59, 6.00, 571, 68.40, 13.10, 5, 'Medium', 'Gold', 44, 44, 69, 66000, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Layla Hassan', 'Egypt', '/images/avatar-2.jpg', 'Asia-session currency trader with a focus on yen crosses and gold.', 'Yen crosses', '["USD-JPY","GBP-JPY","XAU-USD"]', 'asia', 100000, 30.25, 0.53, 5.70, 526, 73.80, 10.40, 4, 'Low', 'Gold', 39, 39, 62, 58500, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Mateo Garcia', 'Mexico', '/images/avatar-3.jpg', 'Latin American markets trader balancing regional FX with liquid global assets.', 'Latin American FX', '["USD-MXN","SPX500","BTC-USD"]', 'nyc', 100000, 28.65, 0.51, 5.60, 540, 71.20, 11.30, 5, 'Medium', 'Gold', 42, 42, 66, 63000, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Amara Okafor', 'Nigeria', '/images/avatar-4.jpg', 'High-conviction macro trader following commodities, currencies, and global risk sentiment.', 'Macro trading', '["XAU-USD","USD-JPY","WTI"]', 'london', 100000, 41.20, 0.88, 7.60, 738, 66.80, 17.40, 7, 'High', 'Platinum', 63, 63, 99, 94500, 1, CURRENT_DATE, date('now', '+365 days')),
  ('Mark Hergott', 'United States', '/images/avatar-5.jpg', 'Multi-asset trader focused on disciplined execution, clear risk limits, and consistent portfolio management.', 'Multi-asset trading', '["BTC-USD","EUR-USD","SPX500"]', 'nyc', 100000, 32.80, 0.61, 6.20, 584, 70.10, 12.40, 5, 'Medium', 'Gold', 45, 45, 71, 67500, 1, CURRENT_DATE, date('now', '+365 days'));
