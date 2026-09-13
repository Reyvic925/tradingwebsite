-- Preserve realistic public trader popularity while tracking real copy-trading activity.
-- Run after the traders table exists. Safe to rerun.

ALTER TABLE traders
  ADD COLUMN IF NOT EXISTS synthetic_copiers_current INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS synthetic_copiers_all_time INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS synthetic_under_management NUMERIC NOT NULL DEFAULT 0;

-- Initialize missing public baselines from the existing roster popularity.
-- Existing real follow records are not included in these synthetic values.
UPDATE traders
SET synthetic_copiers_current = CASE
      WHEN COALESCE(followers, 0) > 0 THEN GREATEST(12, ROUND(followers * 0.12)::INTEGER)
      ELSE 12
    END,
    synthetic_copiers_all_time = CASE
      WHEN COALESCE(followers, 0) > 0 THEN GREATEST(18, ROUND(followers * 0.16)::INTEGER)
      ELSE 18
    END,
    synthetic_under_management = CASE
      WHEN COALESCE(followers, 0) > 0 THEN ROUND(GREATEST(12, ROUND(followers * 0.12)::INTEGER) * 1500, 2)
      ELSE 18000
    END
WHERE COALESCE(synthetic_copiers_current, 0) = 0
  AND COALESCE(synthetic_copiers_all_time, 0) = 0;

UPDATE traders
SET synthetic_copiers_all_time = GREATEST(synthetic_copiers_all_time, synthetic_copiers_current),
    copiers_current = synthetic_copiers_current + COALESCE((
      SELECT COUNT(*)
      FROM user_follows
      WHERE user_follows.trader_id = traders.id
        AND user_follows.is_copying = true
    ), 0),
    copiers_all_time = synthetic_copiers_all_time + COALESCE((
      SELECT COUNT(DISTINCT user_id)
      FROM user_follows
      WHERE user_follows.trader_id = traders.id
    ), 0),
    followers = synthetic_copiers_current + COALESCE((
      SELECT COUNT(*)
      FROM user_follows
      WHERE user_follows.trader_id = traders.id
        AND user_follows.is_copying = true
    ), 0),
    under_management = synthetic_under_management + COALESCE((
      SELECT SUM(COALESCE(current_value, allocated_amount, 0))
      FROM user_follows
      WHERE user_follows.trader_id = traders.id
        AND user_follows.is_copying = true
    ), 0);
