import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleTraderRequest } from '../../worker/traders-api.js';

const db = new DatabaseSync(':memory:');
for (const file of ['0018_traders.sql', '0020_copy_trading.sql', '0027_trade_price_audit.sql']) {
  db.exec(readFileSync(`d1-migrations/${file}`, 'utf8'));
}
db.prepare('UPDATE traders SET current_equity=99000,total_return=61 WHERE id=4').run();
db.prepare('INSERT INTO copy_simulation_state (trader_id,config,state) VALUES (4,?,?)')
  .run(JSON.stringify({ startingEquity: 61576, assets: ['BTC-USD', 'ETH-USD', 'SOL-USD'], strategyType: 'conservative' }), JSON.stringify({ equity: 99000 }));
db.prepare('INSERT INTO copy_simulation_ticks (trader_id,tick,change,detail,created_at) VALUES (4,1,?,?,?)')
  .run(-0.0001, JSON.stringify({ state: { equity: 99990 } }), '2026-11-13T00:00:00Z');
db.exec(readFileSync('d1-migrations/0029_recorded_performance_baselines.sql', 'utf8'));
const trader = db.prepare('SELECT * FROM traders WHERE id=4').get();
assert.equal(trader.recorded_starting_equity, 100000);
assert(Math.abs(trader.total_return + 1) < 1e-9);
assert.equal(trader.current_equity, 99000);
const config = JSON.parse(db.prepare('SELECT config FROM copy_simulation_state WHERE trader_id=4').get().config);
assert.equal(config.startingEquity, 100000);
assert.equal(config.dailyLossLimitPercent, 1);
const audit = JSON.parse(db.prepare("SELECT original_json FROM trade_price_audit WHERE entity='return_baseline' AND record_id='4'").get().original_json);
assert.equal(audit.total_return, 61);
assert.equal(audit.config.startingEquity, 61576);
db.prepare("INSERT INTO trader_trades (trader_id,symbol,side,quantity,entry_price,traded_at) VALUES (4,'ETH-USD','BUY',1,1776,'2026-11-15T07:50:00Z')").run();
const env = { DB: { prepare(sql) { return {
  values: [], bind(...values) { this.values = values; return this; },
  async first() { return db.prepare(sql).get(...this.values); },
  async all() { return { results: db.prepare(sql).all(...this.values) }; },
}; } } };
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async url => {
    assert(String(url).startsWith('https://api.exchange.coinbase.com/products/'));
    return Response.json({ price: '2105.25', time: new Date().toISOString() });
  };
  const response = await handleTraderRequest(new Request('https://example.test/api/trader-quotes?traderId=4'), env);
  assert.equal(response.status, 200);
  const quotes = await response.json();
  const eth = quotes.find(quote => quote.asset === 'ETH-USD');
  assert.equal(eth.price, 2105.25);
  assert.equal(eth.source, 'Coinbase');
  assert(eth.at);
  assert.equal(db.prepare('SELECT entry_price FROM trader_trades').get().entry_price, 1776, 'current quotes must never rewrite dated entry prices');
} finally { globalThis.fetch = originalFetch; db.close(); }
console.log('RECORDED_PERFORMANCE_AND_CURRENT_QUOTE_TESTS_PASSED');
