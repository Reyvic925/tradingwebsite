const COIN_GECKO_IDS = {
  BTCUSD: 'bitcoin',
  ETHUSD: 'ethereum',
  SOLUSD: 'solana',
  XRPUSD: 'ripple',
  ADAUSD: 'cardano',
  DOGEUSD: 'dogecoin',
  BNBUSD: 'binancecoin',
  LINKUSD: 'chainlink',
  AVAXUSD: 'avalanche-2',
  DOTUSD: 'polkadot',
  MATICUSD: 'matic-network',
  LTCUSD: 'litecoin',
  TRXUSD: 'tron',
  ATOMUSD: 'cosmos',
  BCHUSD: 'bitcoin-cash',
  XLMUSD: 'stellar',
  XMRUSD: 'monero',
  ZECUSD: 'zcash',
  ETCUSD: 'ethereum-classic',
  NEARUSD: 'near',
  ICPUSD: 'internet-computer',
  FILUSD: 'filecoin',
  ALGOUSD: 'algorand',
  VETUSD: 'vechain',
  UNIUSD: 'uniswap',
  AAVEUSD: 'aave',
  COMPUSD: 'compound-governance-token',
  INJUSD: 'injective-protocol',
  ARBUSD: 'arbitrum',
  OPUSD: 'optimism',
  APTUSD: 'aptos',
  SUIUSD: 'sui',
  TIAUSD: 'celestia',
  GALAUSD: 'gala',
  SANDUSD: 'the-sandbox',
  MANAUSD: 'decentraland',
  AXSUSD: 'axie-infinity',
  IMXUSD: 'immutable-x',
  GRTUSD: 'the-graph',
  CRVUSD: 'curve-dao-token',
  PEPEUSD: 'pepe',
  SHIBUSD: 'shiba-inu',
};

const FX_SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'USDCNH', 'USDMXN', 'USDZAR', 'USDSEK', 'USDNOK', 'USDPLN', 'USDSGD', 'USDHKD', 'USDTRY', 'EURCHF', 'EURAUD', 'EURCAD', 'EURNZD', 'EURSEK', 'EURNOK', 'EURPLN', 'GBPCHF', 'GBPAUD', 'GBPCAD', 'GBPNZD', 'CHFJPY', 'CADJPY', 'NZDJPY'];

const CRYPTO_SYMBOLS = new Set(Object.keys(COIN_GECKO_IDS));

export function normalizeAssetClass(symbol, fallback = 'stock') {
  const upper = String(symbol || '').toUpperCase();
  const value = String(fallback || '').toLowerCase();

  if (value === 'forex' || value === 'crypto' || value === 'stock' || value === 'etf') {
    return value === 'stock' ? 'stock' : value;
  }

  if (CRYPTO_SYMBOLS.has(upper)) return 'crypto';
  if (FX_SYMBOLS.includes(upper)) return 'forex';
  if (upper.includes('USD') && upper.length <= 6) return 'forex';
  if (upper.includes('USD') && upper.length > 6) return 'forex';
  if (upper.includes('JPY') || upper.includes('CHF') || upper.includes('CAD') || upper.includes('AUD') || upper.includes('NZD') || upper.includes('GBP') || upper.includes('EUR')) {
    return 'forex';
  }

  if (value === 'equity') return 'stock';
  return value === 'etf' ? 'etf' : 'stock';
}

const symbolPrecision = (symbol) => {
  const upper = String(symbol || '').toUpperCase();
  return ['JPY', 'CHF', 'SEK', 'NOK', 'PLN', 'HKD', 'TRY', 'CNH', 'MXN', 'ZAR', 'SGD', 'CAD', 'AUD', 'NZD'].some((k) => upper.includes(k)) ? 4 : upper.includes('USD') && upper.length > 6 ? 4 : 6;
};

function getMarketProfile(symbol) {
  const upper = String(symbol || '').toUpperCase();
  const normalizedClass = normalizeAssetClass(upper, 'stock');
  if (normalizedClass === 'forex') return { asset_class: 'forex', spreadPct: upper.includes('USD') && upper.length > 6 ? 0.0009 : 0.0006, baseVol: upper.includes('USD') && upper.length > 6 ? 0.0016 : 0.0012, volumeScale: upper.includes('USD') && upper.length > 6 ? 0.75 : 1 };
  if (normalizedClass === 'crypto') return { asset_class: 'crypto', spreadPct: 0.0018, baseVol: 0.0048, volumeScale: 2.8 };
  return { asset_class: 'stock', spreadPct: 0.0012, baseVol: 0.0024, volumeScale: 1.6 };
}

