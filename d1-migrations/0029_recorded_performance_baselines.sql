ALTER TABLE traders ADD COLUMN recorded_starting_equity REAL;
ALTER TABLE traders ADD COLUMN performance_started_at TEXT;

INSERT OR IGNORE INTO trade_price_audit (entity,record_id,original_json,repair_json)
SELECT 'return_baseline',CAST(t.id AS TEXT),
  json_object('total_return',t.total_return,'monthly_return',t.monthly_return,'config',json(s.config)),
  json_object('basis','equity before the first recorded simulation tick')
FROM traders t JOIN copy_simulation_state s ON s.trader_id=t.id;

UPDATE traders
SET recorded_starting_equity = (
  SELECT round(json_extract(k.detail,'$.state.equity')/(1+k.change),2)
  FROM copy_simulation_ticks k WHERE k.trader_id=traders.id AND k.change>-1
  ORDER BY k.tick LIMIT 1
),
performance_started_at = (
  SELECT min(k.created_at) FROM copy_simulation_ticks k WHERE k.trader_id=traders.id
);

UPDATE copy_simulation_state
SET config=json_set(config,
  '$.startingEquity',(SELECT recorded_starting_equity FROM traders WHERE id=trader_id),
  '$.returnBasis','recorded_opening_equity',
  '$.minimumSignalBps',6,
  '$.dailyLossLimitPercent',1)
WHERE (SELECT recorded_starting_equity FROM traders WHERE id=trader_id)>0;

UPDATE traders
SET total_return=(current_equity/recorded_starting_equity-1)*100,
    monthly_return=0,
    updated_at=CURRENT_TIMESTAMP
WHERE recorded_starting_equity>0;
