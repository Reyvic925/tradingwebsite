import { VERIFIED_MARKETS } from './market-catalog/verified.js';

const markets = new Map(VERIFIED_MARKETS.map((market) => [market.symbol, market]));

export function getCatalogMarket(symbol) {
  return markets.get(String(symbol || '').toUpperCase()) || null;
}

export function isSelectableMarket(symbol) {
  return Boolean(getCatalogMarket(symbol));
}

export function isTradableMarket(symbol) {
  return Boolean(getCatalogMarket(symbol)?.currency_supported);
}

// Static audited identifiers only; never interpolate request input into this SQL.
for (const symbol of markets.keys()) {
  if (!/^[A-Z0-9.&^=\-]+$/.test(symbol)) throw new Error(`Unsafe catalog symbol: ${symbol}`);
}
export const selectableMarketsSql = `upper(symbol) IN (${[...markets.keys()].map((symbol) => `'${symbol}'`).join(',')})`;
