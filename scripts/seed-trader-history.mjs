/**
 * Seed comprehensive trading history for all 74 traders
 * Generates realistic trades, history snapshots, and performance data
 * Usage: node scripts/seed-trader-history.mjs
 */

import 'dotenv/config.js';
import { createClient } from '@supabase/supabase-js';
import { fetchLiveMarketSnapshot, fetchYahooMarketQuotes } from '../api-handlers/live-market-data.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const STARTING_EQUITY = 100000;

// Realistic asset prices for seeding trades
const ASSET_PRICES = {
  'BTCUSD': 43200,
  'ETHUSD': 2280,
  'EURUSD': 1.0820,
  'GBPUSD': 1.2650,
  'JPYUSD': 0.0067,
  'AUDUSD': 0.6580,
  'CHFUSD': 1.1200,
  'CADUSD': 0.7420,
  'BRLUSD': 0.2010,
  'MXNUSD': 0.0585,
  'ZARUSD': 0.0534,
  'INDRUSD': 0.0120,
  'BRENTUSD': 83.40,
  'USDWTI': 79.15,
  'XAUUSD': 2045.50,
  'XAGUSD': 24.35,
  'AAPL': 192.50,
  'MSFT': 378.90,
  'NVDA': 875.30,
  'TSLA': 248.70,
  'AMZN': 178.40,
  'GOOGL': 142.80,
  'META': 502.60,
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

function getAssetPrice(symbol, livePrices = {}) {
  const normalized = normalizeSymbol(symbol);
  const aliases = {
    BTC: 'BTCUSD',
    ETH: 'ETHUSD',
    EUR: 'EURUSD',
    GBP: 'GBPUSD',
    JPY: 'JPYUSD',
    USD: 'EURUSD',
    XAU: 'XAUUSD',
    XAG: 'XAGUSD',
    BRENT: 'BRENTUSD',
    WTI: 'USDWTI',
  };
  const liveSymbol = aliases[normalized] || normalized;
  const livePrice = Number(livePrices[liveSymbol]?.price);
  return Number.isFinite(livePrice) && livePrice > 0 ? livePrice : ASSET_PRICES[liveSymbol] || null;
}

function generateTrades(trader, daysBack = 90, livePrices = {}) {
  const trades = [];
  const assetsToTrade = Array.isArray(trader.asset_focus) && trader.asset_focus.length > 0
    ? trader.asset_focus
    : ['BTC-USD', 'ETH-USD'];

  // Generate 200-600 trades per trader for established look
  const baseTradeCount = Math.min(600, Math.max(240, Math.floor(200 + (trader.total_trades || 500) * 0.4)));
  const winRate = (trader.win_rate_trades || 50) / 100;
  const tradesPerDay = Math.ceil(baseTradeCount / Math.max(daysBack, 1));

  let tradeId = 0;
  for (let day = daysBack; day >= 0; day--) {
    const tradeDate = new Date();
    tradeDate.setDate(tradeDate.getDate() - day);

    const numTrades = Math.max(4, Math.floor(tradesPerDay + (Math.random() - 0.5) * 6));  // 4-8 trades per day
    for (let t = 0; t < numTrades && tradeId < baseTradeCount; t++, tradeId++) {
      const requestedAsset = assetsToTrade[tradeId % assetsToTrade.length];
      const basePrice = getAssetPrice(requestedAsset, livePrices);
      const asset = basePrice ? requestedAsset : 'BTC-USD';
      const tradePrice = basePrice || getAssetPrice(asset, livePrices);

      // Generate realistic trade with win/loss based on win rate
      const isWin = Math.random() < winRate;
      const priceMove = isWin
        ? Math.random() * 0.006 + 0.003
        : -(Math.random() * 0.005 + 0.002);

      const entryPrice = tradePrice * (1 + (Math.random() - 0.5) * 0.003);
      const exitPrice = entryPrice * (1 + priceMove);
      const side = Math.random() < 0.5 ? 'BUY' : 'SELL';
      const targetExposure = 5000 + Math.random() * 25000;
      const quantity = Math.max(0.0001, targetExposure / entryPrice);
      const pnl = (side === 'BUY' ? exitPrice - entryPrice : entryPrice - exitPrice) * quantity;
      const pnlPercent = (priceMove * 100);

      // Randomize trade time within trading hours
      const tradeTime = new Date(tradeDate);
      tradeTime.setHours(Math.floor(Math.random() * 16) + 8, Math.floor(Math.random() * 60));

      trades.push({
        trader_id: trader.id,
        symbol: asset,
        side,
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

  const seededTrades = trades.slice(0, baseTradeCount);
  const totalPnl = seededTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const targetReturn = Math.min(145, Math.max(50, 40 + (Number(trader.risk_score) || 5) * 7 + (Number(trader.id) % 6) * 3));
  const targetPnl = STARTING_EQUITY * targetReturn / 100;
  if (seededTrades.length > 0 && totalPnl !== 0) {
    const winningPnl = seededTrades.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
    const losingPnl = Math.abs(seededTrades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0));
    const pnlScale = totalPnl > 0 ? targetPnl / totalPnl : (targetPnl + losingPnl) / Math.max(winningPnl, 1);
    for (const trade of seededTrades) {
      const scaledPnl = trade.pnl > 0 ? trade.pnl * pnlScale : trade.pnl;
      const priceDelta = scaledPnl / trade.quantity;
      trade.pnl = Number(scaledPnl.toFixed(2));
      trade.exit_price = Number((trade.side === 'BUY' ? trade.entry_price + priceDelta : trade.entry_price - priceDelta).toFixed(4));
      trade.pnl_percent = Number((((trade.exit_price - trade.entry_price) / trade.entry_price) * 100).toFixed(2));
    }
  }

  return seededTrades;
}

function generateHistorySnapshots(trader, daysBack = 90, trades = []) {
  const snapshots = [];
  const startEquity = STARTING_EQUITY;
  let currentEquity = startEquity;
  let previousEquity = startEquity;

  for (let day = daysBack; day >= 0; day--) {
    const snapshotDate = new Date();
    snapshotDate.setDate(snapshotDate.getDate() - day);
    const dateStr = snapshotDate.toISOString().slice(0, 10);

    const dayTrades = trades.filter((trade) => trade.traded_at.slice(0, 10) === dateStr);
    const dayPnl = dayTrades.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
    currentEquity = Math.max(startEquity * 0.5, currentEquity + dayPnl);
    const dailyReturn = previousEquity > 0 ? ((currentEquity - previousEquity) / previousEquity) * 100 : 0;
    previousEquity = currentEquity;

    snapshots.push({
      trader_id: trader.id,
      snapshot_date: dateStr,
      equity: Number(currentEquity.toFixed(2)),
      daily_return: Number(dailyReturn.toFixed(2)),
    });
  }

  return snapshots;
}

async function seedTraders() {
  console.log('🚀 Starting trader history seeding...');

  try {
    // Fetch all active traders
    const { data: traders, error: traderError } = await supabase
      .from('traders')
      .select('id, name, total_trades, win_rate_trades, total_return, asset_focus, followers, copiers_all_time, copiers_current, risk_score, profit_sharing_fee')
      .eq('is_active', true);

    if (traderError) throw traderError;
    console.log(`📊 Found ${traders.length} active traders`);

    const requestedSymbols = [...new Set(traders.flatMap((trader) => trader.asset_focus || []))]
      .map(normalizeSymbol)
      .filter(Boolean);
    const [liveSnapshot, yahooQuotes] = await Promise.all([
      fetchLiveMarketSnapshot().catch(() => ({})),
      fetchYahooMarketQuotes(requestedSymbols).catch(() => ({})),
    ]);
    const livePrices = { ...liveSnapshot, ...yahooQuotes };
    console.log(`💹 Loaded ${Object.keys(livePrices).length} current market quotes`);

    // Clear existing trade_logs and trader_history
    console.log('🧹 Clearing existing trade history...');
    const { error: tradeDeleteError } = await supabase
      .from('trade_logs')
      .delete()
      .not('id', 'is', null);
    if (tradeDeleteError) throw tradeDeleteError;

    const { error: historyDeleteError } = await supabase
      .from('trader_history')
      .delete()
      .not('trader_id', 'is', null);
    if (historyDeleteError) throw historyDeleteError;

    let totalTrades = 0;
    let totalSnapshots = 0;
    const batchSize = 500;

    // Process traders in batches
    for (let i = 0; i < traders.length; i += 3) {
      const batch = traders.slice(i, Math.min(i + 3, traders.length));
      const allBatchTrades = [];
      const allBatchSnapshots = [];

      for (const trader of batch) {
        const trades = generateTrades(trader, 90, livePrices);
        const snapshots = generateHistorySnapshots(trader, 90, trades);
        allBatchTrades.push(...trades);
        allBatchSnapshots.push(...snapshots);
      }

      // Insert trades in smaller batches
      for (let j = 0; j < allBatchTrades.length; j += batchSize) {
        const tradeBatch = allBatchTrades.slice(j, Math.min(j + batchSize, allBatchTrades.length));
        const { error: tradeInsertError } = await supabase
          .from('trade_logs')
          .insert(tradeBatch);
        if (tradeInsertError) {
          console.error(`❌ Error inserting trades:`, tradeInsertError);
          throw tradeInsertError;
        }
        totalTrades += tradeBatch.length;
      }

      // Insert snapshots in smaller batches
      for (let j = 0; j < allBatchSnapshots.length; j += batchSize) {
        const snapshotBatch = allBatchSnapshots.slice(j, Math.min(j + batchSize, allBatchSnapshots.length));
        const { error: snapshotInsertError } = await supabase
          .from('trader_history')
          .insert(snapshotBatch);
        if (snapshotInsertError) {
          console.error(`❌ Error inserting snapshots:`, snapshotInsertError);
          throw snapshotInsertError;
        }
        totalSnapshots += snapshotBatch.length;
      }

      console.log(`✅ Processed ${Math.min(i + 10, traders.length)}/${traders.length} traders`);
    }

    console.log(`\n✨ Seeding complete!`);

        // Now calculate and update trader stats based on seeded data
        console.log(`\n📊 Calculating trader performance metrics...`);
        for (const trader of traders) {
          try {
            // Fetch all trades for this trader
            const { data: traderTrades, error: tradesError } = await supabase
              .from('trade_logs')
              .select('*')
              .eq('trader_id', trader.id);

            if (tradesError) throw tradesError;

            // Calculate metrics from actual trades
            const totalTrades = traderTrades.length;
            const winTrades = traderTrades.filter(t => t.pnl > 0).length;
            const totalPnL = traderTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
            const winRate = totalTrades > 0 ? Number(((winTrades / totalTrades) * 100).toFixed(2)) : 0;
            const winningPnl = traderTrades.filter(t => Number(t.pnl) > 0).reduce((sum, t) => sum + Number(t.pnl), 0);
            const losingPnl = Math.abs(traderTrades.filter(t => Number(t.pnl) < 0).reduce((sum, t) => sum + Number(t.pnl), 0));
            const averageWin = winTrades > 0 ? winningPnl / winTrades : 0;
            const lossTrades = totalTrades - winTrades;
            const averageLoss = lossTrades > 0 ? losingPnl / lossTrades : 0;
            const riskReward = averageLoss > 0 ? averageWin / averageLoss : 0;

            // Measure drawdown at every trade close, not only at daily snapshots.
            let intradayEquity = STARTING_EQUITY;
            let intradayPeak = STARTING_EQUITY;
            let tradeDrawdown = 0;
            for (const trade of [...traderTrades].sort((a, b) => new Date(a.traded_at) - new Date(b.traded_at))) {
              intradayEquity = Math.max(STARTING_EQUITY * 0.5, intradayEquity + Number(trade.pnl || 0));
              intradayPeak = Math.max(intradayPeak, intradayEquity);
              tradeDrawdown = Math.max(tradeDrawdown, ((intradayPeak - intradayEquity) / intradayPeak) * 100);
            }

            // Calculate max drawdown from history
            const { data: history, error: historyError } = await supabase
              .from('trader_history')
              .select('equity')
              .eq('trader_id', trader.id)
              .order('snapshot_date', { ascending: true });

            let maxDrawdown = 0;
            if (!historyError && history && history.length > 0) {
              let peak = history[0].equity;
              for (const snapshot of history) {
                if (snapshot.equity > peak) peak = snapshot.equity;
                const drawdown = ((peak - snapshot.equity) / peak) * 100;
                if (drawdown > maxDrawdown) maxDrawdown = drawdown;
              }
            }

            // Get final equity for total return
            const finalEquity = history && history.length > 0 ? history[history.length - 1].equity : STARTING_EQUITY;
            const totalReturn = Math.max((totalPnL / STARTING_EQUITY) * 100, 0.25);

            // Calculate daily volatility
            if (history && history.length > 1) {
              const returns = [];
              for (let i = 1; i < history.length; i++) {
                const dailyReturn = ((history[i].equity - history[i - 1].equity) / history[i - 1].equity) * 100;
                returns.push(dailyReturn);
              }
              const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
              const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
              const dailyVolatility = Math.sqrt(variance);
              const currentCopiers = Math.max(Number(trader.copiers_current || trader.followers || 0), 1);
              const averageAllocation = 1000;
              const assetsUnderManagement = currentCopiers * averageAllocation;
              const copierProfit = (totalReturn / 100) * assetsUnderManagement;
              const feeRate = Math.min(Math.max(Number(trader.profit_sharing_fee || 20), 0), 100) / 100;
              const performanceFees = copierProfit * feeRate;
              const netCopierProfit = copierProfit - performanceFees;

              // Update every profile metric from this trader's generated history.
              const { error: updateError } = await supabase
                .from('traders')
                .update({
                  total_trades: totalTrades,
                  win_rate_trades: winRate,
                  total_return: Number(totalReturn.toFixed(2)),
                  current_equity: Number((STARTING_EQUITY * (1 + totalReturn / 100)).toFixed(2)),
                  daily_return: Number(returns[returns.length - 1].toFixed(2)),
                  max_drawdown: Number(Math.max(maxDrawdown, tradeDrawdown).toFixed(2)),
                  volatility: Number((dailyVolatility / 100).toFixed(6)),
                  copiers_current: currentCopiers,
                  copiers_all_time: Math.max(Number(trader.copiers_all_time || 0), currentCopiers),
                  under_management: Number(assetsUnderManagement.toFixed(2)),
                  profit_for_copiers: Number(netCopierProfit.toFixed(2)),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', trader.id);

              if (updateError) {
                console.error(`⚠️  Failed to update ${trader.name}:`, updateError.message);
              } else {
                console.log(`✅ ${trader.name}: ${totalTrades} trades, ${winRate}% win, ${totalReturn.toFixed(2)}% return`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing ${trader.name}:`, error.message);
          }
        }
    console.log(`   📈 Total trades created: ${totalTrades}`);
    console.log(`   📊 Total history snapshots: ${totalSnapshots}`);
    console.log(`   👥 Traders updated: ${traders.length}`);

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

seedTraders();
