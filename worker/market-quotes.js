const BTC_MARKET_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin&price_change_percentage=24h';
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
    const [market] = await response.json();
    const price = Number(market?.current_price);
    if (!Number.isFinite(price) || price <= 0) throw new Error('CoinGecko returned an invalid BTC price.');

    const quote = {
      symbol: 'BTCUSD',
      price,
      change_24h: Number(market.price_change_percentage_24h || 0),
      high_24h: Number(market.high_24h || price),
      low_24h: Number(market.low_24h || price),
      volume: Number(market.total_volume || 0),
      price_source: 'CoinGecko',
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