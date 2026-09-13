-- Give the 75-trader roster a differentiated 90-day performance profile.
-- Run after 20260913-seed-75-traders.sql and 20260913-enable-trader-cron.sql.

WITH calibrated AS (
  SELECT
    id,
    CASE
      WHEN id % 17 = 0 THEN -22 - (id % 9) * 3
      WHEN id % 13 = 0 THEN 280 + (id % 5) * 12
      WHEN id % 7 = 0 THEN 120 + (id % 6) * 8
      WHEN id % 5 = 0 THEN 50 + (id % 8) * 7
      ELSE ROUND((12 + ((id * 29) % 340) / 10.0)::numeric, 2)
    END AS target_return
  FROM public.traders
  WHERE is_active = true
)
UPDATE public.traders t
SET total_return = calibrated.target_return,
    avatar_url = CASE
      WHEN t.avatar_url IS NULL OR t.avatar_url = '' OR t.avatar_url LIKE '/images/avatar-%'
        THEN 'https://i.pravatar.cc/300?u='
          || replace(lower(regexp_replace(t.name, '[^a-zA-Z0-9]+', '-', 'g')), '--', '-')
      ELSE t.avatar_url
    END,
    updated_at = NOW()
FROM calibrated
WHERE t.id = calibrated.id;

UPDATE public.trader_simulation_state s
SET config = jsonb_set(
  COALESCE(s.config, '{}'::jsonb),
  '{targetReturnProfile}',
  to_jsonb(t.total_return),
  true
)
FROM public.traders t
WHERE t.id = s.trader_id
  AND t.is_active = true;

UPDATE public.trader_simulation_state
SET window_started_at = COALESCE(window_started_at, NOW())
WHERE window_started_at IS NULL;

NOTIFY pgrst, 'reload schema';
