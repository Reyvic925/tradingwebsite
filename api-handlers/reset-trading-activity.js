import supabase from './db-client.js';
import { getAssetPrice, normalizeTradingSymbol } from './simulate.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const provided = (req.headers['x-cron-secret'] || req.query?.cron_secret || '').toString();
  if (!secret || provided !== secret) return res.status(401).json({ error: 'Invalid or missing cron secret' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { data: traders, error: tradersError } = await supabase
      .from('traders')
      .select('id, asset_focus')
      .eq('is_active', true);
    if (tradersError) throw tradersError;

    const { error: deleteTradesError } = await supabase
      .from('trade_logs')
      .delete()
      .not('id', 'is', null);
    if (deleteTradesError) throw deleteTradesError;

    const { error: deleteHistoryError } = await supabase
      .from('trader_history')
      .delete()
      .not('trader_id', 'is', null);
    if (deleteHistoryError) throw deleteHistoryError;

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const baselineTrades = [];
    const baselineCounts = new Map();
    const traderAssets = new Map();
    const symbols = new Set();

    for (const trader of traders || []) {
      const assets = Array.isArray(trader.asset_focus) && trader.asset_focus.length > 0
        ? trader.asset_focus
        : ['BTC-USD', 'ETH-USD'];
      const normalizedAssets = [...new Set(assets.map(normalizeTradingSymbol))];
      traderAssets.set(trader.id, normalizedAssets);
      normalizedAssets.forEach((asset) => symbols.add(asset));
    }

    const priceResults = await Promise.all([...symbols].map(async (symbol) => {
      try {
        const price = await getAssetPrice(symbol);
        if (!Number.isFinite(price) || price <= 0) {
          console.warn(`[RESET] Invalid price for ${symbol}: ${price}`);
          return [symbol, null];
        }
        return [symbol, price];
      } catch (error) {
        console.error(`[RESET] Could not price ${symbol}:`, error.message);
        return [symbol, null];
      }
    }));
    const prices = new Map(priceResults);

    // Only create baseline trades for symbols with valid prices
    for (const trader of traders || []) {
      for (const asset of traderAssets.get(trader.id) || []) {
        const price = prices.get(asset);
        if (!price || !Number.isFinite(price) || price <= 0) {
          console.warn(`[RESET] Skipping baseline trade for ${trader.id}/${asset}: no valid price`);
          continue;
        }
        baselineTrades.push({
          trader_id: trader.id,
          symbol: asset,
          side: 'BUY',
          quantity: 1,
          entry_price: Number(price.toFixed(4)),
          exit_price: Number(price.toFixed(4)),
          pnl: 0,
          pnl_percent: 0,
          status: 'CLOSED',
          traded_at: now,
          closed_at: now,
        });
        baselineCounts.set(trader.id, (baselineCounts.get(trader.id) || 0) + 1);
      }
    }

    if (baselineTrades.length) {
      const { error: insertError } = await supabase.from('trade_logs').insert(baselineTrades);
      if (insertError) throw insertError;
    }

    await Promise.all((traders || []).map(async (trader) => {
      const totalTrades = baselineCounts.get(trader.id) || 0;
      const { error: traderError } = await supabase.from('traders').update({
        current_equity: 10000,
        total_return: 0,
        daily_return: 0,
        total_trades: totalTrades,
        win_rate_trades: totalTrades ? 50 : 0,
        profit_for_copiers: 0,
        updated_at: now,
      }).eq('id', trader.id);
      if (traderError) throw traderError;

      const { error: historyError } = await supabase.from('trader_history').insert({
        trader_id: trader.id,
        snapshot_date: today,
        equity: 10000,
        daily_return: 0,
      });
      if (historyError) throw historyError;
    }));

    return res.status(200).json({
      success: true,
      tradersReset: (traders || []).length,
      baselineTrades: baselineTrades.length,
      resetAt: now,
    });
  } catch (error) {
    console.error('[RESET] Failed to reset trading activity:', error);
    return res.status(500).json({ error: error.message });
  }
}