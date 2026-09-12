import assert from 'assert';
import { sanitizeTraderRecord, normalizeAssetFocus, filterVisibleTraders } from '../../api-handlers/trader-validation.js';

const valid = sanitizeTraderRecord({
  name: 'Apex Traders',
  bio: 'Crypto trader focused on momentum across major digital assets',
  specialty: 'Crypto momentum',
  asset_focus: ['WTI', 'BRENT', 'XAU', 'WTI', '1'],
  total_return: 125.42,
  monthly_return: 18.3,
  win_rate_trades: 57,
  followers: 1200,
  is_active: true,
});

assert.equal(valid.total_return, 125.42);
assert.deepEqual(valid.asset_focus, ['WTI-USD', 'BRENT-USD', 'XAU-USD']);
assert.equal(valid.is_active, true);

const deduped = normalizeAssetFocus(['GBP', 'EUR', 'GBP', '1']);
assert.deepEqual(deduped, ['GBP-USD', 'EUR-USD']);

const extremeSynthetic = sanitizeTraderRecord({
  name: 'Extreme Synthetic',
  total_return: 5.97e23,
  asset_focus: ['BTC-USD'],
  is_active: true,
});
assert.equal(extremeSynthetic.total_return, 5.97e23);

const visible = filterVisibleTraders([
  { id: 1, name: 'Open', is_active: true, total_return: 25, followers: 100 },
  { id: 2, name: 'Closed', is_active: false, total_return: 50, followers: 999 },
]);
assert.equal(visible.length, 1);
assert.equal(visible[0].name, 'Open');

console.log('TRADER VALIDATION OK');
