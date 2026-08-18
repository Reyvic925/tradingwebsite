import assert from 'assert';
import { calculateInvestmentTick } from '../../api-handlers/investment-tick.js';

const tick = () => {
  const result = calculateInvestmentTick({
    amount: 1000,
    totalReturn: 12,
    durationDays: 30,
    previousEarned: 40,
    daysElapsed: 0.5,
    tickMinutes: 5,
    randomFn: () => 0.5,
  });

  assert.ok(result.earned >= 40, 'earned should never go backwards');
  assert.ok(result.earned <= 1000 * 0.12, 'earned should not exceed the plan total');
  assert.equal(result.status, 'active');
};

const finalPayout = () => {
  const result = calculateInvestmentTick({
    amount: 1000,
    totalReturn: 12,
    durationDays: 30,
    previousEarned: 110,
    daysElapsed: 29.999,
    tickMinutes: 5,
    randomFn: () => 0.5,
  });

  assert.equal(result.status, 'completed', 'final tick should mark the investment as completed');
  assert.equal(result.earned, 120, 'final payout should equal the plan total return');
};

tick();
finalPayout();
console.log('INVESTMENT TICK OK');
