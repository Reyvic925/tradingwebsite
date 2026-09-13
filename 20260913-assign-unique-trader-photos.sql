-- Give every seeded trader a deterministic, unique photo URL.
-- Run after the 75-trader seed migration.
-- Admin-uploaded avatars are intentionally preserved.

UPDATE public.traders
SET avatar_url = 'https://i.pravatar.cc/300?u='
  || replace(lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')), '--', '-')
WHERE is_active = true
  AND (
    avatar_url IS NULL
    OR avatar_url = ''
    OR avatar_url LIKE '/images/avatar-%'
  );

NOTIFY pgrST, 'reload schema';
