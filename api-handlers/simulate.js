/**
 * Copy Trading Simulation Engine - Cron Handler
 * Runs every 1 minute to simulate market movements and update PnL
 * 
 * For Vercel: Add to vercel.json crons
 * For traditional servers: Use a cron scheduler (node-cron, node-schedule, etc.)
 */

import supabase from './db-client.js';
import { calculateCopyFollowerValue } from './copy-trading-tick.js';
import {
  isTraderEligible,
  calculateMarketChange,
  generateRealisticEntryPrice
} from './session-utils.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const provided = (req.headers['x-cron-secret'] || req.query?.cron_secret || '').toString();
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Invalid or missing cron secret' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[CRON] Starting continuous copy trading tick...');

    // Step 1: Fetch all active traders
    const { data: traders, error: traderError } = await supabase
      .from('traders')
      .select('*')
      .eq('is_active', true);

    if (traderError) throw traderError;

    let simulatedTraders = 0;
    let skippedTraders = 0;
    let generatedTrades = 0;
    let updatedCopies = 0;

    // Step 2: Process each trader
    for (const trader of traders || []) {
      if (!isTraderEligible(trader)) {
        skippedTraders++;
        console.log(`[CRON] Skipping ${trader.id} (${trader.name}): ${trader.session_type} session is closed`);
        continue;
      }

      console.log(`[CRON] Processing trader ${trader.id} (${trader.name})`);
      simulatedTraders++;

      // Step 2A: Calculate market change
      const changePercent = calculateMarketChange(trader);
      const oldEquity = Number(trader.current_equity);
      const newEquity = oldEquity * (1 + changePercent);
      const pnlDelta = newEquity - oldEquity;

      console.log(`[CRON] Trader ${trader.id}: ${(changePercent * 100).toFixed(3)}% change, PnL delta: $${pnlDelta.toFixed(2)}`);

      // Step 2B: Record the completed BUY or SELL that produced this P&L tick.
      if (Math.abs(pnlDelta) > 0.01) {
        const isProfit = pnlDelta > 0;
        const assetList = Array.isArray(trader.asset_focus) && trader.asset_focus.length > 0
          ? trader.asset_focus
          : ['BTC-USD', 'ETH-USD', 'AAPL', 'MSFT'];
        const symbol = assetList[Math.floor(Math.random() * assetList.length)];

        // Get or simulate current price
        let currentPrice = await getAssetPrice(symbol);

        // Generate realistic entry price
        const entryPrice = generateRealisticEntryPrice(currentPrice, Math.abs(changePercent), isProfit);

        // Calculate quantity
        const priceDiff = Math.abs(currentPrice - entryPrice);
        const quantity = priceDiff > 0 ? Math.abs(pnlDelta) / priceDiff : 1;

        // Insert trade log
        const { error: tradeError } = await supabase
          .from('trade_logs')
          .insert({
            trader_id: trader.id,
            symbol,
            side: isProfit ? 'BUY' : 'SELL',
            quantity: Number(quantity.toFixed(4)),
            entry_price: Number(entryPrice.toFixed(4)),
            exit_price: Number(currentPrice.toFixed(4)),
            pnl: Number(pnlDelta.toFixed(2)),
            pnl_percent: ((pnlDelta / oldEquity) * 100).toFixed(2),
            status: 'CLOSED',
            traded_at: new Date().toISOString(),
            closed_at: new Date().toISOString()
          });

        if (tradeError) {
          console.error(`[CRON] Error inserting trade for trader ${trader.id}:`, tradeError);
        } else {
          generatedTrades++;
          console.log(`[CRON] Generated trade: ${quantity.toFixed(2)} ${symbol} at $${entryPrice.toFixed(2)}`);
        }
      }

      // Step 2C: Update trader equity and daily return.
      const { error: updateError } = await supabase
        .from('traders')
        .update({
          current_equity: Number(newEquity.toFixed(2)),
          total_return: (((newEquity - 10000) / 10000) * 100).toFixed(2),
          daily_return: Number(changePercent * 100).toFixed(2),
          updated_at: new Date().toISOString()
        })
        .eq('id', trader.id);

      if (updateError) {
        console.error(`[CRON] Error updating trader ${trader.id}:`, updateError);
        continue;
      }

      // Step 2D: Save the current P&L snapshot.
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('trader_history')
        .upsert({
          trader_id: trader.id,
          snapshot_date: today,
          equity: Number(newEquity.toFixed(2)),
          daily_return: Number(changePercent * 100).toFixed(2)
        }, { onConflict: 'trader_id,snapshot_date' });

      // Step 3: Update active copies' P&L only.
      const { data: follows, error: followsError } = await supabase
        .from('user_follows')
        .select('*')
        .eq('trader_id', trader.id)
        .eq('is_copying', true);

      if (!followsError && follows && follows.length > 0) {
        for (const follow of follows) {
          const followerTick = calculateCopyFollowerValue({
            currentValue: follow.current_value,
            allocatedAmount: follow.allocated_amount,
            traderChange: changePercent,
            riskMultiplier: follow.leverage_multiplier,
          });
          const newFollowValue = followerTick.currentValue;
          const followPnL = followerTick.pnl;
          const followPnLPercent = followerTick.pnlPercent;

          const updateData = {
            current_value: Number(newFollowValue.toFixed(2)),
            pnl: Number(followPnL.toFixed(2)),
            pnl_percent: Number(followPnLPercent.toFixed(2)),
            updated_at: new Date().toISOString()
          };

          const { error: followUpdateError } = await supabase
            .from('user_follows')
            .update(updateData)
            .eq('id', follow.id);

          if (followUpdateError) {
            console.error(`[CRON] Error updating follower ${follow.id}:`, followUpdateError);
            continue;
          }
          updatedCopies++;
        }
      }
    }

    console.log(`[CRON] P&L tick complete: ${simulatedTraders} traders, ${generatedTrades} trades, ${updatedCopies} copies updated`);
    
    return res.status(200).json({
      success: true,
      activeTraders: (traders || []).length,
      simulatedTraders,
      skippedTraders,
      generatedTrades,
      updatedCopies,
      continuous: true,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[CRON] Fatal error:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Get asset price (real or simulated)
 * TODO: Integrate with real price APIs (yahoo-finance2, CoinGecko, etc.)
 */
async function getAssetPrice(symbol) {
  try {
    // For now, return simulated price
    // In production, fetch real prices from API
    const basePrice = Math.random() * 1000 + 100;
    const variation = (Math.random() - 0.5) * 0.1;
    return basePrice * (1 + variation);
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error);
    // Fallback to simulated price
    return 100 + Math.random() * 50;
  }
}
