-- Preserve old display values before reconciling every profile to recorded copy accounts.
CREATE TABLE trader_copier_count_audit (
 trader_id INTEGER PRIMARY KEY REFERENCES traders(id) ON DELETE CASCADE,
 previous_followers INTEGER, previous_current INTEGER, previous_lifetime INTEGER,
 previous_under_management REAL, recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO trader_copier_count_audit(trader_id,previous_followers,previous_current,previous_lifetime,previous_under_management)
 SELECT id,followers,copiers_current,copiers_all_time,under_management FROM traders;
UPDATE traders SET
  copiers_current=(SELECT count(DISTINCT user_id) FROM copy_follows WHERE trader_id=traders.id AND status<>'stopped'),
  followers=(SELECT count(DISTINCT user_id) FROM copy_follows WHERE trader_id=traders.id AND status<>'stopped'),
  copiers_all_time=(SELECT count(DISTINCT user_id) FROM copy_follows WHERE trader_id=traders.id),
  under_management=coalesce((SELECT sum(current_value) FROM copy_follows WHERE trader_id=traders.id AND status<>'stopped'),0);
CREATE TRIGGER copy_counts_insert AFTER INSERT ON copy_follows BEGIN
UPDATE traders SET
  copiers_current=(SELECT count(DISTINCT user_id) FROM copy_follows WHERE trader_id=traders.id AND status<>'stopped'),
  followers=(SELECT count(DISTINCT user_id) FROM copy_follows WHERE trader_id=traders.id AND status<>'stopped'),
  copiers_all_time=(SELECT count(DISTINCT user_id) FROM copy_follows WHERE trader_id=traders.id),
  under_management=coalesce((SELECT sum(current_value) FROM copy_follows WHERE trader_id=traders.id AND status<>'stopped'),0) WHERE id IN (NEW.trader_id);
END;
CREATE TRIGGER copy_counts_delete AFTER DELETE ON copy_follows BEGIN
UPDATE traders SET
  copiers_current=(SELECT count(DISTINCT user_id) FROM copy_follows WHERE trader_id=traders.id AND status<>'stopped'),
  followers=(SELECT count(DISTINCT user_id) FROM copy_follows WHERE trader_id=traders.id AND status<>'stopped'),
  copiers_all_time=(SELECT count(DISTINCT user_id) FROM copy_follows WHERE trader_id=traders.id),
  under_management=coalesce((SELECT sum(current_value) FROM copy_follows WHERE trader_id=traders.id AND status<>'stopped'),0) WHERE id IN (OLD.trader_id);
END;
CREATE TRIGGER copy_counts_update AFTER UPDATE OF status,user_id,trader_id,current_value ON copy_follows BEGIN
UPDATE traders SET
  copiers_current=(SELECT count(DISTINCT user_id) FROM copy_follows WHERE trader_id=traders.id AND status<>'stopped'),
  followers=(SELECT count(DISTINCT user_id) FROM copy_follows WHERE trader_id=traders.id AND status<>'stopped'),
  copiers_all_time=(SELECT count(DISTINCT user_id) FROM copy_follows WHERE trader_id=traders.id),
  under_management=coalesce((SELECT sum(current_value) FROM copy_follows WHERE trader_id=traders.id AND status<>'stopped'),0) WHERE id IN (NEW.trader_id,OLD.trader_id);
END;
