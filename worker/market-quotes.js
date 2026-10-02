const BTC_MARKET_URL = 'https://api.coinpaprika.com/v1/tickers/btc-bitcoin';
const QUOTE_CACHE_MS = 5000;

let cachedQuote = null;
let cachedAt = 0;
let pendingQuote = null;

export async function getLiveMarketQuote(symbol) {
  if (String(symbol || '').toUpperCase() !== 'BTCUSD') return null;
  if (cachedQuote && Date.now() - cachedAt < QUOTE_CACHE_MS) return cachedQuote;
  if (pendingQuote) return pendingQuote;

  pendingQuote = (async () => {
    const response = await fetch(BTC_MARKET_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`CoinGecko request failed (${response.status})`);
    const market = await response.json();
    const price = Number(market?.quotes?.USD?.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error('CoinPaprika returned an invalid BTC price.');

    const quote = {
      symbol: 'BTCUSD',
      price,
      change_24h: Number(market.quotes.USD.percent_change_24h || 0),
      high_24h: null,
      low_24h: null,
      volume: Number(market.quotes.USD.volume_24h || 0),
      price_source: 'CoinPaprika',
      quote_updated_at: market.last_updated || new Date().toISOString(),
    };
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