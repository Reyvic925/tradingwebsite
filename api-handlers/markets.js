import supabase from './db-client.js';
import { getUsdWallet, firstOpenPosition } from './helpers.js';
import { UNIVERSE } from './universe-data.js';
import { INTL_UNIVERSE, CLASS_MAP } from './intl-universe.js';
import { normalizeAssetClass } from './live-market-data.js';
import fetch from 'node-fetch';

const MARGIN_RATE = 0.1;
const SKIP = new Set(['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'JPM']);

// Map our symbols to Binance symbols
const BINANCE_SYMBOL_MAP = {
  'BTCUSD': 'BTCUSDT',
  'ETHUSD': 'ETHUSDT',
  'SOLUSD': 'SOLUSDT',
  'XRPUSD': 'XRPUSDT',
  'ADAUSD': 'ADAUSDT',
  'DOGEUSD': 'DOGEUSDT',
  'BNBUSD': 'BNBUSDT',
  'LINKUSD': 'LINKUSDT',
  'AVAXUSD': 'AVAXUSDT',
  'DOTUSD': 'DOTUSDT',
  'MATICUSD': 'MATICUSDT',
  'LTCUSD': 'LTCUSDT',
  'TRXUSD': 'TRXUSDT',
  'ATOMUSD': 'ATOMUSDT',
  'BCHUSD': 'BCHUSDT',
  'XLMUSD': 'XLMUSDT',
  'XMRUSD': 'XMRUSDT',
  'ZECUSD': 'ZECUSDT',
  'ETCUSD': 'ETCUSDT',
  'NEARUSD': 'NEARUSDT',
  'ICPUSD': 'ICPUSDT',
  'FILUSD': 'FILUSDT',
  'ALGOUSD': 'ALGOUSDT',
  'VETUSD': 'VETUSDT',
  'UNIUSD': 'UNIUSDT',
  'AAVEUSD': 'AAVEUSDT',
  'COMPUSD': 'COMPUSDT',
  'INJUSD': 'INJUSDT',
  'ARBUSD': 'ARBUSDT',
  'OPUSD': 'OPUSDT',
  'APTUSD': 'APTUSDT',
  'SUIUSD': 'SUIUSDT',
  'TIAUSD': 'TIAUSDT',
  'GALAUSD': 'GALAUSDT',
  'SANDUSD': 'SANDUSDT',
  'MANAUSD': 'MANAUSDT',
  'AXSUSD': 'AXSUSDT',
  'IMXUSD': 'IMXUSDT',
  'GRTUSD': 'GRTUSDT',
  'CRVUSD': 'CRVUSDT',
  'PEPEUSD': 'PEPEUSDT',
  'SHIBUSD': 'SHIBUSDT',
};

// Fetch live crypto prices from Binance
async function fetchLiveCryptoPrices() {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    if (!response.ok) throw new Error('Binance API error');
    const data = await response.json();
    
    const priceMap = {};
    data.forEach(ticker => {
      const symbol = ticker.symbol;
      // Find matching our symbol
      for (const [ourSymbol, binanceSymbol] of Object.entries(BINANCE_SYMBOL_MAP)) {
        if (binanceSymbol === symbol) {
          const price = parseFloat(ticker.lastPrice);
          const change = parseFloat(ticker.priceChangePercent);
          const high = parseFloat(ticker.highPrice);
          const low = parseFloat(ticker.lowPrice);
          const volume = parseFloat(ticker.quoteVolume || '0');
          
          priceMap[ourSymbol] = {
            price,
            change_24h: change,
            high_24h: high,
            low_24h: low,
            volume,
          };
          break;
        }
      }
    });
    return priceMap;
  } catch (error) {
    console.error('Failed to fetch Binance prices:', error.message);
    return {};
  }
}

function orderSideOf(positionSide) {
  return positionSide === 'long' || positionSide === 'buy' ? 'buy' : 'sell';
}

function isMissingSchemaError(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || err?.code === '42703' || /does not exist/.test(msg) || /relation .* does not exist/.test(msg) || /column .* does not exist/.test(msg);
}

async function syncMarketAssetClasses() {
  const { data: rows, error } = await supabase.from('markets').select('id, symbol, asset_class');
  if (error) return;

  for (const row of rows || []) {
    const normalized = normalizeAssetClass(row.symbol, row.asset_class || 'stock');
    if (!row.asset_class || row.asset_class !== normalized) {
      await supabase.from('markets').update({ asset_class: normalized }).eq('id', row.id);
    }
  }
}

async function ensureUniverse() {
  await syncMarketAssetClasses();

  // First, deduplicate any existing entries by symbol (keep highest volume)
  const { data: allMarkets, error: selectErr } = await supabase.from('markets').select('id, symbol, volume');
  if (!selectErr && allMarkets && allMarkets.length > 0) {
    const bySymbol = {};
    for (const m of allMarkets) {
      const sym = String(m.symbol || '').toUpperCase();
      if (!bySymbol[sym] || Number(m.volume || 0) > Number(bySymbol[sym].volume || 0)) {
        bySymbol[sym] = m;
      }
    }
    const keepIds = new Set(Object.values(bySymbol).map((m) => m.id));
    const deleteIds = allMarkets.filter((m) => !keepIds.has(m.id)).map((m) => m.id);
    if (deleteIds.length > 0) {
      await supabase.from('markets').delete().in('id', deleteIds);
      console.log(`Deduplicated ${deleteIds.length} duplicate market entries`);
    }
  }

  const { data: existing, error } = await supabase.from('markets').select('symbol');
  if (error) throw error;
  const have = new Set((existing || []).map((r) => r.symbol));
  const missing = BOOK.filter((r) => !have.has(r.symbol) && !SKIP.has(r.symbol));
  for (let i = 0; i < missing.length; i += 80) {
    const chunk = missing.slice(i, i + 80);
    const { error: iErr } = await supabase.from('markets').insert(chunk);
    if (iErr) console.error('universe seed chunk failed', iErr.message);
  }
}

async function fillPendingLimits(markets) {
  const { data: pending } = await supabase.from('orders').select('*').eq('status', 'pending').eq('type', 'limit').limit(40);
  if (!pending?.length) return;
  const byId = Object.fromEntries((markets || []).map((m) => [m.id, m]));

  for (const order of pending) {
    const market = byId[order.market_id];
    if (!market) continue;
    const px = Number(market.price);
    const limit = Number(order.price);
    const fill = order.side === 'buy' ? px <= limit : px >= limit;
    if (!fill) continue;

    const qty = Number(order.quantity);
    const fillPrice = limit;
    const margin = qty * fillPrice * MARGIN_RATE;

    const wallet = await getUsdWallet(supabase, order.user_id);
    if (!wallet || Number(wallet.available) < margin) {
      await supabase.from('orders').update({ status: 'rejected' }).eq('id', order.id);
      continue;
    }

    await supabase.from('wallets').update({
      available: Number(wallet.available) - margin,
      reserved: Number(wallet.reserved) + margin,
    }).eq('id', wallet.id);

    await supabase.from('orders').update({ status: 'filled', filled_price: fillPrice }).eq('id', order.id);

    const existing = await firstOpenPosition(supabase, order.user_id, order.market_id);

    if (!existing) {
      await supabase.from('positions').insert({
        user_id: order.user_id,
        market_id: order.market_id,
        symbol: order.symbol,
        side: order.side === 'buy' ? 'long' : 'short',
        quantity: qty,
        entry_price: fillPrice,
        current_price: fillPrice,
        stop_loss: order.stop_loss,
        take_profit: order.take_profit,
        pnl: 0,
        margin,
        status: 'open',
      });
    } else if (orderSideOf(existing.side) === order.side) {
      const newQty = Number(existing.quantity) + qty;
      const newEntry = (Number(existing.entry_price) * Number(existing.quantity) + fillPrice * qty) / newQty;
      await supabase.from('positions').update({
        quantity: newQty,
        entry_price: newEntry,
        current_price: fillPrice,
        margin: Number(existing.margin) + margin,
      }).eq('id', existing.id);
    } else {
      const dir = existing.side === 'long' || existing.side === 'buy' ? 1 : -1;
      const closeQty = Math.min(Number(existing.quantity), qty);
      const pnl = (fillPrice - Number(existing.entry_price)) * closeQty * dir;
      const released = (Number(existing.margin) * closeQty) / Number(existing.quantity);
      const w2 = await getUsdWallet(supabase, order.user_id);
      if (w2) {
        await supabase.from('wallets').update({
          available: Number(w2.available) + released + pnl,
          reserved: Math.max(0, Number(w2.reserved) - released),
        }).eq('id', w2.id);
      }
      if (closeQty >= Number(existing.quantity)) {
        await supabase.from('positions').update({
          status: 'closed', current_price: fillPrice, pnl, closed_at: new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        await supabase.from('positions').update({
          quantity: Number(existing.quantity) - closeQty,
          margin: Number(existing.margin) - released,
          current_price: fillPrice,
        }).eq('id', existing.id);
      }
    }

    await supabase.from('notifications').insert({
      user_id: order.user_id,
      title: `Limit ${order.side.toUpperCase()} ${order.symbol} filled`,
      body: `${qty} filled at ${fillPrice}`,
      read: false,
    });
  }
}

function applyTick(m) {
  // Tunable volatility: per-market override via m.volatility, otherwise fallback by asset class
  const baseVol = m?.volatility ? Number(m.volatility) : (m.asset_class === 'crypto' ? 0.004 : m.asset_class === 'forex' ? 0.0008 : 0.0016);

  // Hidden drift is intentionally neutral by default so prices do not trend one-way forever.
  const hiddenDrift = Number(m?.hidden_drift ?? 0);

  // Momentum approximation: use change_24h as a coarse momentum signal (percent)
  const momentumStrength = 0.3; // tuneable constant (smaller => less momentum influence)
  const momentum = (Number(m.change_24h || 0) / 100) * momentumStrength * (Math.random() * 0.6 + 0.7);

  // Mean-reversion: pull towards the 24h mid (high+low)/2 if available
  const meanReversionStrength = 0.25; // positive => stronger pull towards mean
  const high24 = Number(m.high_24h || m.price || 0);
  const low24 = Number(m.low_24h || m.price || 0);
  const mean = (high24 + low24) > 0 ? (high24 + low24) / 2 : Number(m.price || 0);
  const meanRev = mean > 0 ? ((mean - Number(m.price || 0)) / mean) * meanReversionStrength * (Math.random() * 0.6 + 0.7) : 0;

  // Random shock scaled by volatility (adds unpredictability)
  const shock = (Math.random() - 0.5) * baseVol * (1 + Math.random() * 0.5);

  const rawChange = hiddenDrift + momentum + meanRev + shock;
  const maxStep = m.asset_class === 'crypto' ? 0.035 : m.asset_class === 'forex' ? 0.01 : 0.015;
  const change = Math.max(-maxStep, Math.min(maxStep, rawChange));

  const price = Math.max(0.00000001, Number(m.price) * (1 + change));

  return {
    id: m.id,
    price,
    change_24h: Number(m.change_24h) + change * 100 * 0.15,
    high_24h: Math.max(Number(m.high_24h || price), price),
    low_24h: Math.min(Number(m.low_24h || price), price),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const params = req.query || Object.fromEntries(new URL(req.url || '/', 'http://localhost').searchParams.entries());
    req.query = params;

    if (req.method === 'POST') {
      try {
        await ensureUniverse();
        const { count } = await supabase.from('markets').select('*', { count: 'exact', head: true });
        return res.status(200).json({ ok: true, count: count || 0 });
      } catch (err) {
        if (isMissingSchemaError(err)) {
          return res.status(200).json({ ok: false, count: 0, message: 'markets table not initialized yet' });
        }
        throw err;
      }
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
      const { count, error: countErr } = await supabase.from('markets').select('*', { count: 'exact', head: true });
      if (countErr && !isMissingSchemaError(countErr)) {
        throw countErr;
      }
      if (!count || count === 0) {
        await ensureUniverse();
      }
    } catch (err) {
      if (!isMissingSchemaError(err)) throw err;
    }

    const q = String(params.q || '').trim();
    const assetClass = String(params.class || params.asset_class || 'all');
    const featured = params.featured === '1';
    // Disabled tick updates - they were causing dual pricing and performance issues
    const shouldTick = false;
    const limit = Math.min(500, Math.max(1, Number(params.limit) || (featured ? 12 : 120)));
    const offset = Math.max(0, Number(params.offset) || 0);
    const symbol = params.symbol ? String(params.symbol).toUpperCase() : '';

    // Fetch live crypto prices from Binance for crypto assets only
    const liveCryptoPrices = await fetchLiveCryptoPrices();
    
    let query = supabase.from('markets').select('*', { count: 'exact' });
    if (assetClass && assetClass !== 'all') {
      const mapped = CLASS_MAP[assetClass] || [assetClass];
      if (mapped.length === 1) query = query.eq('asset_class', mapped[0]);
      else query = query.in('asset_class', mapped);
    }
    if (q) {
      query = query.or(`symbol.ilike.%${q}%,name.ilike.%${q}%`);
    }
    if (symbol) query = query.eq('symbol', symbol);

    if (featured) query = query.order('volume', { ascending: false });
    else query = query.order('symbol', { ascending: true });

    query = query.range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) {
      if (isMissingSchemaError(error)) {
        return res.status(200).json({ items: [], total: 0, limit, offset });
      }
      throw error;
    }

    // Apply live Binance prices to crypto assets
    const items = (data || []).map((row) => {
      const sym = String(row.symbol || '').toUpperCase();
      const liveData = liveCryptoPrices[sym];
      
      // If it's a crypto asset and we have live data, use it
      if (row.asset_class === 'crypto' && liveData) {
        return {
          ...row,
          price: liveData.price,
          change_24h: liveData.change_24h,
          high_24h: liveData.high_24h,
          low_24h: liveData.low_24h,
          volume: liveData.volume,
        };
      }
      // Otherwise return database price (for stocks, forex, futures)
      return row;
    });

    res.setHeader('X-Total-Count', String(count || items.length));
    return res.status(200).json({
      items,
      total: count || items.length,
      limit,
      offset,
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

export { ensureUniverse, fillPendingLimits, applyTick };
