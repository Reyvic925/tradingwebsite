import 'dotenv/config.js';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, key);

const shouldSeed = process.argv.includes('--seed');
const now = new Date().toISOString();

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function randomFromSeed(seed) {
  return (hash(seed) % 10000) / 10000;
}

function targetCopiers(trader, rank, totalTraders) {
  const performance = Math.max(0, Math.min(1, (Number(trader.total_return || 0) + 25) / 450));
  const history = Math.max(0, Math.min(1, Number(trader.total_trades || 0) / 1500));
  const riskPenalty = Math.max(0, Math.min(1, (Number(trader.risk_score || 5) - 7) / 3));
  const rankScore = totalTraders > 1 ? 1 - ((rank - 1) / (totalTraders - 1)) : 0;
  const popularity = randomFromSeed(`copier-popularity:${trader.id}`);
  const score = (rankScore * 0.42) + (performance * 0.28) + (history * 0.18) + ((1 - riskPenalty) * 0.12);
  const variation = 0.72 + (popularity * 0.56);
  const rawTarget = Math.round(score * score * 180 * variation);
  return Math.max(0, Math.min(500, rawTarget));
}

function rankTraders(traders) {
  return [...traders].sort((left, right) => {
    const returnDifference = Number(right.total_return || 0) - Number(left.total_return || 0);
    return returnDifference || Number(right.total_trades || 0) - Number(left.total_trades || 0) || left.id - right.id;
  });
}

function summarize(trader, follows) {
  const active = follows.filter((follow) => follow.is_copying === true);
  const allTime = new Set(follows.map((follow) => follow.user_id)).size;
  const activeAum = active.reduce((sum, follow) => sum + Number(follow.current_value || follow.allocated_amount || 0), 0);
  return {
    trader: trader.name,
    currentCopiers: active.length,
    allTimeCopiers: allTime,
    activeAum: Number(activeAum.toFixed(2)),
    activeFollowRecords: active.length,
  };
}

async function fetchAll(table, columns) {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) throw error;
  return data || [];
}

async function reconcile() {
  const [traders, follows, profiles, wallets] = await Promise.all([
    fetchAll('traders', 'id,name,is_active,total_return,risk_score,total_trades,followers,copiers_current,copiers_all_time,under_management'),
    fetchAll('user_follows', 'id,user_id,trader_id,is_copying,allocated_amount,current_value,followed_at'),
    fetchAll('profiles', 'user_id,role,created_at'),
    fetchAll('wallets', 'id,user_id,currency,available,reserved'),
  ]);
  const ranked = rankTraders(traders);
  const rankById = new Map(ranked.map((trader, index) => [trader.id, index + 1]));
  const followsByTrader = new Map();
  for (const follow of follows) {
    const traderFollows = followsByTrader.get(follow.trader_id) || [];
    traderFollows.push(follow);
    followsByTrader.set(follow.trader_id, traderFollows);
  }

  let closedRelationships = 0;
  for (const follow of follows) {
    const trader = traders.find((candidate) => candidate.id === follow.trader_id);
    if (trader?.is_active === false && follow.is_copying === true) {
      const { error } = await supabase.from('user_follows').update({ is_copying: false, updated_at: now }).eq('id', follow.id);
      if (error) throw error;
      follow.is_copying = false;
      closedRelationships++;
    }
  }

  const eligibleUsers = profiles
    .filter((profile) => profile.role !== 'admin')
    .map((profile) => ({
      ...profile,
      wallet: wallets.find((wallet) => wallet.user_id === profile.user_id && (!wallet.currency || wallet.currency === 'USD')),
    }))
    .filter((profile) => profile.wallet && Number(profile.wallet.available || 0) >= 100);

  let createdSyntheticFollows = 0;
  if (shouldSeed) {
    for (const trader of ranked) {
      if (trader.is_active !== true) continue;
      const traderFollows = followsByTrader.get(trader.id) || [];
      const activeUsers = new Set(traderFollows.filter((follow) => follow.is_copying).map((follow) => follow.user_id));
      const target = targetCopiers(trader, rankById.get(trader.id), ranked.length);
      const candidates = eligibleUsers
        .filter((profile) => !activeUsers.has(profile.user_id))
        .sort((left, right) => hash(`copier:${trader.id}:${left.user_id}`) - hash(`copier:${trader.id}:${right.user_id}`));
      for (const profile of candidates.slice(0, Math.max(0, target - activeUsers.size))) {
        const allocation = Math.min(5000, Math.max(100, Math.round((100 + (randomFromSeed(`allocation:${trader.id}:${profile.user_id}`) * 1900)) / 10) * 10));
        if (Number(profile.wallet.available || 0) < allocation) continue;
        const { data, error } = await supabase.from('user_follows').insert({
          user_id: profile.user_id,
          trader_id: trader.id,
          allocated_amount: allocation,
          current_value: allocation,
          pnl: 0,
          pnl_percent: 0,
          stop_loss_percent: 20,
          take_profit_percent: 200,
          leverage_multiplier: 1,
          is_copying: true,
          followed_at: now,
          copy_start_date: now,
          updated_at: now,
        }).select('id,user_id,trader_id,is_copying,allocated_amount,current_value');
        if (error) {
          if (error.code === '23505') continue;
          throw error;
        }
        const { error: walletError } = await supabase.from('wallets').update({
          available: Number(profile.wallet.available) - allocation,
          reserved: Number(profile.wallet.reserved || 0) + allocation,
        }).eq('user_id', profile.user_id).eq('id', profile.wallet.id);
        if (walletError) throw walletError;
        profile.wallet.available = Number(profile.wallet.available) - allocation;
        profile.wallet.reserved = Number(profile.wallet.reserved || 0) + allocation;
        traderFollows.push(data[0]);
        activeUsers.add(profile.user_id);
        createdSyntheticFollows++;
      }
      followsByTrader.set(trader.id, traderFollows);
    }
  }

  const report = [];
  for (const trader of traders) {
    const followsForTrader = followsByTrader.get(trader.id) || [];
    const summary = summarize(trader, followsForTrader);
    const { error } = await supabase.from('traders').update({
      followers: summary.currentCopiers,
      copiers_current: summary.currentCopiers,
      copiers_all_time: summary.allTimeCopiers,
      under_management: summary.activeAum,
      updated_at: now,
    }).eq('id', trader.id);
    if (error) throw error;
    report.push({ ...summary, active: trader.is_active === true });
  }

  console.log(JSON.stringify({
    mode: shouldSeed ? 'reconcile-and-seed' : 'reconcile',
    traders: traders.length,
    eligibleUsers: eligibleUsers.length,
    closedRelationships,
    createdSyntheticFollows,
    report,
  }, null, 2));
}

reconcile().catch((error) => {
  console.error(error);
  process.exit(1);
});