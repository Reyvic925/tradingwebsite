ALTER TABLE auth_email_tokens
  ADD COLUMN channel TEXT NOT NULL DEFAULT 'link' CHECK (channel IN ('link', 'code'));

CREATE TABLE IF NOT EXISTS auth_email_verification_limits (
  user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);