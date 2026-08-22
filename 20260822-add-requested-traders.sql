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
  ADD COLUMN IF NOT EXISTS badge TEXT DEFAULT 'Gold',
  ADD COLUMN IF NOT EXISTS profit_for_copiers NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_sharing_fee NUMERIC DEFAULT 20,
  ADD COLUMN IF NOT EXISTS copiers_current INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS copiers_all_time INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS under_management NUMERIC DEFAULT 0,
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

-- Keep displayed demo performance plausible for established traders and consistent with the $10,000 starting balance.
UPDATE traders
SET total_return = ROUND(GREATEST(35, LEAST(85, (COALESCE(total_return, 0) * 0.8) + 35))::numeric, 2),
    monthly_return = ROUND((GREATEST(35, LEAST(85, (COALESCE(total_return, 0) * 0.8) + 35)) / 6)::numeric, 2),
    current_equity = ROUND((10000 * (1 + GREATEST(35, LEAST(85, (COALESCE(total_return, 0) * 0.8) + 35)) / 100))::numeric, 2),
    risk_score = GREATEST(
      1,
      LEAST(
        10,
        ROUND(2 + (GREATEST(35, LEAST(85, (COALESCE(total_return, 0) * 0.8) + 35)) / 20) + (COALESCE(max_drawdown, 0) / 20))::integer
      )
    ),
    updated_at = NOW()
WHERE is_active = true;

-- Add varied copier and fee metrics for every active trader.
UPDATE traders
SET badge = CASE
      WHEN total_return >= 78 THEN 'Diamond'
      WHEN total_return >= 65 THEN 'Platinum'
      WHEN total_return >= 50 THEN 'Gold'
      ELSE 'Silver'
    END,
    profit_for_copiers = ROUND((GREATEST(current_equity - 10000, 0) * (0.35 + ((id % 7) * 0.04)))::numeric, 2),
    profit_sharing_fee = 15 + (id % 4) * 5,
    copiers_current = GREATEST(COALESCE(followers, 0), 250 + ((id * 137) % 2400)),
    copiers_all_time = GREATEST(COALESCE(followers, 0), 250 + ((id * 137) % 2400)) + 300 + ((id * 83) % 1800),
    under_management = ROUND((GREATEST(COALESCE(followers, 0), 250 + ((id * 137) % 2400)) * (42.5 + ((id % 9) * 17.5)))::numeric, 2)
WHERE is_active = true;

  -- Make copier figures internally consistent: profit is earned on managed copier capital.
  -- Every active trader receives a positive, varied copier return for the demo roster.
  UPDATE traders
  SET copiers_current = GREATEST(COALESCE(copiers_current, followers, 0), 250),
    copiers_all_time = GREATEST(COALESCE(copiers_all_time, 0), COALESCE(copiers_current, followers, 0) + 300),
    under_management = ROUND((GREATEST(COALESCE(copiers_current, followers, 0), 250) * (75 + ((id % 12) * 25)))::numeric, 2),
    profit_for_copiers = ROUND((GREATEST(COALESCE(copiers_current, followers, 0), 250) * (75 + ((id % 12) * 25)) * (GREATEST(total_return, 35) / 100) * (0.45 + ((id % 5) * 0.05)))::numeric, 2),
    updated_at = NOW()
  WHERE is_active = true;

-- Preserve the supplied reference metrics for Ingrid's profile.
UPDATE traders
SET badge = 'Diamond',
    current_equity = 32198.00,
    total_return = 67.98,
    win_rate_trades = 90.36,
    followers = 842,
    copiers_current = 842,
    copiers_all_time = 4123,
    profit_for_copiers = 882651.54,
    profit_sharing_fee = 25,
    under_management = 66739.90,
    total_trades = 2127,
    updated_at = NOW()
WHERE LOWER(name) = 'ingrid martingale';

SELECT name, badge, total_return, current_equity, win_rate_trades,
       profit_for_copiers, profit_sharing_fee, copiers_current,
       copiers_all_time, under_management, total_trades, risk_score
FROM traders
WHERE LOWER(name) IN (
  'ingrid martingale', 'emagamtrad', 'pip-rainha', 'bajoriesgomx', 'condormx'
)
ORDER BY total_return DESC, name ASC;

SELECT
  COUNT(*) AS active_traders,
  COUNT(*) FILTER (WHERE profit_for_copiers > 0) AS profitable_traders,
  COUNT(*) FILTER (WHERE profit_for_copiers > 0) > 50 AS more_than_50_profitable,
  ROUND(AVG(profit_for_copiers)::numeric, 2) AS average_copier_profit,
  ROUND(SUM(under_management)::numeric, 2) AS total_assets_under_management
FROM traders
WHERE is_active = true;