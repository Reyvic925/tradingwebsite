/**
 * Seed comprehensive trading history for all 74 traders
 * Generates realistic trades, history snapshots, and performance data
 * Usage: node scripts/seed-trader-history.mjs
 */

import 'dotenv/config.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

      // Generate realistic trade with win/loss based on win rate
      const isWin = Math.random() < winRate;
      const priceMove = isWin 
        ? Math.random() * 0.03 + 0.001  // +0.1% to +3.1% win
        : -(Math.random() * 0.04 + 0.001);  // -0.1% to -4.1% loss

      const entryPrice = basePrice * (1 + (Math.random() - 0.5) * 0.001);
      const exitPrice = entryPrice * (1 + priceMove);
      const quantity = Math.random() < 0.5 ? 1 : Math.ceil(Math.random() * 5);
      const pnl = (exitPrice - entryPrice) * quantity;
      const pnlPercent = (priceMove * 100);

      // Randomize trade time within trading hours
      const tradeTime = new Date(tradeDate);
      tradeTime.setHours(Math.floor(Math.random() * 16) + 8, Math.floor(Math.random() * 60));

      trades.push({
        trader_id: trader.id,
        symbol: asset,
        side: 'BUY',  // Simplified: all buys for consistency
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

    // Simulate equity curve using trader's total_return
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

async function seedTraders() {
  console.log('🚀 Starting trader history seeding...');

  try {
    // Fetch all active traders
    const { data: traders, error: traderError } = await supabase
      .from('traders')
      .select('id, name, total_trades, win_rate_trades, total_return, asset_focus')
      .eq('is_active', true);

    if (traderError) throw traderError;
    console.log(`📊 Found ${traders.length} active traders`);

    // Clear existing trade_logs and trader_history
    console.log('🧹 Clearing existing trade history...');
    await supabase.from('trade_logs').delete().gte('id', 0);
    await supabase.from('trader_history').delete().gte('trader_id', '0');

    let totalTrades = 0;
    let totalSnapshots = 0;
    const batchSize = 500;

    // Process traders in batches
    for (let i = 0; i < traders.length; i += 10) {
      const batch = traders.slice(i, Math.min(i + 10, traders.length));
      const allBatchTrades = [];
      const allBatchSnapshots = [];

      for (const trader of batch) {
        const trades = generateTrades(trader, 7);
        const snapshots = generateHistorySnapshots(trader, 7);
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
    console.log(`   📈 Total trades created: ${totalTrades}`);
    console.log(`   📊 Total history snapshots: ${totalSnapshots}`);
    console.log(`   👥 Traders updated: ${traders.length}`);

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

seedTraders();
