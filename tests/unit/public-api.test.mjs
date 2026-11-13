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
globalThis.fetch = async (url) => {
  externalFetchCalls += 1;
  return Response.json(String(url).includes('coinbase')
    ? { price: '63251', time: new Date().toISOString(), volume: '1' }
    : { chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 1, regularMarketTime: Math.floor(Date.now() / 1000), chartPreviousClose: 1, regularMarketVolume: 1, regularMarketDayHigh: 1, regularMarketDayLow: 1 } }] } });
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
const stagingQuotes = await stagingMarkets.json();
assert.equal(stagingQuotes.items[0].symbol, 'STAGE');
assert.equal(stagingQuotes.items[0].price_source, 'Yahoo Finance (may be delayed)');
assert.ok(stagingQuotes.items[0].quote_updated_at);
assert.equal(stagingQuotes.total, 1);

const stockMarkets = await handlePublicRequest(request('/api/markets?class=stocks'), { DB: productionDb });
assert.equal((await stockMarkets.json()).items[0].price, 1);
assert.deepEqual(productionDb.statements.at(-1).values, ['stock', 12, 0]);
await handlePublicRequest(request('/api/markets?class=fx'), { DB: productionDb });
assert.deepEqual(productionDb.statements.at(-1).values, ['forex', 12, 0]);

const storedBtcResponse = await handlePublicRequest(request('/api/markets?symbol=BTCUSD&limit=1'), { DB: productionDb });
const storedBtc = await storedBtcResponse.json();
assert.equal(storedBtcResponse.status, 200);
assert.equal(storedBtc.items[0].price, 63251);
assert.equal(storedBtc.items[0].price_source, 'Coinbase');
assert.ok(externalFetchCalls > 0, 'market reads fetch provider quotes');
globalThis.fetch = originalFetch;

const missingStaging = await handlePublicRequest(request('/api/markets'), { PUBLIC_API_DATABASE: 'staging', DB: productionDb });
assert.equal(missingStaging.status, 503);
assert.match((await missingStaging.json()).error, /STAGING_DB is unavailable/);

const emptyDb = {
  prepare() {
    return { bind() { return this; }, async first() { return { total: 0 }; }, async all() { return { results: [] }; } };
  },
};
const emptySearch = await handlePublicRequest(request('/api/markets?q=NO_SUCH_SYMBOL&offset=12'), { DB: emptyDb });
assert.deepEqual(await emptySearch.json(), { items: [], total: 0, limit: 12, offset: 12 },
  'empty search or page must not be replaced with unrelated seeded markets');

console.log('PUBLIC_API_DATABASE_TESTS_PASSED');
