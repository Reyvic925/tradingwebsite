import { getCatalogMarket } from '../shared/market-catalog.js';
// Keyless public feeds. Never blend provider prices with seeded or random values.
const cache = new Map();
const pending = new Map();
let yahooRetryAfter = 0;
const TTL = 15000;
const MAX_AGE = 20 * 60 * 1000;
const FUTURES = new Set(['ES', 'NQ', 'YM', 'RTY', 'GC', 'SI', 'CL', 'NG', 'HG', 'HO', 'BZ', 'ZS', 'ZW', 'KC', 'SB', 'CT', 'DX', '6E', '6J', '6B', '6A', '6C', '6S']);
const INDICES = { US500: '^GSPC', SPX500: '^GSPC', NAS100: '^NDX', NASDAQ: '^IXIC', DOW: '^DJI', GER40: '^GDAXI', UK100: '^FTSE', JPN225: '^N225', FRA40: '^FCHI', HK50: '^HSI' };

async function readJson(url,maxCacheMs=url.includes('gold-api.com')?30000:TTL) {
  const edge = globalThis.caches?.default;
  const key = new Request(url);
  try {
    const cached = await edge?.match(key);
    const cachedAt=Number(cached?.headers.get('x-quote-cached-at')||0);
    if (cached&&(maxCacheMs>=TTL||cachedAt&&Date.now()-cachedAt<maxCacheMs)) return cached.json();
  } catch { /* cache failures must not disable providers */ }
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw Object.assign(new Error(`Market provider returned ${response.status}`), { status: response.status });
  const data = await response.json();
  try {
    await edge?.put(key, new Response(JSON.stringify(data), { headers: {
      'content-type': 'application/json', 'cache-control': `public, max-age=${Math.ceil(maxCacheMs/1000)}`,
      'x-quote-cached-at':String(Date.now()),
    } }));
  } catch { /* cache failures must not disable providers */ }
  return data;
}

function validate(quote) {
  const timestamp = Date.parse(quote.quote_updated_at);
  if (!Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(timestamp) || timestamp > Date.now() + 60000) {
    throw new Error('Invalid provider quote');
  }
  return { ...quote, quote_stale: Date.now() - timestamp > (quote.quote_max_age_ms || (quote.price_source === 'Coinbase' ? 90000 : MAX_AGE)) };
}

