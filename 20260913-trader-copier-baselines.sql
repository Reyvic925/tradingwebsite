-- Preserve realistic public trader popularity while tracking real copy-trading activity.
-- Run after the traders table exists. Safe to rerun.

ALTER TABLE traders
  ADD COLUMN IF NOT EXISTS synthetic_copiers_current INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS synthetic_copiers_all_time INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS synthetic_under_management NUMERIC NOT NULL DEFAULT 0;

-- Initialize public baselines from the existing roster popularity.
-- Existing real follow records are not included in these synthetic values.
UPDATE traders
SET synthetic_copiers_current = 201 + MOD(id * 37, 300),
    synthetic_copiers_all_time = 251 + MOD(id * 53, 350),
    synthetic_under_management = ROUND((201 + MOD(id * 37, 300)) * 1500, 2);

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
