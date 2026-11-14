import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { calculateTraderAnalytics, calculateTraderExposure } from '../../shared/trader-analytics.js';
import { handleTraderRequest } from '../../worker/traders-api.js';
import { valueCopy } from '../../shared/copy-risk.js';

const trader = { session_type: 'crypto', current_equity: 10000 };
let equity = 10000;
const history = [{ snapshot_date: '2026-09-30', equity }];
for (let day = 1; day <= 31; day++) {
  equity *= day % 2 ? 1.01 : 0.995;
  history.push({ snapshot_date: `2026-10-${String(day).padStart(2, '0')}`, equity });
}
const now = new Date('2026-11-14T12:00:00Z');
const analytics = calculateTraderAnalytics(trader, history, now);
assert.equal(analytics.return_observations, 31);
assert(Number.isFinite(analytics.sharpe));
assert(Number.isFinite(analytics.sortino));
const expectedMean = (16 * 0.01 - 15 * 0.005) / 31;
const expectedVariance = (16 * (0.01 - expectedMean) ** 2 + 15 * (-0.005 - expectedMean) ** 2) / 30;
assert(Math.abs(analytics.sharpe - expectedMean / Math.sqrt(expectedVariance) * Math.sqrt(365)) < 1e-9);
const october = analytics.months.find(month => month.month === '2026-10');
assert(Math.abs(october.return - (equity / 10000 - 1) * 100) < 1e-9);
assert.equal(october.partial, false);
assert.equal(analytics.months.find(month => month.month === '2026-11').return, null);
assert.equal(calculateTraderAnalytics(trader, history.slice(0, 20), now).sharpe, null);
assert.equal(calculateTraderAnalytics(trader, history.slice(1), now).months.find(month => month.month === '2026-10').return, null);
assert.equal(calculateTraderAnalytics(trader, [history[0], history[31]], now).return_observations, 0);
const fridayMonday = [{ snapshot_date: '2026-11-06', equity: 100 }, { snapshot_date: '2026-11-09', equity: 101 }];
assert.equal(calculateTraderAnalytics({ session_type: 'london' }, fridayMonday, now).return_observations, 1);
assert.equal(calculateTraderAnalytics(trader, fridayMonday, now).return_observations, 0);

const state = { priceBasis: 'market', prices: { 'BTC-USD': 100000, 'USD-JPY': 150 } };
const exposure = calculateTraderExposure(trader, [
  { symbol: 'BTC-USD', side: 'BUY', quantity: 0.05, price_basis: 'market' },
  { symbol: 'USD-JPY', side: 'SELL', quantity: 1000, price_basis: 'market' },
], state);
assert.equal(exposure.gross_notional, 6000);
assert.equal(exposure.net_notional, 4000);
assert.equal(exposure.effective_leverage, 0.6);
assert.equal(calculateTraderExposure(trader, [{ symbol: 'EUR-GBP', side: 'BUY', quantity: 100, price_basis: 'market' }], state).gross_notional, null);
assert.equal(calculateTraderExposure(trader, [{ symbol: 'BTC-USD', side: 'BUY', quantity: 1, price_basis: 'synthetic' }], state).gross_notional, null);
assert.equal(calculateTraderExposure(trader, [], state).effective_leverage, 0);
const preview = valueCopy({ allocated_amount: 1000, current_value: 1000, peak_value: 1000,
  leverage_multiplier: 2, fee_high_water: 1000, stop_loss_percent: 20, take_profit_percent: 200 }, 0.1, 20);
assert.equal(preview.fee, 40);
assert.equal(preview.value, 1160);

const sqlite = new DatabaseSync(':memory:');
for (const file of ['0001_d1_foundation.sql', '0018_traders.sql', '0020_copy_trading.sql', '0025_copy_trade_quote_provenance.sql', '0026_trader_watchlists.sql']) {
  sqlite.exec(readFileSync(`d1-migrations/${file}`, 'utf8'));
}
class Statement {
  constructor(sql) { this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return sqlite.prepare(this.sql).get(...this.values) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.values) }; }
  async run() { return { meta: { changes: sqlite.prepare(this.sql).run(...this.values).changes } }; }
}
const env = { DB: { prepare: sql => new Statement(sql) } };
for (const id of ['first', 'second']) {
  sqlite.prepare('INSERT INTO auth_users(id,email,password_hash,email_verified_at) VALUES (?,?,?,CURRENT_TIMESTAMP)').run(id, `${id}@example.test`, 'unused');
  sqlite.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES (?,?,?)')
    .run(createHash('sha256').update(id).digest('base64url'), id, '2099-01-01');
}
const request = (path, method = 'GET', user = 'first') => handleTraderRequest(new Request(`https://example.test${path}`,
  { method, headers: user ? { cookie: `apex_session=${user}` } : {} }), env);
assert.equal((await request('/api/trader-watchlist', 'GET', '')).status, 401);
assert.equal((await request('/api/trader-watchlist?traderId=1', 'PUT')).status, 200);
assert.equal((await request('/api/trader-watchlist?traderId=1', 'PUT')).status, 200);
assert.deepEqual((await (await request('/api/trader-watchlist')).json()).trader_ids, [1]);
assert.deepEqual((await (await request('/api/trader-watchlist', 'GET', 'second')).json()).trader_ids, []);
await request('/api/trader-watchlist?traderId=1', 'DELETE', 'second');
assert.deepEqual((await (await request('/api/trader-watchlist')).json()).trader_ids, [1]);
assert.equal((await request('/api/trader-watchlist?traderId=9999', 'PUT')).status, 404);
assert.equal((await request('/api/trader-watchlist?traderId=invalid', 'PUT')).status, 400);
await request('/api/trader-watchlist?traderId=1', 'DELETE');
assert.deepEqual((await (await request('/api/trader-watchlist')).json()).trader_ids, []);
const response = await request('/api/trader-analytics?traderId=1');
assert.equal(response.status, 200);
const empty = await response.json();
assert.equal(empty.sharpe, null);
assert.equal(empty.months.length, 12);
assert.equal(empty.exposure.gross_notional, 0);
assert.equal((await request('/api/trader-analytics?traderId=9999')).status, 404);
assert.equal((await request('/api/trader-comparison?ids=&period=30')).status, 400);
const comparison = await (await request('/api/trader-comparison?ids=1,2&period=30')).json();
assert.equal(comparison.metrics.length, 2);
assert.equal(comparison.metrics[0].performance_fee, 20);
sqlite.close();
console.log('TRADER_ANALYTICS_AND_WATCHLIST_TESTS_PASSED');
