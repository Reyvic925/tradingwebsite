CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_one_pending_per_user
  ON kyc_submissions(user_id)
  WHERE status = 'pending';