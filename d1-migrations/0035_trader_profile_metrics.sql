ALTER TABLE traders ADD COLUMN profile_metrics TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(profile_metrics) AND json_type(profile_metrics) = 'object');
ALTER TABLE traders ADD COLUMN profile_metrics_updated_at TEXT;

CREATE TABLE trader_profile_metric_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trader_id INTEGER NOT NULL REFERENCES traders(id),
  previous_values TEXT NOT NULL,
  reported_values TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trader_profile_metrics_updated
AFTER UPDATE OF profile_metrics ON traders
WHEN OLD.profile_metrics <> NEW.profile_metrics
BEGIN
  INSERT INTO trader_profile_metric_audit (trader_id, previous_values, reported_values)
  VALUES (NEW.id, OLD.profile_metrics, NEW.profile_metrics);
  UPDATE traders SET profile_metrics_updated_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER trader_profile_metrics_created
AFTER INSERT ON traders
WHEN NEW.profile_metrics <> '{}'
BEGIN
  INSERT INTO trader_profile_metric_audit (trader_id, previous_values, reported_values)
  VALUES (NEW.id, '{}', NEW.profile_metrics);
  UPDATE traders SET profile_metrics_updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
