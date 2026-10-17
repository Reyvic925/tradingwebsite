import assert from 'node:assert/strict';
import { handlePublicRequest, selectPublicDatabase } from '../../worker/public-api.js';

class FakeDatabase {
  constructor(label) {
    this.label = label;
    this.statements = [];
  }

  prepare(sql) {
    const statement = new FakeStatement(this.label, sql);
    this.statements.push(statement);
    return statement;
  }
}

class FakeStatement {
  constructor(label, sql) {
    this.label = label;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async all() {
    if (this.sql.includes('FROM markets')) {
      if (this.values.includes('BTCUSD')) {
        return { results: [{ id: 2, symbol: 'BTCUSD', name: 'Bitcoin / USD', asset_class: 'crypto', price: 63250, change_24h: 0, volume: 1, high_24h: 63250, low_24h: 63250 }] };
      }
      return { results: [{ id: 1, symbol: this.label === 'staging' ? 'STAGE' : 'PROD', name: `${this.label} market`, asset_class: 'stock', price: 1, change_24h: 0, volume: 1, high_24h: 1, low_24h: 1 }] };
    }
    return { results: [{ id: 1, source: this.label }] };
  }

  async first() {
    return { total: 1 };
  }
}

const productionDb = new FakeDatabase('production');
const stagingDb = new FakeDatabase('staging');
const request = (path) => new Request(`http://localhost${path}`);
const originalFetch = globalThis.fetch;
let externalFetchCalls = 0;
globalThis.fetch = async () => {
  externalFetchCalls += 1;
  throw new Error('External market price fetching must remain disabled.');
};

assert.equal(selectPublicDatabase({ DB: productionDb, STAGING_DB: stagingDb }), productionDb);
assert.equal(selectPublicDatabase({ PUBLIC_API_DATABASE: 'production', DB: productionDb, STAGING_DB: stagingDb }), productionDb);
assert.equal(selectPublicDatabase({ PUBLIC_API_DATABASE: 'staging', DB: productionDb, STAGING_DB: stagingDb }), stagingDb);
assert.throws(() => selectPublicDatabase({ PUBLIC_API_DATABASE: 'staging', DB: productionDb }), /STAGING_DB is unavailable/);

const productionLanding = await handlePublicRequest(request('/api/landing'), { DB: productionDb, STAGING_DB: stagingDb });
assert.equal(productionLanding.status, 200);
assert.deepEqual(Object.keys(await productionLanding.json()), ['features', 'partners', 'stats', 'plans', 'testimonials']);

const stagingLanding = await handlePublicRequest(request('/api/landing'), { PUBLIC_API_DATABASE: 'staging', DB: productionDb, STAGING_DB: stagingDb });
assert.equal((await stagingLanding.json()).features[0].source, 'staging');

const stagingMarkets = await handlePublicRequest(request('/api/markets?featured=1&limit=12'), { PUBLIC_API_DATABASE: 'staging', DB: productionDb, STAGING_DB: stagingDb });
assert.deepEqual(await stagingMarkets.json(), {
  items: [{ id: 1, symbol: 'STAGE', name: 'staging market', asset_class: 'stock', price: 1, change_24h: 0, volume: 1, high_24h: 1, low_24h: 1, price_source: 'D1 reference' }],
  total: 1,
  limit: 12,
  offset: 0,
});

const stockMarkets = await handlePublicRequest(request('/api/markets?class=stocks'), { DB: productionDb });
assert.equal((await stockMarkets.json()).items[0].price, 1);
assert.deepEqual(productionDb.statements.at(-1).values, ['stock', 50, 0]);
await handlePublicRequest(request('/api/markets?class=fx'), { DB: productionDb });
assert.deepEqual(productionDb.statements.at(-1).values, ['forex', 50, 0]);

const storedBtcResponse = await handlePublicRequest(request('/api/markets?symbol=BTCUSD&limit=1'), { DB: productionDb });
const storedBtc = await storedBtcResponse.json();
assert.equal(storedBtcResponse.status, 200);
assert.equal(storedBtc.items[0].price, 63250);
assert.equal(storedBtc.items[0].price_source, 'D1 reference');
assert.equal(externalFetchCalls, 0, 'market reads must not fetch prices from external services');
globalThis.fetch = originalFetch;

const missingStaging = await handlePublicRequest(request('/api/markets'), { PUBLIC_API_DATABASE: 'staging', DB: productionDb });
assert.equal(missingStaging.status, 503);
assert.match((await missingStaging.json()).error, /STAGING_DB is unavailable/);

console.log('PUBLIC_API_DATABASE_TESTS_PASSED');