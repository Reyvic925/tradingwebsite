WITH ranked_photos AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY avatar_url ORDER BY id) AS photo_rank
  FROM traders
  WHERE avatar_url IS NOT NULL
    AND TRIM(avatar_url) <> ''
)
UPDATE traders
SET avatar_url = '',
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT id FROM ranked_photos WHERE photo_rank > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_traders_unique_avatar
  ON traders(avatar_url)
  WHERE avatar_url IS NOT NULL AND TRIM(avatar_url) <> '';
