import assert from 'assert';
import { sanitizeTraderRecord, normalizeAssetFocus, filterVisibleTraders } from '../../api-handlers/trader-validation.js';

const clamped = sanitizeTraderRecord({
  name: 'Apex Traders',
  bio: 'Crypto trader focused on momentum across major digital assets',
  specialty: 'Crypto momentum',
  asset_focus: ['WTI', 'BRENT', 'XAU', 'WTI', '1'],
  total_return: 4_243_563_898_644.52,
  monthly_return: 5000,
  win_rate_trades: 57,
  followers: 1200,
  is_active: true,
});

assert.equal(clamped.total_return, 250);
assert.deepEqual(clamped.asset_focus, ['BTC-USD', 'ETH-USD', 'SOL-USD']);
assert.equal(clamped.is_active, true);

const deduped = normalizeAssetFocus(['GBP', 'EUR', 'GBP', '1']);
assert.deepEqual(deduped, ['GBP-USD', 'EUR-USD']);

const visible = filterVisibleTraders([
  { id: 1, name: 'Open', is_active: true, total_return: 25, followers: 100 },
  { id: 2, name: 'Closed', is_active: false, total_return: 50, followers: 999 },
]);
assert.equal(visible.length, 1);
assert.equal(visible[0].name, 'Open');

console.log('TRADER VALIDATION OK');
