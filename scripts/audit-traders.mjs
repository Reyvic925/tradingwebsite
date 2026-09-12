import 'dotenv/config.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase configuration for trader audit. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);
const issues = [];

const normalizeAsset = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/^#/, '').replace(/\s+/g, '').toUpperCase();
};

const isFiniteNumber = (value) => Number.isFinite(Number(value));

async function audit() {
  const { data: traders, error } = await supabase.from('traders').select('*');
  if (error) throw error;

  console.log('## TRADERS AUDIT');
  console.log(`Total traders: ${traders.length}`);

  for (const trader of traders) {
    const name = trader.name || '<unknown>';
    const assetFocus = Array.isArray(trader.asset_focus) ? trader.asset_focus : [];
    const seen = new Set();
    const duplicates = assetFocus.filter((asset) => {
      const tag = normalizeAsset(asset);
      if (!tag) return false;
      if (seen.has(tag)) return true;
      seen.add(tag);
      return false;
    });

    if (duplicates.length) {
      issues.push({ trader: name, field: 'asset_focus', value: assetFocus.join(', '), reason: `duplicate assets: ${duplicates.join(', ')}` });
    }

    if (trader.total_return !== null && trader.total_return !== undefined && !isFiniteNumber(trader.total_return)) {
      issues.push({ trader: name, field: 'total_return', value: trader.total_return, reason: 'not finite' });
    }

    if (trader.current_equity !== null && trader.current_equity !== undefined && (!isFiniteNumber(trader.current_equity) || Number(trader.current_equity) < 0)) {
      issues.push({ trader: name, field: 'current_equity', value: trader.current_equity, reason: 'negative or invalid equity' });
    }

    if (trader.win_rate_trades !== null && trader.win_rate_trades !== undefined && (!isFiniteNumber(trader.win_rate_trades) || Number(trader.win_rate_trades) < 0 || Number(trader.win_rate_trades) > 100)) {
      issues.push({ trader: name, field: 'win_rate_trades', value: trader.win_rate_trades, reason: 'invalid win rate' });
    }

    if (trader.max_drawdown !== null && trader.max_drawdown !== undefined && (!isFiniteNumber(trader.max_drawdown) || Number(trader.max_drawdown) < 0 || Number(trader.max_drawdown) > 100)) {
      issues.push({ trader: name, field: 'max_drawdown', value: trader.max_drawdown, reason: 'invalid drawdown' });
    }

    if (trader.risk_score !== null && trader.risk_score !== undefined && (!Number.isInteger(Number(trader.risk_score)) || Number(trader.risk_score) < 1 || Number(trader.risk_score) > 10)) {
      issues.push({ trader: name, field: 'risk_score', value: trader.risk_score, reason: 'risk score out of range' });
    }

    if (trader.followers !== null && trader.followers !== undefined && (!Number.isInteger(Number(trader.followers)) || Number(trader.followers) < 0)) {
      issues.push({ trader: name, field: 'followers', value: trader.followers, reason: 'invalid follower count' });
    }

    if (trader.copiers_current !== null && trader.copiers_current !== undefined && (!Number.isInteger(Number(trader.copiers_current)) || Number(trader.copiers_current) < 0)) {
      issues.push({ trader: name, field: 'copiers_current', value: trader.copiers_current, reason: 'invalid current copier count' });
    }

    if (trader.copiers_all_time !== null && trader.copiers_all_time !== undefined && (!Number.isInteger(Number(trader.copiers_all_time)) || Number(trader.copiers_all_time) < 0)) {
      issues.push({ trader: name, field: 'copiers_all_time', value: trader.copiers_all_time, reason: 'invalid all-time copier count' });
    }

    if (trader.under_management !== null && trader.under_management !== undefined && (!isFiniteNumber(trader.under_management) || Number(trader.under_management) < 0)) {
      issues.push({ trader: name, field: 'under_management', value: trader.under_management, reason: 'invalid under management' });
    }

    if (trader.profit_for_copiers !== null && trader.profit_for_copiers !== undefined && (!isFiniteNumber(trader.profit_for_copiers))) {
      issues.push({ trader: name, field: 'profit_for_copiers', value: trader.profit_for_copiers, reason: 'invalid profit for copiers' });
    }

    if (trader.is_active === false && trader.name) {
      console.log(`Closed but retained: ${trader.id} ${trader.name}`);
    }

    if (assetFocus.some((asset) => normalizeAsset(asset) === '+1' || normalizeAsset(asset) === '1')) {
      issues.push({ trader: name, field: 'asset_focus', value: assetFocus.join(', '), reason: 'placeholder asset tag present' });
    }
  }

  const counts = {
    invalidROI: issues.filter((issue) => issue.field === 'total_return').length,
    largeROIAllowed: (traders || []).filter((trader) => Number.isFinite(Number(trader.total_return)) && Math.abs(Number(trader.total_return)) > 5000).length,
    invalidEquity: issues.filter((issue) => issue.field === 'current_equity').length,
    invalidAssets: issues.filter((issue) => issue.field === 'asset_focus').length,
    invalidDrawdown: issues.filter((issue) => issue.field === 'max_drawdown').length,
    invalidWinRate: issues.filter((issue) => issue.field === 'win_rate_trades').length,
    invalidCopierData: issues.filter((issue) => /copier|followers/.test(issue.field)).length,
  };

  console.log('Issues found:', issues.length);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.log(`- ${issue.trader} | ${issue.field} | ${issue.value} | ${issue.reason}`);
    }
  }
  console.log(JSON.stringify(counts, null, 2));
}

audit().catch((error) => {
  console.error(error);
  process.exit(1);
});
