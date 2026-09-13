-- Create a visible starter roster for copy trading.
-- Run after 20260820-fix-copy-trading-traders.sql.
-- Safe to rerun: traders are matched by name.

WITH seed (
  name, country, avatar_url, bio, specialty, asset_focus, session_type,
  total_return, daily_return, monthly_return, total_trades, win_rate_trades,
  max_drawdown, risk_score, risk_level, badge, followers, copiers_current,
  copiers_all_time, under_management
) AS (
  VALUES
    ('Sofia Alvarez', 'Spain', '/images/avatar-1.jpg', 'Systematic FX trader focused on disciplined entries and controlled downside.', 'FX and gold', ARRAY['EUR-USD', 'GBP-USD', 'XAU-USD'], 'london', 34.80, 0.72, 6.90, 684, 71.40, 11.20, 5, 'Medium', 'Gold', 48, 48, 72, 72000),
    ('Marcus Reed', 'United States', '/images/avatar-2.jpg', 'US equities specialist using momentum and earnings strength during New York hours.', 'US equities', ARRAY['AAPL', 'NVDA', 'TSLA', 'SPX500'], 'nyc', 48.60, 1.05, 8.40, 921, 68.90, 15.80, 6, 'Medium', 'Platinum', 76, 76, 118, 114000),
    ('Kenji Watanabe', 'Japan', '/images/avatar-3.jpg', 'Patient multi-asset trader combining crypto liquidity analysis with major currency pairs.', 'Crypto and FX', ARRAY['BTC-USD', 'ETH-USD', 'USD-JPY'], 'asia', 27.35, 0.41, 5.30, 512, 74.20, 8.60, 4, 'Low', 'Silver', 35, 35, 59, 52500),
    ('Priya Nair', 'India', '/images/avatar-4.jpg', 'Quantitative crypto trader using volatility bands and strict exposure limits.', 'Crypto quant', ARRAY['BTC-USD', 'ETH-USD', 'SOL-USD'], 'crypto', 62.40, 1.32, 10.20, 1186, 72.50, 19.10, 8, 'High', 'Diamond', 112, 112, 176, 224000),
    ('Liam Oconnell', 'Ireland', '/images/avatar-5.jpg', 'Conservative portfolio manager prioritizing steady returns and small position sizes.', 'Conservative FX', ARRAY['EUR-USD', 'GBP-USD', 'DAX40'], 'london', 19.75, 0.29, 3.80, 403, 79.60, 6.90, 3, 'Low', 'Silver', 29, 29, 44, 43500),
    ('Fatima Hassan', 'United Arab Emirates', '/images/avatar-6.jpg', 'Active commodities trader focused on gold and energy momentum across global sessions.', 'Commodities', ARRAY['XAU-USD', 'BRENT', 'WTI'], 'asia', 53.70, 1.10, 9.30, 902, 67.10, 18.30, 7, 'High', 'Platinum', 89, 89, 136, 178000)
)
INSERT INTO public.traders (
  name, country, avatar_url, bio, specialty, asset_focus, session_type,
  current_equity, total_return, daily_return, monthly_return, total_trades,
  win_rate_trades, max_drawdown, risk_score, risk_level, badge, followers,
  copiers_current, copiers_all_time, under_management, is_active,
  session_start, session_end
)
SELECT
  name, country, avatar_url, bio, specialty, asset_focus, session_type,
  100000, total_return, daily_return, monthly_return, total_trades,
  win_rate_trades, max_drawdown, risk_score, risk_level, badge, followers,
  copiers_current, copiers_all_time, under_management, true,
  CURRENT_DATE, CURRENT_DATE + 365
FROM seed
WHERE NOT EXISTS (
  SELECT 1 FROM public.traders existing WHERE LOWER(existing.name) = LOWER(seed.name)
);

UPDATE public.traders
SET is_active = COALESCE(is_active, true),
    asset_focus = COALESCE(asset_focus, ARRAY['BTC-USD', 'ETH-USD']),
    session_type = COALESCE(session_type, 'nyc'),
    updated_at = NOW()
WHERE is_active IS NULL
   OR asset_focus IS NULL
   OR session_type IS NULL;
