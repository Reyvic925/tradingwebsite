-- Add the lead traders requested for the copy-trading roster.
-- Safe to rerun: records are matched by name case-insensitively.

ALTER TABLE IF EXISTS traders
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS asset_focus TEXT[] DEFAULT '{"BTC-USD", "ETH-USD"}',
  ADD COLUMN IF NOT EXISTS session_type VARCHAR DEFAULT 'nyc',
  ADD COLUMN IF NOT EXISTS current_equity NUMERIC DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS total_return NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_return NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_trades INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS win_rate_trades NUMERIC DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_drawdown NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volatility NUMERIC DEFAULT 0.005,
  ADD COLUMN IF NOT EXISTS drift NUMERIC DEFAULT 0.001,
  ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'Medium',
  ADD COLUMN IF NOT EXISTS specialty TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS followers INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_return NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS session_start DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS session_end DATE DEFAULT (CURRENT_DATE + INTERVAL '365 days'),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

WITH requested (
  name, bio, specialty, total_return, current_equity, followers, total_trades,
  risk_level, risk_score, asset_focus, session_type
) AS (
  VALUES
    ('Ingrid Martingale', 'High-frequency profit-generator strategy.', 'High-frequency, Profit-generator', 79.93, 826593.72, 2748, 4123, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto'),
    ('EmaGamTRAD', 'EmaGamTRAD is opening more trades than most lead traders.', 'High-frequency', 98.79, 921987.78, 5781, 515, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto'),
    ('pip-rainha', 'High-frequency trading strategy.', 'High-frequency', 100.00, 917689.65, 1192, 515, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto'),
    ('BajoRiesgoMx', 'Lower-risk trading strategy.', 'Low risk', 93.52, 811540.01, 2166, 315, 'Low', 3, ARRAY['EUR-USD', 'XAU-USD'], 'london'),
    ('CondorMX', 'High-frequency trading strategy.', 'High-frequency', 32.73, 610913.50, 1103, 77, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto')
)
UPDATE traders AS existing
SET bio = requested.bio,
    specialty = requested.specialty,
    total_return = requested.total_return,
    monthly_return = requested.total_return,
    current_equity = requested.current_equity,
    followers = requested.followers,
    total_trades = requested.total_trades,
    risk_level = requested.risk_level,
    risk_score = requested.risk_score,
    asset_focus = requested.asset_focus,
    session_type = requested.session_type,
    is_active = true,
    updated_at = NOW()
FROM requested
WHERE LOWER(existing.name) = LOWER(requested.name);

WITH requested (
  name, bio, specialty, total_return, current_equity, followers, total_trades,
  risk_level, risk_score, asset_focus, session_type
) AS (
  VALUES
    ('Ingrid Martingale', 'High-frequency profit-generator strategy.', 'High-frequency, Profit-generator', 79.93, 826593.72, 2748, 4123, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto'),
    ('EmaGamTRAD', 'EmaGamTRAD is opening more trades than most lead traders.', 'High-frequency', 98.79, 921987.78, 5781, 515, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto'),
    ('pip-rainha', 'High-frequency trading strategy.', 'High-frequency', 100.00, 917689.65, 1192, 515, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto'),
    ('BajoRiesgoMx', 'Lower-risk trading strategy.', 'Low risk', 93.52, 811540.01, 2166, 315, 'Low', 3, ARRAY['EUR-USD', 'XAU-USD'], 'london'),
    ('CondorMX', 'High-frequency trading strategy.', 'High-frequency', 32.73, 610913.50, 1103, 77, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto')
)
INSERT INTO traders (
  name, bio, specialty, total_return, monthly_return, current_equity, followers,
  total_trades, risk_level, risk_score, asset_focus, session_type, is_active,
  session_start, session_end
)
SELECT name, bio, specialty, total_return, total_return, current_equity, followers,
       total_trades, risk_level, risk_score, asset_focus, session_type, true,
       CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days'
FROM requested
WHERE NOT EXISTS (
  SELECT 1 FROM traders existing WHERE LOWER(existing.name) = LOWER(requested.name)
);

SELECT name, specialty, total_return, current_equity, followers, total_trades
FROM traders
WHERE LOWER(name) IN (
  'ingrid martingale', 'emagamtrad', 'pip-rainha', 'bajoriesgomx', 'condormx'
)
ORDER BY total_return DESC, name ASC;