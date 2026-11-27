-- Opt-in modelled win-rate policy for the nine highest-return active traders.
-- Preserves every existing config field and all simulation state/history; the
-- next copy-trading ticks derive new trades from these exit rules.
-- The barriers only trigger closes -- execution still uses fresh provider quotes.
UPDATE copy_simulation_state
SET config = json_set(
  config,
  '$.enforceTargetWinRate', json('true'),
  '$.targetWinRate', 0.9,
  '$.directionBias', 0.9,
  '$.takeProfitVolatilityRatio', 1.5,
  '$.stopLossVolatilityRatio', 6.0,
  '$.maxHoldingTicks', 96
)
WHERE trader_id IN (14, 19, 11, 5, 17, 16, 9, 13, 8);
