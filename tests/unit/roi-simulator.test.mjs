import assert from 'assert';
import { calculateRoiTick } from '../../api-handlers/cron-roi-simulator.js';

console.log('Testing ROI calculation logic...\n');

// Test 1: Basic ROI tick calculation
const investment1 = {
  id: 1,
  amount: 1000,
  current_value: 1000,
  start_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  end_date: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days from now
};

const tier1 = {
  percent_return: 350,
  duration_days: 7,
  volatility_min: 5,
  volatility_max: 10,
  roi_min: 15,
  roi_max: 22,
};

const tick1 = calculateRoiTick(investment1, tier1);
console.log('Test 1 (Basic tick):');
console.log(`  Initial value: $${investment1.current_value}`);
console.log(`  Fluctuation: $${tick1.fluctuation.toFixed(2)}`);
console.log(`  New value: $${tick1.newValue.toFixed(2)}`);
console.log(`  Days elapsed: ${tick1.daysElapsed}`);
console.log(`  Is completed: ${tick1.isCompleted}`);

assert(tick1.newValue > 0, 'Value should be positive');
assert(!tick1.isCompleted, 'Should not be completed yet');
assert(tick1.daysElapsed >= 0 && tick1.daysElapsed <= 7, 'Days should be in range');

// Test 2: ROI at maturity
const now = Date.now();
const investment2 = {
  id: 2,
  amount: 5000,
  current_value: 5150,
  start_date: new Date(now - 9.9 * 24 * 60 * 60 * 1000).toISOString(), // 9.9 days ago
  end_date: new Date(now + 0.1 * 24 * 60 * 60 * 1000).toISOString(), // 0.1 days from now (almost mature)
};

const tier2 = {
  percent_return: 450,
  duration_days: 10,
  volatility_min: 5,
  volatility_max: 10,
  roi_min: 15,
  roi_max: 22,
};

const tick2 = calculateRoiTick(investment2, tier2);
console.log('\nTest 2 (Near maturity):');
console.log(`  Initial value: $${investment2.current_value}`);
console.log(`  Fluctuation: $${tick2.fluctuation.toFixed(2)}`);
console.log(`  New value: $${tick2.newValue.toFixed(2)}`);
console.log(`  Days elapsed: ${tick2.daysElapsed}`);
console.log(`  Is completed: ${tick2.isCompleted}`);

assert(tick2.newValue > 0, 'Value should be positive');
assert(tick2.daysElapsed >= 9, 'Days should be close to duration');

// Test 3: Ensure value never goes negative
const investment3 = {
  id: 3,
  amount: 100,
  current_value: 10, // Unlikely but possible
  start_date: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
  end_date: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
};

const tier3 = {
  percent_return: 100,
  duration_days: 10,
  volatility_min: 10,
  volatility_max: 20,
  roi_min: 15,
  roi_max: 22,
};

for (let i = 0; i < 100; i++) {
  const tick = calculateRoiTick(investment3, tier3);
  assert(tick.newValue >= 0.01, `Value should never be negative or zero, got ${tick.newValue}`);
}

console.log('\nTest 3 (Negative value prevention):');
console.log('  ✓ Ran 100 iterations, value never went negative');

console.log('\n✓ ALL ROI TESTS PASSED');
