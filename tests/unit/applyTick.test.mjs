import assert from 'assert';
import { applyTick } from '../../api-handlers/tick-model.js';

// Deterministic LCG seeded RNG for tests. Replaces Math.random temporarily.
function makeSeededRng(seedValue) {
  let seed = seedValue >>> 0;
  return () => {
    // 32-bit LCG parameters (Numerical Recipes)
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

(async () => {
  // preserve and restore Math.random
  const origRandom = Math.random;
  try {
    const seed = 123456789;
    const rng = makeSeededRng(seed);
    Math.random = rng;

    const m = {
      id: 'TEST-APPLY-TICK',
      price: 100,
      change_24h: 0,
      high_24h: 101,
      low_24h: 99,
      asset_class: 'crypto',
      volatility: 0.01,
      hidden_drift: 0.001,
    };

    const out1 = applyTick(m);

    // reset rng and run again to validate determinism
    Math.random = makeSeededRng(seed);
    const out2 = applyTick(m);

    assert.strictEqual(out1.price, out2.price, 'Prices must be identical when RNG is seeded identically');
    assert.strictEqual(out1.change_24h, out2.change_24h, 'change_24h must be identical when RNG is seeded identically');

    // Basic sanity checks for expected shape and ranges
    assert.ok(out1.price > 0, 'price should be positive');
    assert.ok(out1.high_24h >= out1.price, 'high_24h should be >= price');
    assert.ok(out1.low_24h <= out1.price, 'low_24h should be <= price');

    console.log('ALL TESTS PASSED');
  } finally {
    Math.random = origRandom;
  }
})();
