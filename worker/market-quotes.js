import YahooFinance from 'yahoo-finance2';

const COINPAPRIKA_BTC_URL = 'https://api.coinpaprika.com/v1/tickers/btc-bitcoin';
const CRYPTO_QUOTE_MAX_AGE_MS = 5 * 60 * 1000;
const MARKET_QUOTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const QUOTE_CACHE_MS = 5000;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const CURRENCY_CODES = new Set([
  'AED', 'AUD', 'BRL', 'CAD', 'CHF', 'CNH', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR',
  'ILS', 'INR', 'JPY', 'KES', 'KRW', 'MXN', 'MYR', 'NGN', 'NOK', 'NZD', 'PHP', 'PLN', 'RUB',
  'SEK', 'SGD', 'THB', 'TRY', 'USD', 'VND', 'ZAR',
]);
const YAHOO_SYMBOL_OVERRIDES = {
  GER40: '^GDAXI',
  FRA40: '^FCHI',
  UK100: '^FTSE',
  JPN225: '^N225',
  HK50: '^HSI',
  US500: '^GSPC',
  SPX500: '^GSPC',
  NAS100: '^NDX',
  NASDAQ: '^IXIC',
  DOW: '^DJI',
  USOIL: 'CL=F',
  UKOIL: 'BZ=F',
  XAUUSD: 'GC=F',
  XAGUSD: 'SI=F',
};

const cachedQuotes = new Map();
const pendingQuotes = new Map();

function toYahooSymbol(symbol) {
  const upper = String(symbol || '').trim().toUpperCase();
  if (YAHOO_SYMBOL_OVERRIDES[upper]) return YAHOO_SYMBOL_OVERRIDES[upper];
  if (/^[A-Z]{6}$/.test(upper) && CURRENCY_CODES.has(upper.slice(0, 3)) && CURRENCY_CODES.has(upper.slice(3))) {
    return `${upper}=X`;
  }
  if (upper.endsWith('USD')) return `${upper.slice(0, -3)}-USD`;
  return upper;
}

function validateFreshQuote(quote, maxAgeMs) {
  const updatedAt = Date.parse(quote.quote_updated_at || '');
  const age = Date.now() - updatedAt;
  if (!Number.isFinite(updatedAt) || age > maxAgeMs || age < -30000) {
    throw new Error(`${quote.symbol} quote is stale or has an invalid timestamp.`);
  }
  return quote;
}

async function fetchCoinPaprikaBtc() {
  const response = await fetch(COINPAPRIKA_BTC_URL, { signal: AbortSignal.timeout(8000) });
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
    quote_updated_at: market.last_updated,
  };
}

async function fetchYahooQuote(symbol) {
  const yahooSymbol = toYahooSymbol(symbol);
  const result = await yahooFinance.quote(
    yahooSymbol,
    {
      fields: [
      'regularMarketPrice',
      'regularMarketChangePercent',
      'regularMarketDayHigh',
      'regularMarketDayLow',
      'regularMarketVolume',
      'regularMarketTime',
      'regularMarketPreviousClose',
      'fullExchangeName',
      'symbol',
      ],
    },
    {
      fetchOptions: { signal: AbortSignal.timeout(8000) },
      validateResult: false,
    },
  );
  const price = Number(result?.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Yahoo Finance returned no price for ${symbol}.`);
  const previousClose = Number(result.regularMarketPreviousClose || price);
  const quoteUpdatedAt = result.regularMarketTime
    ? new Date(result.regularMarketTime).toISOString()
    : null;

  return {
    symbol: String(symbol).toUpperCase(),
    price,
    change_24h: Number(result.regularMarketChangePercent || 0),
    high_24h: Number(result.regularMarketDayHigh || price),
    low_24h: Number(result.regularMarketDayLow || price),
    volume: Number(result.regularMarketVolume || 0),
    price_source: `Yahoo Finance (${result.fullExchangeName || yahooSymbol})`,
    quote_updated_at: quoteUpdatedAt,
  };
}

export async function getLiveMarketQuote(symbol) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!normalizedSymbol) throw new Error('A market symbol is required.');
  const cached = cachedQuotes.get(normalizedSymbol);
  if (cached && Date.now() - cached.fetchedAt < QUOTE_CACHE_MS) return cached.quote;
  if (pendingQuotes.has(normalizedSymbol)) return pendingQuotes.get(normalizedSymbol);

  const request = (async () => {
    const fiatPair = /^[A-Z]{6}$/.test(normalizedSymbol)
      && CURRENCY_CODES.has(normalizedSymbol.slice(0, 3))
      && CURRENCY_CODES.has(normalizedSymbol.slice(3));
    const cryptoSymbol = normalizedSymbol.endsWith('USD') && !fiatPair;
    const maxAge = cryptoSymbol ? CRYPTO_QUOTE_MAX_AGE_MS : MARKET_QUOTE_MAX_AGE_MS;
    let quote;
    if (normalizedSymbol === 'BTCUSD') {
      try {
        quote = validateFreshQuote(await fetchCoinPaprikaBtc(), maxAge);
      } catch (primaryError) {
        try {
          quote = validateFreshQuote(await fetchYahooQuote(normalizedSymbol), maxAge);
        } catch (fallbackError) {
          throw new Error(`Live ${normalizedSymbol} quote unavailable: ${primaryError.message}; ${fallbackError.message}`);
        }
      }
    } else {
      quote = validateFreshQuote(await fetchYahooQuote(normalizedSymbol), maxAge);
    }
    cachedQuotes.set(normalizedSymbol, { quote, fetchedAt: Date.now() });
    return quote;
  })();

  pendingQuotes.set(normalizedSymbol, request);
  try {
    return await request;
  } finally {
    pendingQuotes.delete(normalizedSymbol);
  }
}

export async function getLiveMarketQuotes(symbols = []) {
  const uniqueSymbols = [...new Set(symbols.map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean))];
  const results = await Promise.allSettled(uniqueSymbols.map((symbol) => getLiveMarketQuote(symbol)));
  const quotes = Object.create(null);

  results.forEach((result, index) => {
    const symbol = uniqueSymbols[index];
    if (result.status === 'fulfilled') {
      quotes[symbol] = result.value;
    } else {
      console.error(`[worker/market-quotes] Live quote unavailable for ${symbol}`, result.reason?.message || result.reason);
    }
  });

  return quotes;
}
