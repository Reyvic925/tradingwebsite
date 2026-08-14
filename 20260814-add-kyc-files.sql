-- Migration: Add kyc_files table for uploaded identity document images
-- README: How to run this migration
--  - Use the Supabase SQL editor (https://app.supabase.com) and paste the SQL, or run locally with psql:
--      psql "postgresql://<user>:<pass>@<host>:<port>/<db>" -f 20260814-add-kyc-files.sql
--  - No special environment variables are required for the SQL file itself beyond a working DB connection.
--  - This migration is safe to re-run (uses CREATE ... IF NOT EXISTS).

-- kyc_files: raw image bytes (base64) uploaded during the KYC wizard.
-- Files are only ever served through /api/kyc-upload which enforces
-- owner-or-admin access, so keep this table private (no public grants).
CREATE TABLE IF NOT EXISTS kyc_files (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  kind text NOT NULL, -- document_front | document_back
  mime text NOT NULL, -- image/jpeg | image/png | image/webp
  size integer,
  filename text,
  data_base64 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyc_files_user ON kyc_files (user_id);

-- End of migration
