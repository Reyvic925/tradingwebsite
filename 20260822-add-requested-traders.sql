DO $$ BEGIN
  RAISE NOTICE 'Skipped deprecated trader metric seed; use deterministic synthetic trader simulation migration instead.';
END $$;

/*

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
  name, bio, specialty, total_return, current_equity, total_trades,
  risk_level, risk_score, asset_focus, session_type
) AS (
  VALUES
    ('Ingrid Martingale', 'High-frequency profit-generator strategy.', 'High-frequency, Profit-generator', 79.93, 826593.72, 4123, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto'),
    ('EmaGamTRAD', 'EmaGamTRAD is opening more trades than most lead traders.', 'High-frequency', 98.79, 921987.78, 515, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto'),
    ('pip-rainha', 'High-frequency trading strategy.', 'High-frequency', 100.00, 917689.65, 515, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto'),
    ('BajoRiesgoMx', 'Lower-risk trading strategy.', 'Low risk', 93.52, 811540.01, 315, 'Low', 3, ARRAY['EUR-USD', 'XAU-USD'], 'london'),
    ('CondorMX', 'High-frequency trading strategy.', 'High-frequency', 32.73, 610913.50, 77, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto')
)
UPDATE traders AS existing
SET bio = requested.bio,
    specialty = requested.specialty,
    total_return = requested.total_return,
    monthly_return = requested.total_return,
    current_equity = requested.current_equity,
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
  name, bio, specialty, total_return, current_equity, total_trades,
  risk_level, risk_score, asset_focus, session_type
) AS (
  VALUES
    ('Ingrid Martingale', 'High-frequency profit-generator strategy.', 'High-frequency, Profit-generator', 79.93, 826593.72, 4123, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto'),
    ('EmaGamTRAD', 'EmaGamTRAD is opening more trades than most lead traders.', 'High-frequency', 98.79, 921987.78, 515, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto'),
    ('pip-rainha', 'High-frequency trading strategy.', 'High-frequency', 100.00, 917689.65, 515, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto'),
    ('BajoRiesgoMx', 'Lower-risk trading strategy.', 'Low risk', 93.52, 811540.01, 315, 'Low', 3, ARRAY['EUR-USD', 'XAU-USD'], 'london'),
    ('CondorMX', 'High-frequency trading strategy.', 'High-frequency', 32.73, 610913.50, 77, 'High', 8, ARRAY['BTC-USD', 'ETH-USD'], 'crypto')
)
INSERT INTO traders (
  name, bio, specialty, total_return, monthly_return, current_equity,
  total_trades, risk_level, risk_score, asset_focus, session_type, is_active,
  session_start, session_end
)
SELECT name, bio, specialty, total_return, total_return, current_equity,
       total_trades, risk_level, risk_score, asset_focus, session_type, true,
       CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days'
FROM requested
WHERE NOT EXISTS (
  SELECT 1 FROM traders existing WHERE LOWER(existing.name) = LOWER(requested.name)
);

UPDATE traders
SET session_type = CASE WHEN id % 2 = 0 THEN 'tokyo' ELSE 'sydney' END,
    updated_at = NOW()
WHERE session_type = 'asia';

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

UPDATE traders
SET badge = CASE
      WHEN total_return >= 78 THEN 'Diamond'
      WHEN total_return >= 65 THEN 'Platinum'
      WHEN total_return >= 50 THEN 'Gold'
      ELSE 'Silver'
    END,
    profit_sharing_fee = 20
WHERE is_active = true;

UPDATE traders
SET badge = 'Diamond',
    current_equity = 32198.00,
    total_return = 67.98,
    win_rate_trades = 90.36,
    profit_sharing_fee = 25,
    total_trades = 2127,
    updated_at = NOW()
WHERE LOWER(name) = 'ingrid martingale';

UPDATE traders
SET avatar_url = CASE LOWER(name)
      WHEN 'helena costa' THEN '/images/avatar-1.jpg'
      WHEN 'irene garcia' THEN '/images/avatar-2.jpg'
      WHEN 'arjun mehta' THEN '/images/avatar-3.jpg'
      WHEN 'mina park' THEN '/images/avatar-4.jpg'
      WHEN 'emagamtrad' THEN '/images/avatar-5.jpg'
      WHEN 'pip-rainha' THEN '/images/avatar-6.jpg'
      WHEN 'laura costa' THEN '/images/avatar-7.jpg'
      WHEN 'jamal williams' THEN '/images/avatar-8.jpg'
      WHEN 'lena fischer' THEN '/images/avatar-1.jpg'
      WHEN 'diego fernandez' THEN '/images/avatar-2.jpg'
      WHEN 'maximilian bauer' THEN '/images/avatar-3.jpg'
      WHEN 'adrian king' THEN '/images/avatar-4.jpg'
      WHEN 'marek kowalski' THEN '/images/avatar-5.jpg'
      WHEN 'aya nakamura' THEN '/images/avatar-6.jpg'
      WHEN 'mariam el-sayed' THEN '/images/avatar-7.jpg'
      WHEN 'bajor iesgomx' THEN '/images/avatar-8.jpg'
      WHEN 'bajoriesgomx' THEN '/images/avatar-8.jpg'
      WHEN 'nikolai volkov' THEN '/images/avatar-1.jpg'
      WHEN 'ingrid martingale' THEN '/images/avatar-2.jpg'
      WHEN 'condormx' THEN '/images/avatar-3.jpg'
      ELSE avatar_url
    END,
    updated_at = NOW()
WHERE LOWER(name) IN (
  'helena costa', 'irene garcia', 'arjun mehta', 'mina park', 'emagamtrad',
  'pip-rainha', 'laura costa', 'jamal williams', 'lena fischer', 'diego fernandez',
  'maximilian bauer', 'adrian king', 'marek kowalski', 'aya nakamura',
  'mariam el-sayed', 'bajoriesgomx', 'nikolai volkov', 'ingrid martingale', 'condormx'
)
OR LOWER(name) LIKE '%condor%';

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
*/