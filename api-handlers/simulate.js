/**
 * Copy Trading Simulation Engine - Cron Handler
 * Runs every 1 minute to simulate market movements and update PnL
 * 
 * For Vercel: Add to vercel.json crons
 * For traditional servers: Use a cron scheduler (node-cron, node-schedule, etc.)
 */

import supabase from './db-client.js';
import { createNotification } from './notification-service.js';
import { getUsdWallet } from './helpers.js';
import {
  isTraderEligible,
  calculateMarketChange,
  generateRealisticEntryPrice,
  checkNotificationTrigger
} from '../src/lib/session-utils.js';

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
    console.log('[CRON] Starting copy trading simulation...');

    // Step 1: Fetch all active traders
    const { data: traders, error: traderError } = await supabase
      .from('traders')
      .select('*')
      .eq('is_active', true)
      .gt('session_end', new Date().toISOString());

    if (traderError) throw traderError;

    let simulatedTraders = 0;
    let generatedTrades = 0;
    let updatedFollowers = 0;

    // Step 2: Process each trader
    for (const trader of traders || []) {
      // Check if trader is eligible based on session time
      if (!isTraderEligible(trader)) {
        console.log(`[CRON] Trader ${trader.id} (${trader.session_type}) not eligible at this time`);
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

      // Step 2B: Generate realistic "winning" trade that explains the PnL
      if (Math.abs(pnlDelta) > 0.01) {
        const isProfit = pnlDelta > 0;
        const assetList = trader.asset_focus || ['BTC-USD', 'ETH-USD', 'AAPL', 'MSFT'];
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
            status: 'OPEN',
            traded_at: new Date().toISOString()
          });

        if (tradeError) {
          console.error(`[CRON] Error inserting trade for trader ${trader.id}:`, tradeError);
        } else {
          generatedTrades++;
          console.log(`[CRON] Generated trade: ${quantity.toFixed(2)} ${symbol} at $${entryPrice.toFixed(2)}`);
        }
      }

      // Step 2C: Auto-close old OPEN trades (older than 2 minutes)
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: oldTrades, error: oldTradesError } = await supabase
        .from('trade_logs')
        .select('*')
        .eq('trader_id', trader.id)
        .eq('status', 'OPEN')
        .lt('traded_at', twoMinutesAgo);

      if (!oldTradesError && oldTrades && oldTrades.length > 0) {
        for (const trade of oldTrades) {
          const currentPrice = await getAssetPrice(trade.symbol);
          const exitPnl = trade.side === 'BUY'
            ? (currentPrice - trade.entry_price) * trade.quantity
            : (trade.entry_price - currentPrice) * trade.quantity;

          await supabase
            .from('trade_logs')
            .update({
              exit_price: Number(currentPrice.toFixed(4)),
              pnl: Number(exitPnl.toFixed(2)),
              pnl_percent: ((exitPnl / (trade.entry_price * trade.quantity)) * 100).toFixed(2),
              status: 'CLOSED',
              closed_at: new Date().toISOString()
            })
            .eq('id', trade.id);
        }

        // Update trader stats
        const { data: allTrades } = await supabase
          .from('trade_logs')
          .select('pnl, status')
          .eq('trader_id', trader.id);

        const closedTrades = (allTrades || []).filter(t => t.status === 'CLOSED');
        const winningTrades = closedTrades.filter(t => Number(t.pnl) > 0).length;
        const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 50;

        await supabase
          .from('traders')
          .update({
            total_trades: (allTrades || []).length,
            win_rate_trades: Number(winRate.toFixed(2))
          })
          .eq('id', trader.id);
      }

      // Step 2D: Update trader equity and daily return
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

      // Step 2E: Save daily equity snapshot
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('trader_history')
        .upsert({
          trader_id: trader.id,
          snapshot_date: today,
          equity: Number(newEquity.toFixed(2)),
          daily_return: Number(changePercent * 100).toFixed(2)
        }, { onConflict: 'trader_id,snapshot_date' });

      // Step 3: Update followers' PnL
      const { data: follows, error: followsError } = await supabase
        .from('user_follows')
        .select('*')
        .eq('trader_id', trader.id)
        .eq('is_copying', true);

      if (!followsError && follows && follows.length > 0) {
        for (const follow of follows) {
          // Calculate user's PnL based on leverage
          const baseMultiplier = 1 + changePercent;
          const userChange = (baseMultiplier - 1) * Number(follow.leverage_multiplier || 1);
          const newFollowValue = Number(follow.current_value) * (1 + userChange);
          const followPnL = newFollowValue - Number(follow.allocated_amount);
          const followPnLPercent = (followPnL / Number(follow.allocated_amount)) * 100;

          // Check risk conditions (Stop-Loss / Take-Profit)
          const riskCheck = checkNotificationTrigger(
            followPnLPercent,
            Number(follow.stop_loss_percent || 20),
            Number(follow.take_profit_percent || 200)
          );

          let updateData = {
            current_value: Number(newFollowValue.toFixed(2)),
            pnl: Number(followPnL.toFixed(2)),
            pnl_percent: Number(followPnLPercent.toFixed(2)),
            updated_at: new Date().toISOString()
          };

          // Trigger stop-loss or take-profit
          if (riskCheck.shouldNotify && (riskCheck.reason === 'stop_loss' || riskCheck.reason === 'take_profit')) {
            updateData.is_copying = false;
            console.log(`[CRON] ${riskCheck.reason.toUpperCase()} for user follow ${follow.id}: ${followPnLPercent.toFixed(2)}%`);

            // Create notification
            await createNotification(supabase, {
              user_id: follow.user_id,
              trader_id: follow.trader_id,
              title: riskCheck.reason === 'stop_loss' ? '⚠️ Stop-Loss Triggered' : '🎉 Take-Profit Reached',
              message: riskCheck.message,
              type: riskCheck.reason === 'stop_loss' ? 'alert' : 'profit',
              read: false
            });
          }

          const { error: followUpdateError } = await supabase
            .from('user_follows')
            .update(updateData)
            .eq('id', follow.id);

          if (followUpdateError) {
            console.error(`[CRON] Error updating follower ${follow.id}:`, followUpdateError);
            continue;
          }

          if (!follow.is_copying || updateData.is_copying !== false) {
            updatedFollowers++;
            continue;
          }

          const wallet = await getUsdWallet(supabase, follow.user_id);
          if (wallet) {
            const returnAmount = Number(updateData.current_value) || Number(follow.allocated_amount);
            const { error: walletError } = await supabase.from('wallets').update({
              available: Number(wallet.available || 0) + returnAmount,
              reserved: Math.max(0, Number(wallet.reserved || 0) - Number(follow.allocated_amount || 0)),
            }).eq('id', wallet.id);
            if (walletError) {
              console.error(`[CRON] Error releasing follower ${follow.id} funds:`, walletError);
              continue;
            }
          }

          updatedFollowers++;
        }
      }
    }

    // Step 4: Auto-expire expired sessions
    const { error: expireError } = await supabase
      .from('traders')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .lt('session_end', new Date().toISOString())
      .eq('is_active', true);

    if (expireError) {
      console.error('[CRON] Error expiring sessions:', expireError);
    }

    console.log(`[CRON] Simulation complete: ${simulatedTraders} traders, ${generatedTrades} trades, ${updatedFollowers} followers updated`);
    
    return res.status(200).json({
      success: true,
      simulatedTraders,
      generatedTrades,
      updatedFollowers,
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
