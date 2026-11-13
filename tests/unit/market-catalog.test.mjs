import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { VERIFIED_MARKETS } from '../../shared/market-catalog/verified.js';
import { getCatalogMarket, isSelectableMarket, selectableMarketsSql } from '../../shared/market-catalog.js';
import { MARKET_UNIVERSE } from '../../api-handlers/universe-data.js';
import { isTradableMarket } from '../../shared/market-catalog.js';

const audit = JSON.parse(readFileSync(new URL('../../docs/market-catalog/audit.json', import.meta.url), 'utf8'));
assert.equal(VERIFIED_MARKETS.length, new Set(VERIFIED_MARKETS.map((row) => row.symbol)).size);
assert.ok(VERIFIED_MARKETS.length > 100, 'the audit must retain a substantial verified catalog');
assert.equal(audit.filter((row) => row.status === 'fabricated').length, 540);
for (const row of audit) {
  assert.equal(isSelectableMarket(row.symbol), row.active, `${row.symbol}: eligibility differs from audit`);
  if (row.active) {
    assert.ok(row.provider_confirmed);
    assert.ok(row.tradingview_symbol);
  }
}
assert.equal(getCatalogMarket('AAPL').tradingview_symbol, 'NASDAQ:AAPL');
assert.equal(getCatalogMarket('KO').tradingview_symbol, 'NYSE:KO', 'NYSE symbols must not default to NASDAQ');
assert.equal(getCatalogMarket('BTCUSD').tradingview_symbol, 'COINBASE:BTCUSD', 'crypto charts match the pricing venue');
assert.ok(getCatalogMarket('GC=F').tradingview_symbol.endsWith(':GC1!'), 'Yahoo futures need an explicit continuous-contract mapping');
assert.equal(isSelectableMarket('FLT12'), false);
assert.ok(isSelectableMarket('7203.T'), 'real international listings stay visible');
assert.equal(isTradableMarket('7203.T'), false, 'JPY quotes cannot be silently settled as USD');
assert.ok(MARKET_UNIVERSE.every((row) => isSelectableMarket(row.symbol)), 'seeding cannot reintroduce excluded symbols');

const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE markets (symbol TEXT)');
const insert = db.prepare('INSERT INTO markets VALUES (?)');
for (const symbol of ['AAPL', 'KO', 'BTCUSD', 'FLT12', 'NOT_A_SYMBOL']) insert.run(symbol);
assert.deepEqual(db.prepare(`SELECT symbol FROM markets WHERE ${selectableMarketsSql} ORDER BY symbol`).all().map((r) => r.symbol), ['AAPL','BTCUSD','KO']);
db.close();
const repair = new DatabaseSync(':memory:');
repair.exec('CREATE TABLE markets (id INTEGER PRIMARY KEY, symbol TEXT, name TEXT, asset_class TEXT, price REAL)');
const migration = readFileSync(new URL('../../d1-migrations/0022_restore_verified_core_markets.sql', import.meta.url), 'utf8');
repair.exec(migration);
repair.exec(migration);
assert.equal(repair.prepare('SELECT COUNT(*) AS count FROM markets').get().count, 5, 'repair is idempotent');
assert.equal(repair.prepare('SELECT COUNT(*) AS count FROM markets WHERE price IS NOT NULL').get().count, 0, 'repair must not invent prices');
repair.close();
console.log('MARKET_CATALOG_TESTS_PASSED');
