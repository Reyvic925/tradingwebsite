/* Mock tick runner — runs applyTick on a sample set of markets without DB access.
   Usage: node scripts/mock_tick_once.js
*/
import { applyTick } from '../api-handlers/tick-model.js';

function sampleMarkets() {
  return [
    { id: 1, price: 100, change_24h: 0, high_24h: 100, low_24h: 100, asset_class: 'crypto', volatility: 0.01, hidden_drift: 0.001 },
    { id: 2, price: 50, change_24h: 0, high_24h: 50, low_24h: 50, asset_class: 'forex', volatility: 0.0008, hidden_drift: 0.0002 },
    { id: 3, price: 250, change_24h: 0, high_24h: 250, low_24h: 250, asset_class: 'stock', volatility: 0.0016, hidden_drift: 0.0005 },
  ];
}

(async () => {
  try {
    console.log('Running mock tick once for sample markets');
    const markets = sampleMarkets();
    for (const m of markets) {
      const before = { id: m.id, price: m.price, high_24h: m.high_24h, low_24h: m.low_24h };
      const out = applyTick(m);
      console.log(`Market ${m.id}: price ${before.price} -> ${out.price.toFixed(6)}, high24 ${out.high_24h}, low24 ${out.low_24h}`);
    }
    console.log('Mock tick completed');
  } catch (e) {
    console.error('Mock tick failed', e);
    process.exit(1);
  }
})();