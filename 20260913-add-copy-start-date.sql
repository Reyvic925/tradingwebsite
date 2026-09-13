-- Add the copy start timestamp required by copy-trading creation.
-- Safe to rerun on the production database.

ALTER TABLE IF EXISTS public.user_follows
  ADD COLUMN IF NOT EXISTS copy_start_date TIMESTAMPTZ DEFAULT NOW();

UPDATE public.user_follows
SET copy_start_date = COALESCE(copy_start_date, followed_at, NOW())
WHERE copy_start_date IS NULL;

NOTIFY pgrST, 'reload schema';
