import supabase from './db-client.js';
import { getUsdWallet, firstOpenPosition } from './helpers.js';
import { UNIVERSE } from './universe-data.js';
import { INTL_UNIVERSE, CLASS_MAP } from './intl-universe.js';
import { fetchLiveMarketSnapshot, blendLiveQuote } from './live-market-data.js';

const MARGIN_RATE = 0.1;
const SKIP = new Set(['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'JPM']);

function pairRow(symbol, name, asset_class, price, volume) {
  const ch = Number(((Math.sin(symbol.length * 2.2 + price / 100) * 1.8) + 0.5).toFixed(2));
  return {
    symbol,
    name,
    asset_class,
    price,
    change_24h: ch,
    volume,
    high_24h: Number((price * 1.01).toFixed(4)),
    low_24h: Number((price * 0.99).toFixed(4)),
  };
}

const FOREX_PAIRS = [
  pairRow('EURUSD', 'Euro / US Dollar', 'forex', 1.0863, 184000000),
  pairRow('GBPUSD', 'British Pound / US Dollar', 'forex', 1.2724, 152000000),
  pairRow('USDJPY', 'US Dollar / Japanese Yen', 'forex', 147.18, 196000000),
  pairRow('AUDUSD', 'Australian Dollar / US Dollar', 'forex', 0.6668, 82000000),
  pairRow('USDCAD', 'US Dollar / Canadian Dollar', 'forex', 1.3688, 76000000),
  pairRow('USDCHF', 'US Dollar / Swiss Franc', 'forex', 0.9056, 68000000),
  pairRow('NZDUSD', 'New Zealand Dollar / US Dollar', 'forex', 0.6124, 46000000),
  pairRow('EURGBP', 'Euro / British Pound', 'forex', 0.8538, 36000000),
  pairRow('EURJPY', 'Euro / Japanese Yen', 'forex', 159.92, 54000000),
  pairRow('GBPJPY', 'British Pound / Japanese Yen', 'forex', 187.38, 42000000),
  pairRow('AUDJPY', 'Australian Dollar / Japanese Yen', 'forex', 98.18, 38000000),
  pairRow('XAUUSD', 'Gold / US Dollar', 'forex', 2347.8, 64000000),
  pairRow('XAGUSD', 'Silver / US Dollar', 'forex', 27.86, 38000000),
  pairRow('XPTUSD', 'Platinum / US Dollar', 'forex', 972.4, 6200000),
  pairRow('XPDUSD', 'Palladium / US Dollar', 'forex', 998.2, 4800000),
  pairRow('USDCNH', 'US Dollar / Chinese Yuan', 'forex', 7.2412, 21000000),
  pairRow('USDMXN', 'US Dollar / Mexican Peso', 'forex', 17.024, 14000000),
  pairRow('USDZAR', 'US Dollar / South African Rand', 'forex', 18.426, 9200000),
  pairRow('USDSEK', 'US Dollar / Swedish Krona', 'forex', 10.482, 8600000),
  pairRow('USDNOK', 'US Dollar / Norwegian Krone', 'forex', 10.624, 7400000),
  pairRow('USDPLN', 'US Dollar / Polish Zloty', 'forex', 3.9418, 6800000),
  pairRow('USDSGD', 'US Dollar / Singapore Dollar', 'forex', 1.3482, 12400000),
  pairRow('USDHKD', 'US Dollar / Hong Kong Dollar', 'forex', 7.8114, 9600000),
  pairRow('USDTRY', 'US Dollar / Turkish Lira', 'forex', 32.364, 5400000),
  pairRow('EURCHF', 'Euro / Swiss Franc', 'forex', 0.9624, 18400000),
  pairRow('EURAUD', 'Euro / Australian Dollar', 'forex', 1.6328, 8600000),
  pairRow('EURCAD', 'Euro / Canadian Dollar', 'forex', 1.4866, 7800000),
  pairRow('EURNZD', 'Euro / New Zealand Dollar', 'forex', 1.7732, 4200000),
  pairRow('EURSEK', 'Euro / Swedish Krona', 'forex', 11.384, 3600000),
  pairRow('EURNOK', 'Euro / Norwegian Krone', 'forex', 11.542, 2800000),
  pairRow('EURPLN', 'Euro / Polish Zloty', 'forex', 4.2814, 3200000),
  pairRow('GBPCHF', 'British Pound / Swiss Franc', 'forex', 1.1512, 5800000),
  pairRow('GBPAUD', 'British Pound / Australian Dollar', 'forex', 1.9042, 3800000),
  pairRow('GBPCAD', 'British Pound / Canadian Dollar', 'forex', 1.7346, 3400000),
  pairRow('GBPNZD', 'British Pound / New Zealand Dollar', 'forex', 2.0706, 2200000),
  pairRow('CHFJPY', 'Swiss Franc / Japanese Yen', 'forex', 162.52, 4800000),
  pairRow('CADJPY', 'Canadian Dollar / Japanese Yen', 'forex', 107.68, 4200000),
  pairRow('NZDJPY', 'New Zealand Dollar / Japanese Yen', 'forex', 90.22, 2800000),
];

const CRYPTO_PAIRS = [
  pairRow('BTCUSD', 'Bitcoin / US Dollar', 'crypto', 67340.2, 2980000000),
  pairRow('ETHUSD', 'Ethereum / US Dollar', 'crypto', 3528.4, 1840000000),
  pairRow('SOLUSD', 'Solana / US Dollar', 'crypto', 168.4, 980000000),
  pairRow('XRPUSD', 'XRP / US Dollar', 'crypto', 0.64, 820000000),
  pairRow('ADAUSD', 'Cardano / US Dollar', 'crypto', 0.74, 420000000),
  pairRow('DOGEUSD', 'Dogecoin / US Dollar', 'crypto', 0.18, 760000000),
  pairRow('BNBUSD', 'Binance Coin / US Dollar', 'crypto', 610.2, 520000000),
  pairRow('LINKUSD', 'Chainlink / US Dollar', 'crypto', 18.8, 360000000),
  pairRow('AVAXUSD', 'Avalanche / US Dollar', 'crypto', 36.4, 220000000),
  pairRow('DOTUSD', 'Polkadot / US Dollar', 'crypto', 8.4, 280000000),
  pairRow('MATICUSD', 'Polygon / US Dollar', 'crypto', 0.98, 240000000),
  pairRow('LTCUSD', 'Litecoin / US Dollar', 'crypto', 92.8, 180000000),
  pairRow('TRXUSD', 'TRON / US Dollar', 'crypto', 0.16, 200000000),
  pairRow('ATOMUSD', 'Cosmos / US Dollar', 'crypto', 9.8, 180000000),
  pairRow('BCHUSD', 'Bitcoin Cash / US Dollar', 'crypto', 462.8, 320000000),
  pairRow('XLMUSD', 'Stellar / US Dollar', 'crypto', 0.11, 240000000),
  pairRow('XMRUSD', 'Monero / US Dollar', 'crypto', 168.4, 96000000),
  pairRow('ZECUSD', 'Zcash / US Dollar', 'crypto', 30.4, 64000000),
  pairRow('ETCUSD', 'Ethereum Classic / US Dollar', 'crypto', 26.4, 120000000),
  pairRow('NEARUSD', 'NEAR Protocol / US Dollar', 'crypto', 5.2, 180000000),
  pairRow('ICPUSD', 'Internet Computer / US Dollar', 'crypto', 9.8, 84000000),
  pairRow('FILUSD', 'Filecoin / US Dollar', 'crypto', 4.62, 92000000),
  pairRow('ALGOUSD', 'Algorand / US Dollar', 'crypto', 0.15, 78000000),
  pairRow('VETUSD', 'VeChain / US Dollar', 'crypto', 0.026, 82000000),
  pairRow('UNIUSD', 'Uniswap / US Dollar', 'crypto', 9.24, 140000000),
  pairRow('AAVEUSD', 'Aave / US Dollar', 'crypto', 92.4, 98000000),
  pairRow('COMPUSD', 'Compound / US Dollar', 'crypto', 52.8, 42000000),
  pairRow('INJUSD', 'Injective / US Dollar', 'crypto', 21.4, 56000000),
  pairRow('ARBUSD', 'Arbitrum / US Dollar', 'crypto', 0.82, 164000000),
  pairRow('OPUSD', 'Optimism / US Dollar', 'crypto', 1.78, 128000000),
  pairRow('APTUSD', 'Aptos / US Dollar', 'crypto', 7.24, 88000000),
  pairRow('SUIUSD', 'Sui / US Dollar', 'crypto', 1.62, 186000000),
  pairRow('TIAUSD', 'Celestia / US Dollar', 'crypto', 6.84, 62000000),
  pairRow('GALAUSD', 'Gala / US Dollar', 'crypto', 0.028, 74000000),
  pairRow('SANDUSD', 'The Sandbox / US Dollar', 'crypto', 0.32, 58000000),
  pairRow('MANAUSD', 'Decentraland / US Dollar', 'crypto', 0.38, 48000000),
  pairRow('AXSUSD', 'Axie Infinity / US Dollar', 'crypto', 5.82, 42000000),
  pairRow('IMXUSD', 'Immutable / US Dollar', 'crypto', 1.42, 46000000),
  pairRow('GRTUSD', 'The Graph / US Dollar', 'crypto', 0.18, 52000000),
  pairRow('CRVUSD', 'Curve DAO / US Dollar', 'crypto', 0.24, 44000000),
  pairRow('PEPEUSD', 'Pepe / US Dollar', 'crypto', 0.0000082, 620000000),
  pairRow('SHIBUSD', 'Shiba Inu / US Dollar', 'crypto', 0.0000186, 380000000),
];

const BOOK = [...UNIVERSE, ...INTL_UNIVERSE, ...FOREX_PAIRS, ...CRYPTO_PAIRS];

function orderSideOf(positionSide) {
  return positionSide === 'long' || positionSide === 'buy' ? 'buy' : 'sell';
}

function isMissingSchemaError(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || err?.code === '42703' || /does not exist/.test(msg) || /relation .* does not exist/.test(msg) || /column .* does not exist/.test(msg);
}

async function ensureUniverse() {
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
      await ensureUniverse();
    } catch (err) {
      if (!isMissingSchemaError(err)) throw err;
    }

    const q = String(params.q || '').trim();
    const assetClass = String(params.class || params.asset_class || 'all');
    const featured = params.featured === '1';
    const shouldTick = params.tick === '1';
    const limit = Math.min(500, Math.max(1, Number(params.limit) || (featured ? 12 : 120)));
    const offset = Math.max(0, Number(params.offset) || 0);
    const symbol = params.symbol ? String(params.symbol).toUpperCase() : '';

    const liveMap = await fetchLiveMarketSnapshot().catch(() => ({}));

    if (shouldTick) {
      const { data: all } = await supabase.from('markets').select('id, asset_class, price, change_24h, high_24h, low_24h');
      const pool = all || [];
      const sample = [];
      const n = Math.min(36, pool.length);
      const used = new Set();
      while (sample.length < n && used.size < pool.length) {
        const i = Math.floor(Math.random() * pool.length);
        if (used.has(i)) continue;
        used.add(i);
        sample.push(pool[i]);
      }
      if (symbol) {
        const hit = pool.find((m) => m.symbol === symbol);
        if (hit && !sample.some((s) => s.id === hit.id)) sample.push(hit);
      }
      await Promise.all(sample.map((m) => {
        const liveQuote = liveMap[String(m.symbol).toUpperCase()];
        const visualMarket = liveQuote ? blendLiveQuote(m, liveQuote) : m;
        const u = applyTick({ ...m, ...visualMarket });
        return supabase.from('markets').update({
          price: u.price,
          change_24h: u.change_24h,
          high_24h: u.high_24h,
          low_24h: u.low_24h,
        }).eq('id', u.id);
      }));
    }

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

    if (shouldTick) await fillPendingLimits(data || []);

    const items = (data || []).map((row) => {
      const liveQuote = liveMap[String(row.symbol || '').toUpperCase()];
      if (!liveQuote) return row;
      return { ...row, ...blendLiveQuote(row, liveQuote) };
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
