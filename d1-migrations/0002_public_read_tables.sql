-- Public read models used by the landing page and markets browser.
-- Data import is intentionally separate from this schema migration.

CREATE TABLE IF NOT EXISTS features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  mark TEXT
);

CREATE TABLE IF NOT EXISTS platform_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT,
  value REAL,
  suffix TEXT,
  prefix TEXT
);

CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  country TEXT,
  amount REAL,
  quote TEXT,
  video_url TEXT,
  avatar_url TEXT,
  role TEXT
);

CREATE INDEX IF NOT EXISTS idx_markets_read_symbol ON markets(symbol);
CREATE INDEX IF NOT EXISTS idx_markets_read_class ON markets(asset_class);