function createBrokerStyleSnapshot(symbol, price, liveChange, volume) {
  const profile = getMarketProfile(symbol);
  const drift = (Math.random() - 0.5) * 0.0022;
  const sentiment = (Number(liveChange || 0) / 100) * 0.35;
  const spreadPct = profile.spreadPct * (1 + (Math.random() * 0.7));
  const spread = Math.max(price * spreadPct, Number.EPSILON);
  const bid = price * (1 - spreadPct * 0.42);
  const ask = price * (1 + spreadPct * 0.58);
  const brokerVolume = Math.max(5, Number(volume || 0) * profile.volumeScale * (0.6 + Math.random() * 0.8));

  return {
    symbol: String(symbol || '').toUpperCase(),
    price,
    change_24h: Number((liveChange + drift * 100 + sentiment * 100).toFixed(4)),
    high_24h: Number((price * (1 + Math.abs((liveChange || 0)) / 180 + Math.random() * 0.008)).toFixed(6)),
    low_24h: Number((price * (1 - Math.abs((liveChange || 0)) / 180 - Math.random() * 0.008)).toFixed(6)),
    volume: Number(brokerVolume.toFixed(2)),
    spread_pct: Number(spreadPct.toFixed(6)),
    bid: Number(bid.toFixed(6)),
    ask: Number(ask.toFixed(6)),
    liquidity: Math.random() > 0.6 ? 'high' : Math.random() > 0.25 ? 'normal' : 'thin',
    source: 'live',
    asset_class: profile.asset_class,
  };
}

export function buildQuoteMap(rows = []) {
  return Object.fromEntries((rows || []).map((row) => {
    const symbol = String(row.symbol || '').toUpperCase();
    return [symbol, {
      symbol,
      price: Number(row.price || 0),
      change_24h: Number(row.change_24h || 0),
      high_24h: Number(row.high_24h || row.price || 0),
      low_24h: Number(row.low_24h || row.price || 0),
      volume: Number(row.volume || 0),
      source: row.source || 'seed',
    }];
  }));
}

function normalizeSymbolPair(base, liveValue) {
  const price = Number(liveValue || 0);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, change_24h: 0.1 + (Math.random() * 1.2), high_24h: price * 1.01, low_24h: price * 0.99, source: 'live' };
}

async function fetchCoinGeckoQuotes() {
  const ids = Object.values(COIN_GECKO_IDS).join(',');
  if (!ids) return {};

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`CoinGecko request failed (${res.status})`);

  const payload = await res.json();
  const result = {};
  for (const [symbol, id] of Object.entries(COIN_GECKO_IDS)) {
    const entry = payload?.[id];
    if (!entry || !Number.isFinite(Number(entry.usd))) continue;

    const price = Number(entry.usd);
    const change24 = Number(entry.usd_24h_change || 0);
    result[symbol] = {
      symbol,
      price,
      change_24h: Number(change24 || (Math.random() * 2 - 1)),
      high_24h: price * (1 + Math.abs(change24 || 0.8) / 100),
      low_24h: price * (1 - Math.abs(change24 || 0.8) / 100),
      volume: Number(entry.usd_24h_vol || 0),
      source: 'live',
    };
  }
  return result;
}

