-- Keep editable profile fields and their save timestamp available in production.
-- Run once in the Supabase SQL editor. Safe to rerun.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE profiles
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;
