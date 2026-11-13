ALTER TABLE investments ADD COLUMN roi_last_tick INTEGER NOT NULL DEFAULT 0;

CREATE TABLE investment_roi_ticks (
  investment_id INTEGER NOT NULL REFERENCES investments(id),
  tick INTEGER NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  earned_before REAL NOT NULL,
  earned_after REAL NOT NULL,
  value_after REAL NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (investment_id, tick)
);

CREATE TABLE IF NOT EXISTS cron_job_state (
  job TEXT PRIMARY KEY CHECK (job IN ('copy-trading','roi')),
  lock_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_started_at TEXT,
  last_finished_at TEXT,
  last_status TEXT,
  last_result TEXT
);

-- Production may already have the earlier lease table. Preserve its state.
ALTER TABLE cron_job_state ADD COLUMN last_tick INTEGER NOT NULL DEFAULT 0;
