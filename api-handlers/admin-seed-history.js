/**
 * Admin endpoint to seed trader history
 * POST /api/admin/seed-history
 * Requires: X-Admin-Secret header
 * 
 * Usage: curl -X POST https://yourapp.vercel.app/api/admin/seed-history \
 *   -H "X-Admin-Secret: $ADMIN_SECRET"
 */

import supabase from '../api-handlers/db-client.js';

// Realistic asset prices for seeding trades
const ASSET_PRICES = {
  'BTCUSD': 43200,
  'ETHUSD': 2280,
  'EURUSD': 1.0820,
  'GBPUSD': 1.2650,
  'XAUUSD': 2045.50,
  'WTIPRICE': 79.15,
  'BRENTPRICE': 83.40,
  'AAPL': 192.50,
  'MSFT': 378.90,
  'NVDA': 875.30,
  'TSLA': 248.70,
  'AMZN': 178.40,
  'SPX500': 4825.30,
  'NASDAQ': 15180.50,
  'DAX40': 17925.30,
  'CAC40': 7345.20,
  'SOL': 98.50,
  'AVAX': 28.75,
  'BNB': 612.40,
  'MATIC': 0.8920,
};

function normalizeSymbol(symbol) {
  return String(symbol || '').toUpperCase().replace(/[-/]/g, '');
}

function getAssetPrice(symbol) {
  const normalized = normalizeSymbol(symbol);
  return ASSET_PRICES[normalized] || null;
}

function generateTrades(trader, daysBack = 7) {
  const trades = [];
  const assetsToTrade = Array.isArray(trader.asset_focus) && trader.asset_focus.length > 0
    ? trader.asset_focus
    : ['BTC-USD', 'ETH-USD'];

  const baseTradeCount = trader.total_trades || 0;
  const winRate = (trader.win_rate_trades || 50) / 100;
  const tradesPerDay = Math.ceil(baseTradeCount / Math.max(daysBack, 1));

  let tradeId = 0;
  for (let day = daysBack; day >= 0; day--) {
    const tradeDate = new Date();
    tradeDate.setDate(tradeDate.getDate() - day);

    const numTrades = Math.max(1, Math.floor(tradesPerDay + (Math.random() - 0.5) * 2));
    for (let t = 0; t < numTrades && tradeId < baseTradeCount; t++, tradeId++) {
      const asset = assetsToTrade[tradeId % assetsToTrade.length];
      const basePrice = getAssetPrice(asset);
      if (!basePrice) continue;

      const isWin = Math.random() < winRate;
      const priceMove = isWin 
        ? Math.random() * 0.03 + 0.001
        : -(Math.random() * 0.04 + 0.001);

      const entryPrice = basePrice * (1 + (Math.random() - 0.5) * 0.001);
      const exitPrice = entryPrice * (1 + priceMove);
      const quantity = Math.random() < 0.5 ? 1 : Math.ceil(Math.random() * 5);
      const pnl = (exitPrice - entryPrice) * quantity;
      const pnlPercent = (priceMove * 100);

      const tradeTime = new Date(tradeDate);
      tradeTime.setHours(Math.floor(Math.random() * 16) + 8, Math.floor(Math.random() * 60));

      trades.push({
        trader_id: trader.id,
        symbol: asset,
        side: 'BUY',
        quantity: Number(quantity.toFixed(6)),
        entry_price: Number(entryPrice.toFixed(4)),
        exit_price: Number(exitPrice.toFixed(4)),
        pnl: Number(pnl.toFixed(2)),
        pnl_percent: Number(pnlPercent.toFixed(2)),
        status: 'CLOSED',
        traded_at: tradeTime.toISOString(),
        closed_at: new Date(tradeTime.getTime() + Math.random() * 3600000).toISOString(),
      });
    }
  }

  return trades.slice(0, baseTradeCount);
}

