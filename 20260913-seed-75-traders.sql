-- Expand the starter roster to 75 distinct active traders.
-- Run after 20260913-seed-active-traders.sql.
-- Safe to rerun: existing traders are matched by case-insensitive name.

WITH roster(name, country, specialty, asset_focus, session_type) AS (
  VALUES
    ('Amara Okafor', 'Nigeria', 'Macro commodities', ARRAY['XAU-USD', 'WTI', 'USD-JPY'], 'london'),
    ('Daniel Silva', 'Brazil', 'Index breakouts', ARRAY['NASDAQ', 'SPX500', 'USD-BRL'], 'nyc'),
    ('Elena Petrova', 'Bulgaria', 'Technical FX', ARRAY['GBP-USD', 'EUR-USD', 'GBP-JPY'], 'london'),
    ('Noah Williams', 'Canada', 'Balanced assets', ARRAY['MSFT', 'AMZN', 'XAU-USD'], 'nyc'),
    ('Ethan Brooks', 'Australia', 'Digital assets', ARRAY['BTC-USD', 'ETH-USD', 'AVAX-USD'], 'crypto'),
    ('Maya Thompson', 'United Kingdom', 'European markets', ARRAY['GBP-USD', 'EUR-USD', 'DAX40'], 'london'),
    ('Victor Mensah', 'Ghana', 'Momentum day trading', ARRAY['BTC-USD', 'ETH-USD', 'XAU-USD'], 'nyc'),
    ('Lucas Martin', 'France', 'Major FX pairs', ARRAY['EUR-USD', 'USD-CHF', 'CAC40'], 'london'),
    ('Aisha Williams', 'South Africa', 'Global momentum', ARRAY['BTC-USD', 'NASDAQ', 'USD-JPY'], 'crypto'),
    ('James Carter', 'United States', 'Technology momentum', ARRAY['AAPL', 'MSFT', 'NASDAQ'], 'nyc'),
    ('Isabella Rossi', 'Italy', 'European FX', ARRAY['EUR-USD', 'GBP-USD', 'DAX40'], 'london'),
    ('Oliver Schmidt', 'Germany', 'Index breakouts', ARRAY['DAX40', 'CAC40', 'EUR-USD'], 'london'),
    ('Layla Hassan', 'Egypt', 'Yen crosses', ARRAY['USD-JPY', 'GBP-JPY', 'XAU-USD'], 'asia'),
    ('Mateo Garcia', 'Mexico', 'Latin American FX', ARRAY['USD-MXN', 'SPX500', 'BTC-USD'], 'nyc'),
    ('Sakura Mori', 'Japan', 'Asia range trading', ARRAY['USD-JPY', 'BTC-USD', 'NIKKEI'], 'asia'),
    ('Ravi Krishnan', 'India', 'Systematic crypto', ARRAY['BTC-USD', 'ETH-USD', 'SOL-USD'], 'crypto'),
    ('Aoife Brennan', 'Ireland', 'Low-volatility FX', ARRAY['EUR-USD', 'GBP-USD', 'DAX40'], 'london'),
    ('Nikolai Volkov', 'Russia', 'Energy momentum', ARRAY['WTI', 'BRENT', 'USD-JPY'], 'london'),
    ('Zainab Bello', 'Nigeria', 'Gold and FX', ARRAY['XAU-USD', 'EUR-USD', 'GBP-USD'], 'london'),
    ('Hugo Laurent', 'France', 'European indices', ARRAY['CAC40', 'DAX40', 'EUR-USD'], 'london'),
    ('Mei Lin Chen', 'Singapore', 'Multi-asset swing', ARRAY['BTC-USD', 'USD-JPY', 'SPX500'], 'asia'),
    ('Joon Ho Park', 'South Korea', 'Semiconductor momentum', ARRAY['NVDA', 'TSM', 'NASDAQ'], 'asia'),
    ('Camila Duarte', 'Colombia', 'Emerging-market FX', ARRAY['USD-COP', 'XAU-USD', 'SPX500'], 'nyc'),
    ('Thomas van Dijk', 'Netherlands', 'European trend following', ARRAY['DAX40', 'EUR-USD', 'ASML'], 'london'),
    ('Freja Nielsen', 'Denmark', 'Nordic macro', ARRAY['EUR-USD', 'DAX40', 'XAU-USD'], 'london'),
    ('Luka Kovac', 'Croatia', 'Breakout futures', ARRAY['SPX500', 'NASDAQ', 'WTI'], 'nyc'),
    ('Noura Al Mansouri', 'United Arab Emirates', 'Commodities swing', ARRAY['XAU-USD', 'BRENT', 'USD-JPY'], 'asia'),
    ('Marek Kowalski', 'Poland', 'Disciplined FX', ARRAY['EUR-USD', 'GBP-USD', 'USD-CHF'], 'london'),
    ('Yara Haddad', 'Lebanon', 'Volatility strategies', ARRAY['BTC-USD', 'XAU-USD', 'NASDAQ'], 'nyc'),
    ('Diego Fernandez', 'Spain', 'Iberian momentum', ARRAY['EUR-USD', 'IBEX35', 'BTC-USD'], 'london'),
    ('Clara Moreau', 'Belgium', 'Eurozone macro', ARRAY['EUR-USD', 'DAX40', 'CAC40'], 'london'),
    ('Henrik Larsen', 'Norway', 'Energy and indices', ARRAY['BRENT', 'WTI', 'SPX500'], 'london'),
    ('Mariam El-Sayed', 'Egypt', 'Conservative gold', ARRAY['XAU-USD', 'USD-JPY', 'EUR-USD'], 'asia'),
    ('Thiago Almeida', 'Brazil', 'Crypto momentum', ARRAY['BTC-USD', 'ETH-USD', 'SOL-USD'], 'nyc'),
    ('Anika Shah', 'India', 'Quantitative equities', ARRAY['NIFTY50', 'NASDAQ', 'AAPL'], 'asia'),
    ('Callum Fraser', 'United Kingdom', 'London scalping', ARRAY['GBP-USD', 'EUR-USD', 'FTSE100'], 'london'),
    ('Sofia Marin', 'Romania', 'Eastern European FX', ARRAY['EUR-USD', 'USD-JPY', 'XAU-USD'], 'london'),
    ('Andrej Novak', 'Slovakia', 'Measured index trading', ARRAY['DAX40', 'CAC40', 'SPX500'], 'london'),
    ('Lucia Bianchi', 'Italy', 'Event-driven equities', ARRAY['AAPL', 'TSLA', 'SPX500'], 'nyc'),
    ('Kofi Asante', 'Ghana', 'Gold trend following', ARRAY['XAU-USD', 'BTC-USD', 'USD-JPY'], 'london'),
    ('Mina Park', 'South Korea', 'Asia crypto rotation', ARRAY['BTC-USD', 'ETH-USD', 'SOL-USD'], 'asia'),
    ('Tomasz Zielinski', 'Poland', 'Statistical arbitrage', ARRAY['EUR-USD', 'DAX40', 'NASDAQ'], 'london'),
    ('Ari Cohen', 'Israel', 'Technology swing trading', ARRAY['NASDAQ', 'NVDA', 'TSLA'], 'nyc'),
    ('Nadine Weber', 'Switzerland', 'Capital preservation', ARRAY['EUR-USD', 'XAU-USD', 'USD-CHF'], 'london'),
    ('Rafael Costa', 'Portugal', 'Atlantic session momentum', ARRAY['EUR-USD', 'BTC-USD', 'SPX500'], 'london'),
    ('Lena Fischer', 'Germany', 'Systematic DAX trading', ARRAY['DAX40', 'EUR-USD', 'SAP'], 'london'),
    ('Amina Yusuf', 'Kenya', 'Emerging-market momentum', ARRAY['XAU-USD', 'USD-JPY', 'NASDAQ'], 'nyc'),
    ('Bastien Girard', 'France', 'Short-term indices', ARRAY['CAC40', 'DAX40', 'NASDAQ'], 'london'),
    ('Hana Suzuki', 'Japan', 'Volatility breakout', ARRAY['NIKKEI', 'USD-JPY', 'BTC-USD'], 'asia'),
    ('Mikkel Sørensen', 'Denmark', 'Steady multi-asset', ARRAY['EUR-USD', 'XAU-USD', 'SPX500'], 'london'),
    ('Nia Robinson', 'United States', 'US growth equities', ARRAY['AAPL', 'MSFT', 'NVDA'], 'nyc'),
    ('Arjun Mehta', 'India', 'Crypto trend systems', ARRAY['BTC-USD', 'ETH-USD', 'AVAX-USD'], 'crypto'),
    ('Helena Costa', 'Portugal', 'European swing trading', ARRAY['EUR-USD', 'DAX40', 'XAU-USD'], 'london'),
    ('Irene Garcia', 'Spain', 'FX reversal specialist', ARRAY['EUR-USD', 'GBP-USD', 'GBP-JPY'], 'london'),
    ('Adrian King', 'United States', 'US index momentum', ARRAY['SPX500', 'NASDAQ', 'TSLA'], 'nyc'),
    ('Mariam Diallo', 'Senegal', 'West African macro', ARRAY['XAU-USD', 'WTI', 'EUR-USD'], 'london'),
    ('Yuki Tanaka', 'Japan', 'Precision yen trading', ARRAY['USD-JPY', 'GBP-JPY', 'NIKKEI'], 'asia'),
    ('Emilia Novak', 'Czech Republic', 'European quantitative FX', ARRAY['EUR-USD', 'DAX40', 'USD-CHF'], 'london'),
    ('Samuel Okoro', 'Nigeria', 'High-conviction indices', ARRAY['NASDAQ', 'SPX500', 'XAU-USD'], 'nyc'),
    ('Leila Benali', 'Morocco', 'North African commodities', ARRAY['XAU-USD', 'BRENT', 'EUR-USD'], 'london'),
    ('George Papadopoulos', 'Greece', 'Mediterranean FX', ARRAY['EUR-USD', 'XAU-USD', 'DAX40'], 'london'),
    ('Valentina Cruz', 'Chile', 'Copper and FX', ARRAY['XCU-USD', 'USD-CLP', 'SPX500'], 'nyc'),
    ('Elias Berg', 'Sweden', 'Scandinavian trend trading', ARRAY['EUR-USD', 'DAX40', 'NASDAQ'], 'london'),
    ('Nadia Petrescu', 'Romania', 'Risk-aware swing trading', ARRAY['EUR-USD', 'XAU-USD', 'BTC-USD'], 'london'),
    ('Kwame Boateng', 'Ghana', 'Crypto and commodities', ARRAY['BTC-USD', 'XAU-USD', 'WTI'], 'crypto'),
    ('Sienna Hart', 'Australia', 'US session equities', ARRAY['AAPL', 'NVDA', 'SPX500'], 'nyc'),
    ('Omar Rahman', 'Bangladesh', 'Asia momentum', ARRAY['USD-JPY', 'BTC-USD', 'NASDAQ'], 'asia'),
    ('Elif Demir', 'Turkey', 'Currency breakout systems', ARRAY['EUR-USD', 'USD-JPY', 'XAU-USD'], 'london'),
    ('Bruno Mendes', 'Brazil', 'Index and crypto rotation', ARRAY['SPX500', 'BTC-USD', 'ETH-USD'], 'nyc')
),
numbered AS (
  SELECT
    row_number() OVER (ORDER BY name) AS n,
    roster.*
  FROM roster
),
prepared AS (
  SELECT
    *,
    CASE
      WHEN n % 17 = 0 THEN -22 - (n % 9) * 3
      WHEN n % 13 = 0 THEN 280 + (n % 5) * 12
      WHEN n % 7 = 0 THEN 120 + (n % 6) * 8
      WHEN n % 5 = 0 THEN 50 + (n % 8) * 7
      ELSE ROUND((12 + ((n * 29) % 340) / 10.0)::numeric, 2)
    END AS trader_return,
    0.25 + ((n * 13) % 120) / 100.0 AS trader_daily,
    280 + ((n * 83) % 1100) AS trader_trades,
    61 + ((n * 7) % 190) / 10.0 AS trader_win_rate,
    5 + ((n * 11) % 130) / 10.0 AS trader_drawdown,
    3 + (n % 7) AS trader_risk,
    18 + ((n * 23) % 155) AS trader_copiers
  FROM numbered
)
INSERT INTO public.traders (
  name, country, avatar_url, bio, specialty, asset_focus, session_type,
  current_equity, total_return, daily_return, monthly_return, total_trades,
  win_rate_trades, max_drawdown, risk_score, risk_level, badge, followers,
  copiers_current, copiers_all_time, under_management,
  synthetic_copiers_current, synthetic_copiers_all_time, synthetic_under_management,
  is_active, session_start, session_end
)
SELECT
  name,
  country,
  '/images/avatar-' || ((n - 1) % 8 + 1) || '.jpg',
  specialty || ' strategy managed with defined position sizing and transparent risk controls.',
  specialty,
  asset_focus,
  session_type,
  100000,
  trader_return,
  trader_daily,
  ROUND((trader_return / 5.0)::numeric, 2),
  trader_trades,
  trader_win_rate,
  trader_drawdown,
  trader_risk,
  CASE WHEN trader_risk <= 4 THEN 'Low' WHEN trader_risk <= 7 THEN 'Medium' ELSE 'High' END,
  CASE WHEN trader_return >= 50 THEN 'Platinum' WHEN trader_return >= 35 THEN 'Gold' ELSE 'Silver' END,
  trader_copiers,
  trader_copiers,
  trader_copiers + 25 + (n % 80),
  trader_copiers * 1500,
  trader_copiers,
  trader_copiers + 25 + (n % 80),
  trader_copiers * 1500,
  true,
  CURRENT_DATE,
  CURRENT_DATE + 365
FROM prepared
WHERE NOT EXISTS (
  SELECT 1
  FROM public.traders existing
  WHERE LOWER(existing.name) = LOWER(prepared.name)
);

SELECT COUNT(*) AS active_trader_count
FROM public.traders
WHERE is_active = true;
