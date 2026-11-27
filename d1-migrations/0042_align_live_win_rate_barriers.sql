-- Align the live quote-backed exit barriers with the modelled history for the
-- same nine traders. The barriers are close triggers only; execution continues
-- at the fresh provider quote so audit provenance is unchanged.
UPDATE copy_simulation_state
SET config = json_set(
  config,
  '$.enforceTargetWinRate', json('true'),
  '$.targetWinRate', 0.9,
  '$.directionBias', 0.99,
  '$.takeProfitVolatilityRatio', 0.3,
  '$.stopLossVolatilityRatio', 2.7,
  '$.maxHoldingTicks', 96
)
WHERE trader_id IN (14, 19, 11, 5, 17, 16, 9, 13, 8);