async function fetchFrankfurterQuotes() {
  const url = 'https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,AUD,CAD,CHF,NZD,SEK,NOK,PLN,SGD,HKD,TRY,MXN,ZAR';
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Frankfurter request failed (${res.status})`);

  const payload = await res.json();
  const rates = payload?.rates || {};
  const result = {};

  const pairMap = {
    EURUSD: (rate) => (1 / rate.EUR),
    GBPUSD: (rate) => (1 / rate.GBP),
    AUDUSD: (rate) => (1 / rate.AUD),
    USDCAD: (rate) => (1 / rate.CAD),
    USDCHF: (rate) => (1 / rate.CHF),
    NZDUSD: (rate) => (1 / rate.NZD),
    USDJPY: (rate) => (1 / rate.JPY),
    EURGBP: (rate) => (rate.EUR / rate.GBP),
    EURJPY: (rate) => (rate.EUR / rate.JPY),
    GBPJPY: (rate) => (rate.GBP / rate.JPY),
    AUDJPY: (rate) => (rate.AUD / rate.JPY),
    USDCNH: (rate) => (1 / rate.CNH),
    USDMXN: (rate) => (1 / rate.MXN),
    USDZAR: (rate) => (1 / rate.ZAR),
    USDSEK: (rate) => (1 / rate.SEK),
    USDNOK: (rate) => (1 / rate.NOK),
    USDPLN: (rate) => (1 / rate.PLN),
    USDSGD: (rate) => (1 / rate.SGD),
    USDHKD: (rate) => (1 / rate.HKD),
    USDTRY: (rate) => (1 / rate.TRY),
    EURCHF: (rate) => (rate.EUR / rate.CHF),
    EURAUD: (rate) => (rate.EUR / rate.AUD),
    EURCAD: (rate) => (rate.EUR / rate.CAD),
    EURNZD: (rate) => (rate.EUR / rate.NZD),
    EURSEK: (rate) => (rate.EUR / rate.SEK),
    EURNOK: (rate) => (rate.EUR / rate.NOK),
    EURPLN: (rate) => (rate.EUR / rate.PLN),
    GBPCHF: (rate) => (rate.GBP / rate.CHF),
    GBPAUD: (rate) => (rate.GBP / rate.AUD),
    GBPCAD: (rate) => (rate.GBP / rate.CAD),
    GBPNZD: (rate) => (rate.GBP / rate.NZD),
    CHFJPY: (rate) => (rate.CHF / rate.JPY),
    CADJPY: (rate) => (rate.CAD / rate.JPY),
    NZDJPY: (rate) => (rate.NZD / rate.JPY),
  };

  for (const symbol of FX_SYMBOLS) {
    const fn = pairMap[symbol];
    if (!fn || !rates) continue;
    const value = fn(rates);
    if (!Number.isFinite(value) || value <= 0) continue;
    result[symbol] = {
      symbol,
      price: Number(value),
      change_24h: Number((Math.random() * 0.8 - 0.2).toFixed(4)),
      high_24h: Number((value * 1.005).toFixed(6)),
      low_24h: Number((value * 0.995).toFixed(6)),
      volume: 0,
      source: 'live',
    };
  }
  return result;
}

export async function fetchLiveMarketSnapshot() {
  try {
    const [crypto, fx] = await Promise.all([
      fetchCoinGeckoQuotes().catch(() => ({})),
      fetchFrankfurterQuotes().catch(() => ({})),
    ]);
    return { ...crypto, ...fx };
  } catch {
    return {};
  }
}

export function blendLiveQuote(baseQuote, liveQuote) {
  const base = baseQuote || {};
  const current = Number(base.price || 0);
  const livePrice = Number(liveQuote?.price || 0);

  if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(livePrice) || livePrice <= 0) {
    return { ...base, source: base?.source || 'simulated' };
  }

  // For live data, heavily weight towards the real price (85% live, 15% momentum bias)
  const assetClass = base.asset_class || 'equity';
  const liveWeight = assetClass === 'crypto' ? 0.95 : assetClass === 'forex' ? 0.92 : 0.85;
  const brokerPulse = (Math.random() - 0.5) * 0.006; // smaller random noise
  const blendedPrice = (livePrice * liveWeight) + (current * (1 - liveWeight)) + (livePrice * brokerPulse);
  const finalPrice = Math.max(0.00000001, Number(blendedPrice));
  const change = Number(liveQuote?.change_24h || 0);
  const baseHigh = Number(base.high_24h || current || 0);
  const baseLow = Number(base.low_24h || current || 0);
  const precision = symbolPrecision(base.symbol);
  const brokerSnapshot = createBrokerStyleSnapshot(base.symbol, finalPrice, change, Number(liveQuote?.volume || base.volume || 0));

  const normalizedClass = normalizeAssetClass(base.symbol, base.asset_class || 'stock');

  return {
    ...base,
    ...brokerSnapshot,
    asset_class: normalizedClass,
    price: Number(finalPrice.toFixed(precision)),
    change_24h: Number(change.toFixed(4)),
    high_24h: Number(Math.max(baseHigh, finalPrice * 1.004).toFixed(precision)),
    low_24h: Number(Math.min(baseLow, finalPrice * 0.996).toFixed(precision)),
    source: liveQuote ? 'live' : 'simulated',
  };
}

export function normalizeQuoteMap(rows = []) {
  const map = buildQuoteMap(rows);
  Object.keys(map).forEach((symbol) => {
    const entry = map[symbol];
    if (!entry.price) delete map[symbol];
  });
  return map;
}
