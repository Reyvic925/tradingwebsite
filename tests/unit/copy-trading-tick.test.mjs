import assert from 'assert';
import { calculateCopyFollowerValue } from '../../api-handlers/copy-trading-tick.js';

const conservativeGain = calculateCopyFollowerValue({
  currentValue: 1000,
  allocatedAmount: 1000,
  traderChange: 0.01,
  riskMultiplier: 0.5,
});
assert.equal(conservativeGain.currentValue, 1005);
assert.equal(conservativeGain.pnl, 5);

const aggressiveLoss = calculateCopyFollowerValue({
  currentValue: 1000,
  allocatedAmount: 1000,
  traderChange: -0.01,
  riskMultiplier: 2,
});
assert.equal(aggressiveLoss.currentValue, 980);
assert.equal(aggressiveLoss.pnl, -20);

const bounded = calculateCopyFollowerValue({
  currentValue: 1000,
  allocatedAmount: 1000,
  traderChange: 0.01,
  riskMultiplier: 100,
});
assert.equal(bounded.exposure, 5);
assert.equal(bounded.pnl, 50);

console.log('COPY TRADING RISK TICK OK');
