/* Mock seed runner — exercises ensureUniverse logic in-memory where possible.
   Usage: node scripts/mock_seed.js
   Note: This mock does not write to DB; it loads universe data and reports missing symbols compared to a small in-memory existing set.
*/
import { UNIVERSE, CRYPTO_PAIRS, FX_PAIRS, FUTURE_PAIRS } from '../api-handlers/universe-data.js';
import { INTL_UNIVERSE } from '../api-handlers/intl-universe.js';

(function () {
  const BOOK = [...UNIVERSE, ...INTL_UNIVERSE, ...CRYPTO_PAIRS, ...FX_PAIRS, ...FUTURE_PAIRS];
  const existing = new Set(['AAPL','MSFT','BTCUSD']); // sample existing symbols
  const missing = BOOK.filter(r => !existing.has(r.symbol) );
  console.log('Universe size', BOOK.length);
  console.log('Existing sample count', existing.size);
  console.log('Missing sample (first 20):');
  missing.slice(0,20).forEach(m => console.log('-', m.symbol, m.name || ''));
})();