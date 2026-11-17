import assert from 'node:assert/strict';
import { getDefaultPlans } from '../../api-handlers/plans.js';

const plans = getDefaultPlans();
assert.ok(Array.isArray(plans) && plans.length >= 4, 'Default plan list should include the standard four plans');
assert.equal(plans[0].min_amount, 200, 'Starter minimum should be $200');
assert.equal(plans[0].name, 'Starter', 'First plan should be Starter');
assert.equal(plans[0].duration_days, 6, 'Starter duration should be 6 days');
assert.equal(plans[0].total_return, 275, 'Starter total return should be 275%');
assert.deepEqual(plans.map((plan) => plan.duration_days), [6, 9, 14, 21], 'Plan durations should be 6, 9, 14, and 21 days respectively');
console.log('PLAN_SEED_TESTS_PASSED');
