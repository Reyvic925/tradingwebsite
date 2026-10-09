import assert from 'node:assert/strict';
import { handleTraderRequest } from '../../worker/traders-api.js';

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async all() {
    this.database.statements.push({ sql: this.sql, values: this.values });
    if (this.sql.includes('FROM traders')) return { results: this.database.traders };
    if (this.sql.includes('FROM trader_trades')) return { results: this.database.trades };
    if (this.sql.includes('FROM trader_history')) return { results: this.database.history };
    return { results: [] };
  }
}

class FakeDatabase {
  constructor() {
    this.statements = [];
    this.traders = [{
      id: 21,
      name: 'Mark Hergott',
      asset_focus: '["BTC-USD","EUR-USD"]',
      is_active: 1,
      total_return: 32.8,
    }];
    this.trades = [];
    this.history = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

const db = new FakeDatabase();
const env = { DB: db };
const get = (path) => new Request(`https://example.test${path}`);

const listResponse = await handleTraderRequest(get('/api/traders'), env);
assert.equal(listResponse.status, 200);
assert.deepEqual(await listResponse.json(), [{
  id: 21,
  name: 'Mark Hergott',
  asset_focus: ['BTC-USD', 'EUR-USD'],
  is_active: true,
  total_return: 32.8,
}]);

await handleTraderRequest(get('/api/traders?session=nyc&asset=BTC-USD'), env);
assert.match(db.statements.at(-1).sql, /session_type = \?/);
assert.match(db.statements.at(-1).sql, /json_each\(traders\.asset_focus\)/);
assert.deepEqual(db.statements.at(-1).values, ['nyc', 'BTC-USD']);

const profileTrades = await handleTraderRequest(get('/api/trader-trades?traderId=21'), env);
assert.deepEqual(await profileTrades.json(), []);
const invalidHistory = await handleTraderRequest(get('/api/trader-history?traderId=bad'), env);
assert.equal(invalidHistory.status, 400);

const unauthorizedCreate = await handleTraderRequest(new Request('https://example.test/api/traders', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Should Not Be Added' }),
}), env);
assert.equal(unauthorizedCreate.status, 403);

console.log('D1_TRADERS_API_TESTS_PASSED');
