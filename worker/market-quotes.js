import { getCatalogMarket } from '../shared/market-catalog.js';
// Keyless public feeds. Never blend provider prices with seeded or random values.
const cache = new Map();
const pending = new Map();
const TTL = 15000;
const MAX_AGE = 20 * 60 * 1000;
const FUTURES = new Set(['ES', 'NQ', 'YM', 'RTY', 'GC', 'SI', 'CL', 'NG', 'HG', 'HO', 'BZ', 'ZS', 'ZW', 'KC', 'SB', 'CT', 'DX', '6E', '6J', '6B', '6A', '6C', '6S']);
const INDICES = { US500: '^GSPC', SPX500: '^GSPC', NAS100: '^NDX', NASDAQ: '^IXIC', DOW: '^DJI', GER40: '^GDAXI', UK100: '^FTSE', JPN225: '^N225', FRA40: '^FCHI', HK50: '^HSI' };

async function readJson(url) {
  const edge = globalThis.caches?.default;
  const key = new Request(url);
  try {
    const cached = await edge?.match(key);
    if (cached) return cached.json();
  } catch { /* cache failures must not disable providers */ }
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`Market provider returned ${response.status}`);
  const data = await response.json();
  try {
    await edge?.put(key, new Response(JSON.stringify(data), { headers: {
      'content-type': 'application/json', 'cache-control': `public, max-age=${url.includes('gold-api.com') ? 30 : 15}`,
    } }));
  } catch { /* cache failures must not disable providers */ }
  return data;
}

function validate(quote) {
  const timestamp = Date.parse(quote.quote_updated_at);
  if (!Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(timestamp) || timestamp > Date.now() + 60000) {
    throw new Error('Invalid provider quote');
  }
  return { ...quote, quote_stale: Date.now() - timestamp > (quote.price_source === 'Coinbase' ? 90000 : MAX_AGE) };
}

async function fetchQuote(symbol, assetClass) {
  if (/^XA[UG]USD$|^XP[TD]USD$/.test(symbol)) {
    const data = await readJson(`https://api.gold-api.com/price/${symbol.slice(0, 3)}`);
    if (data.symbol !== symbol.slice(0, 3) || data.currency && data.currency !== 'USD') throw new Error('Unexpected metal quote');
    return validate({ symbol, price: Number(data.price), price_source: 'Gold API (USD/oz)', quote_updated_at: data.updatedAt,
      change_24h: null, high_24h: null, low_24h: null, volume: null });
  }
  if (assetClass === 'crypto') {
    if (!/^[A-Z0-9]+USD$/.test(symbol)) throw new Error('Unsupported USD crypto pair');
    const product = `${symbol.slice(0, -3)}-USD`;
    const data = await readJson(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/ticker`);
    return validate({ symbol, price: Number(data.price), price_source: 'Coinbase', quote_updated_at: data.time,
      change_24h: null, high_24h: null, low_24h: null, volume: null });
  }
  // Spot metals and oil must not silently become futures contracts.
  const mapped = getCatalogMarket(symbol)?.provider_symbol || INDICES[symbol] || (FUTURES.has(symbol) ? `${symbol}=F`
    : assetClass === 'forex' && /^[A-Z]{6}$/.test(symbol) ? `${symbol}=X` : symbol);
  const data = await readJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mapped)}?interval=1m&range=1d`);
  const meta = data.chart?.result?.[0]?.meta;
  if (!meta) throw new Error('Provider quote unavailable');
  const price = Number(meta.regularMarketPrice);
  const previous = Number(meta.chartPreviousClose || meta.previousClose);
  return validate({ symbol, price, price_source: 'Yahoo Finance (may be delayed)',
    quote_currency: meta.currency,
    quote_tradable: getCatalogMarket(symbol)?.currency_supported ?? (meta.currency === 'USD' || assetClass === 'forex'),
    quote_updated_at: new Date(Number(meta.regularMarketTime) * 1000).toISOString(),
    change_24h: previous > 0 ? (price / previous - 1) * 100 : null,
    high_24h: meta.regularMarketDayHigh ?? null, low_24h: meta.regularMarketDayLow ?? null,
    volume: meta.regularMarketVolume ?? null });
}

export async function getMarketQuote(market, { forTrading = false } = {}) {
  const symbol = String(market.symbol || '').toUpperCase();
  const assetClass = market.asset_class || 'stock';
  const key = `${assetClass}:${symbol}`;
  let entry = cache.get(key);
  if (!entry || entry.expires <= Date.now()) {
    let task = pending.get(key);
    if (!task) {
      task = (async () => {
        let value = null;
        try { value = await fetchQuote(symbol, assetClass); } catch { /* unavailable is explicit below */ }
        if (cache.size >= 1000) cache.delete(cache.keys().next().value);
        const result = { value, expires: Date.now() + (value?.price_source === 'Gold API (USD/oz)' ? 30000 : value ? TTL : 5000) };
        cache.set(key, result);
        return result;
      })();
      pending.set(key, task);
    }
    try { entry = await task; } finally { if (pending.get(key) === task) pending.delete(key); }
  }
  const quote = entry.value ? validate(entry.value) : null;
  if (forTrading && (!quote || quote.quote_stale)) throw new Error(`A fresh provider quote is unavailable for ${symbol}.`);
  if (forTrading && quote.quote_tradable === false) throw new Error(`Quotes for ${symbol} are in ${quote.quote_currency}; USD settlement is not supported.`);
  return quote;
}

export async function quoteMarkets(items) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      const quote = await getMarketQuote(item);
      results[index] = quote ? { ...item, ...quote } : { ...item, price: null, change_24h: null,
        high_24h: null, low_24h: null, volume: null, price_source: 'Unavailable', quote_updated_at: null, quote_stale: true };
    }
  }));
  return results;
}

export function clearQuoteCache() { cache.clear(); }
