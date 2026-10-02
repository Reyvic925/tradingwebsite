const BTC_MARKET_URL = 'https://api.coinpaprika.com/v1/tickers/btc-bitcoin';
const YAHOO_BTC_URL = 'https://query2.finance.yahoo.com/v8/finance/chart/BTC-USD?range=1d&interval=1m';
const QUOTE_CACHE_MS = 5000;

let cachedQuote = null;
let cachedAt = 0;
let pendingQuote = null;

async function fetchCoinPaprikaQuote() {
  const response = await fetch(BTC_MARKET_URL, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`CoinPaprika request failed (${response.status})`);
  const market = await response.json();
  const price = Number(market?.quotes?.USD?.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('CoinPaprika returned an invalid BTC price.');
  return {
    symbol: 'BTCUSD',
    price,
    change_24h: Number(market.quotes.USD.percent_change_24h || 0),
    high_24h: null,
    low_24h: null,
    volume: Number(market.quotes.USD.volume_24h || 0),
    price_source: 'CoinPaprika',
    quote_updated_at: market.last_updated || new Date().toISOString(),
  };
}

async function fetchYahooBtcQuote() {
  const response = await fetch(YAHOO_BTC_URL, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Yahoo Finance request failed (${response.status})`);
  const result = (await response.json())?.chart?.result?.[0];
  const price = Number(result?.meta?.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Yahoo Finance returned an invalid BTC price.');

  const quote = result.indicators?.quote?.[0] || {};
  const highs = (quote.high || []).map(Number).filter((value) => Number.isFinite(value) && value > 0);
  const lows = (quote.low || []).map(Number).filter((value) => Number.isFinite(value) && value > 0);
  const previousClose = Number(result.meta.chartPreviousClose || result.meta.previousClose || price);
  const change = previousClose > 0 ? ((price / previousClose) - 1) * 100 : 0;
  return {
    symbol: 'BTCUSD',
    price,
    change_24h: change,
    high_24h: highs.length ? Math.max(...highs) : null,
    low_24h: lows.length ? Math.min(...lows) : null,
    volume: Number((quote.volume || []).filter(Number.isFinite).at(-1) || 0),
    price_source: 'Yahoo Finance (CCC)',
    quote_updated_at: Number.isFinite(Number(result.meta.regularMarketTime))
      ? new Date(Number(result.meta.regularMarketTime) * 1000).toISOString()
      : new Date().toISOString(),
  };
}

export async function getLiveMarketQuote(symbol) {
  if (String(symbol || '').toUpperCase() !== 'BTCUSD') return null;
  if (cachedQuote && Date.now() - cachedAt < QUOTE_CACHE_MS) return cachedQuote;
  if (pendingQuote) return pendingQuote;

  pendingQuote = (async () => {
    let quote;
    try {
      quote = await fetchCoinPaprikaQuote();
    } catch (primaryError) {
      try {
        quote = await fetchYahooBtcQuote();
      } catch (fallbackError) {
        throw new Error(`Live BTC quote unavailable: ${primaryError.message}; ${fallbackError.message}`);
      }
    }
    cachedQuote = quote;
    cachedAt = Date.now();
    return quote;
  })();

  try {
    return await pendingQuote;
  } finally {
    pendingQuote = null;
  }
}