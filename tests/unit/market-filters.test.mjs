import assert from 'node:assert/strict';
import { mergeMarketFilters, DEFAULT_MARKET_FILTERS } from '../../api-handlers/app-config.js';

const stale = [
  { id: 'all', label: 'All' },
  { id: 'usa', label: 'USA' },
  { id: 'crypto', label: 'Crypto' },
];

const merged = mergeMarketFilters(stale);
assert.ok(merged.some((item) => item.id === 'forex'), 'Merged filters should include FX');
assert.ok(merged.some((item) => item.id === 'japan'), 'Merged filters should include Japan');
assert.ok(merged.some((item) => item.id === 'india'), 'Merged filters should include India');
assert.deepEqual(merged[0], DEFAULT_MARKET_FILTERS[0], 'All filter should remain first');
console.log('MARKET_FILTERS_TESTS_PASSED');
