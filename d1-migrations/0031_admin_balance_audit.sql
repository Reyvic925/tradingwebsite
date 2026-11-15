CREATE TABLE admin_balance_adjustments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id),
  actor_id TEXT NOT NULL REFERENCES auth_users(id),
  amount REAL NOT NULL CHECK(amount <> 0),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX admin_balance_adjustments_user ON admin_balance_adjustments(user_id,created_at);
CREATE TRIGGER admin_balance_check BEFORE INSERT ON admin_balance_adjustments
WHEN NOT EXISTS(SELECT 1 FROM admin_balance_adjustments WHERE id=NEW.id)
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM wallets WHERE user_id=NEW.user_id AND currency='USD' AND available+NEW.amount>=0)
    THEN RAISE(ABORT,'Insufficient available balance') END;
END;
CREATE TRIGGER admin_balance_apply AFTER INSERT ON admin_balance_adjustments BEGIN
  UPDATE wallets SET available=round(available+NEW.amount,2) WHERE user_id=NEW.user_id AND currency='USD';
  INSERT INTO transactions(user_id,type,amount,currency,method,status,reference)
    VALUES(NEW.user_id,'balance_adjustment',NEW.amount,'USD','account_adjustment','completed',NEW.id);
END;