function generateHistorySnapshots(trader, daysBack = 7) {
  const snapshots = [];
  const startEquity = 10000;
  let currentEquity = startEquity;

  for (let day = daysBack; day >= 0; day--) {
    const snapshotDate = new Date();
    snapshotDate.setDate(snapshotDate.getDate() - day);
    const dateStr = snapshotDate.toISOString().slice(0, 10);

    const totalReturnPercent = trader.total_return || 0;
    const dailyDriftPercent = (totalReturnPercent / Math.max(daysBack, 1)) / 100;
    const dayVolatility = (Math.random() - 0.5) * 0.02;
    
    currentEquity = currentEquity * (1 + dailyDriftPercent + dayVolatility);
    const dailyReturn = (currentEquity - startEquity) / startEquity * 100;

    snapshots.push({
      trader_id: trader.id,
      snapshot_date: dateStr,
      equity: Number(currentEquity.toFixed(2)),
      daily_return: Number(dailyReturn.toFixed(2)),
    });
  }

  return snapshots;
}

export default async function handler(req, res) {
  const adminSecret = process.env.ADMIN_SECRET;
  const provided = (req.headers['x-admin-secret'] || '').toString();
  
  if (!adminSecret || provided !== adminSecret) {
    return res.status(401).json({ error: 'Invalid or missing admin secret' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const daysBack = req.query.days ? parseInt(req.query.days) : 7;
    console.log(`[SEED] Starting trader history seeding (${daysBack} days)...`);

    // Fetch all active traders
    const { data: traders, error: traderError } = await supabase
      .from('traders')
      .select('id, name, total_trades, win_rate_trades, total_return, asset_focus')
      .eq('is_active', true);

    if (traderError) throw traderError;
    console.log(`[SEED] Found ${traders.length} active traders`);

    // Clear existing trade_logs and trader_history (optional, based on query param)
    if (req.query.clear === 'true') {
      console.log('[SEED] Clearing existing trade history...');
      await supabase.from('trade_logs').delete().neq('id', -1);
      await supabase.from('trader_history').delete().neq('trader_id', '');
    }

    let totalTrades = 0;
    let totalSnapshots = 0;
    const batchSize = 500;

    // Process traders in batches (reduce memory usage for serverless)
    for (let i = 0; i < traders.length; i += 5) {
      const batch = traders.slice(i, Math.min(i + 5, traders.length));
      const allBatchTrades = [];
      const allBatchSnapshots = [];

      for (const trader of batch) {
        const trades = generateTrades(trader, daysBack);
        const snapshots = generateHistorySnapshots(trader, daysBack);
        allBatchTrades.push(...trades);
        allBatchSnapshots.push(...snapshots);
      }

      // Insert trades in smaller batches
      for (let j = 0; j < allBatchTrades.length; j += batchSize) {
        const tradeBatch = allBatchTrades.slice(j, Math.min(j + batchSize, allBatchTrades.length));
        const { error: tradeInsertError } = await supabase
          .from('trade_logs')
          .insert(tradeBatch);
        if (tradeInsertError) throw tradeInsertError;
        totalTrades += tradeBatch.length;
      }

      // Insert snapshots in smaller batches
      for (let j = 0; j < allBatchSnapshots.length; j += batchSize) {
        const snapshotBatch = allBatchSnapshots.slice(j, Math.min(j + batchSize, allBatchSnapshots.length));
        const { error: snapshotInsertError } = await supabase
          .from('trader_history')
          .insert(snapshotBatch);
        if (snapshotInsertError) throw snapshotInsertError;
        totalSnapshots += snapshotBatch.length;
      }

      console.log(`[SEED] Processed ${Math.min(i + 5, traders.length)}/${traders.length} traders`);
    }

    return res.status(200).json({
      success: true,
      tradersSeeded: traders.length,
      totalTrades,
      totalSnapshots,
      daysBack,
      message: `Seeded ${traders.length} traders with ${totalTrades} trades and ${totalSnapshots} snapshots`
    });

  } catch (error) {
    console.error('[SEED] Failed:', error);
    return res.status(500).json({ error: error.message });
  }
}
