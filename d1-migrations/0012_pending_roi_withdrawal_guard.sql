CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_one_pending_roi_per_investment
  ON withdrawals(investment_id)
  WHERE type = 'roi' AND status = 'pending';