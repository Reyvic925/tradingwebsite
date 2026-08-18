import assert from 'node:assert/strict';
import { calculateInvestmentROI } from '../../api-handlers/portfolio.js';

const fallbackValue = calculateInvestmentROI({ amount: 200, current_value: null, earned: 91.67 }, [{ type: 'gain', amount: 91.67 }]);
assert.equal(Number(fallbackValue), 91.67, 'ROI should use earned value when current_value is missing');

const zeroCurrent = calculateInvestmentROI({ amount: 200, current_value: 200, earned: 0 }, []);
assert.equal(Number(zeroCurrent), 0, 'ROI should be zero when the current value matches principal');

console.log('Derived ROI regression checks passed');