async function fetchQuote(symbol, assetClass, maxCacheMs=TTL) {
  if (/^XA[UG]USD$|^XP[TD]USD$/.test(symbol)) {
    const data = await readJson(`https://api.gold-api.com/price/${symbol.slice(0, 3)}`);
    if (data.symbol !== symbol.slice(0, 3) || data.currency && data.currency !== 'USD') throw new Error('Unexpected metal quote');
    return validate({ symbol, price: Number(data.price), price_source: 'Gold API (USD/oz)', quote_updated_at: data.updatedAt,
      change_24h: null, high_24h: null, low_24h: null, volume: null });
  }
  if (assetClass === 'crypto') {
    if (!/^[A-Z0-9]+USD$/.test(symbol)) throw new Error('Unsupported USD crypto pair');
    const product = `${symbol.slice(0, -3)}-USD`;
    const data = await readJson(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/ticker`,maxCacheMs);
    return validate({ symbol, price: Number(data.price), price_source: 'Coinbase', quote_updated_at: data.time,
      change_24h: null, high_24h: null, low_24h: null, volume: null });
  }
  // Spot metals and oil must not silently become futures contracts.
  if (Date.now() < yahooRetryAfter) throw new Error('Yahoo provider is cooling down after throttling');
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

async function fetchTradingViewQuote(symbol) {
  const market = getCatalogMarket(symbol);
  if (!market?.tradingview_symbol || market.provider !== 'Yahoo Finance') throw new Error('No verified fallback symbol');
  const response = await fetch('https://scanner.tradingview.com/global/scan', {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
    body: JSON.stringify({ symbols: { tickers: [market.tradingview_symbol] },
      columns: ['close|1', 'time|1', 'update_mode', 'currency', 'change', 'high', 'low', 'volume'] }),
  });
  if (!response.ok) throw new Error(`TradingView fallback returned ${response.status}`);
  const payload = await response.json();
  const row = payload.data?.find((item) => item.s === market.tradingview_symbol);
  const [price, timestamp, mode, currency, change, high, low, volume] = row?.d || [];
  if (!Number.isFinite(timestamp) || !currency || currency !== market.currency) throw new Error('Fallback quote metadata is incomplete');
  const delay = /^delayed_streaming_(\d+)$/.exec(String(mode || ''));
  const seconds = delay ? Number(delay[1]) : mode === 'streaming' ? 0 : null;
  if (seconds === null) throw new Error('Fallback quote delay is unknown');
  return validate({ symbol, price: Number(price),
    price_source: `TradingView (${seconds ? `${seconds / 60}m delayed; ` : ''}1m bars)`,
    // time|1 is the minute-bar opening time, never the HTTP retrieval time.
    quote_updated_at: new Date(timestamp * 1000).toISOString(),
    quote_timestamp_kind: 'minute_bar', quote_delay_seconds: seconds,
    quote_currency: currency, quote_tradable: market.currency_supported,
    change_24h: change ?? null, high_24h: high ?? null, low_24h: low ?? null, volume: volume ?? null });
}

export async function getMarketQuote(market, { forTrading = false, maxCacheMs } = {}) {
  const symbol = String(market.symbol || '').toUpperCase();
  const assetClass = market.asset_class || 'stock';
  const key = `${assetClass}:${symbol}`;
  let entry = cache.get(key);
  if (!entry || entry.expires <= Date.now() || maxCacheMs!==undefined&&Date.now()-(entry.fetched_at||0)>=maxCacheMs) {
    let task = pending.get(key);
    if (!task) {
      task = (async () => {
        let value = null;
        try { value = await fetchQuote(symbol, assetClass,maxCacheMs??TTL); }
        catch (error) {
          console.warn('[market-quotes] Provider unavailable', symbol, error?.message || 'Unknown provider error');
          if (getCatalogMarket(symbol)?.provider === 'Yahoo Finance') {
            if (error?.status === 429) yahooRetryAfter = Date.now() + 60000;
            try { value = await fetchTradingViewQuote(symbol); }
            catch (fallbackError) { console.warn('[market-quotes] Fallback unavailable', symbol, fallbackError?.message || 'Unknown provider error'); }
          }
        }
        if (cache.size >= 1000) cache.delete(cache.keys().next().value);
        const result = { value, fetched_at:Date.now(), expires: Date.now() + (value?.price_source === 'Gold API (USD/oz)' ? 30000 : value ? TTL : 5000) };
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
        high_24h: null, low_24h: null, volume: null, price_source: 'Unavailable', quote_updated_at: null, quote_stale: true,
        quote_currency: getCatalogMarket(item.symbol)?.currency,
        quote_tradable: getCatalogMarket(item.symbol)?.currency_supported ?? false };
    }
  }));
  return results;
}

export function clearQuoteCache() { cache.clear(); yahooRetryAfter = 0; }

// One request warms an entire portfolio using its verified exchange symbols.
// Preserve fresher direct Coinbase ticks when they are already cached.
export async function warmTerminalQuotes(symbols) {
  const markets=[...new Set(symbols)].map(getCatalogMarket).filter(Boolean).slice(0,300);
  if(!markets.length)return;
  try {
    const response=await fetch('https://scanner.tradingview.com/global/scan',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(6000),
      body:JSON.stringify({symbols:{tickers:markets.map(m=>m.tradingview_symbol)},columns:['close|1','time|1','update_mode','currency','change','high','low','volume']})});
    if(!response.ok)return;
    const payload=await response.json(),bySymbol=new Map((payload.data||[]).map(row=>[row.s,row.d]));
    for(const market of markets) {
      const existing=cache.get(`${market.asset_class}:${market.symbol}`);
      if(market.asset_class==='crypto'&&existing?.value?.price_source==='Coinbase'&&Date.now()-existing.fetched_at<5000)continue;
      const row=bySymbol.get(market.tradingview_symbol);if(!row)continue;
      const [price,timestamp,mode,currency,change,high,low,volume]=row;
      const match=/^delayed_streaming_(\d+)$/.exec(String(mode));
      const seconds=match?Number(match[1]):mode==='streaming'?0:null;
      if(!Number.isFinite(timestamp)||currency!==market.currency||seconds===null)continue;
      try {
        const value=validate({symbol:market.symbol,price:Number(price),price_source:`TradingView (${seconds?`${seconds/60}m delayed; `:''}1m bars)`,quote_updated_at:new Date(timestamp*1000).toISOString(),
          quote_currency:currency,quote_tradable:market.currency_supported,quote_timestamp_kind:'minute_bar',quote_delay_seconds:seconds,
          quote_max_age_ms:market.asset_class==='crypto'?90000:MAX_AGE,
          change_24h:change??null,high_24h:high??null,low_24h:low??null,volume:volume??null});
        cache.set(`${market.asset_class}:${market.symbol}`,{value,fetched_at:Date.now(),expires:Date.now()+10000});
      }catch{/* an invalid row must not prevent other symbols from updating */}
    }
  }catch{/* callers retain the regular provider fallback path */}
}
