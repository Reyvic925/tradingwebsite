#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { UNIVERSE } from '../api-handlers/universe-data.js';
import { getDefaultPlans } from '../api-handlers/plan-data.js';

const DEFAULT_DATABASE = 'apex-prime-db';
const CHUNK_SIZE = 60;
const WRANGLER_CLI = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

const FEATURE_ROWS = [
  { id: 1, title: 'AI Trading Desk', description: 'Machine-assisted signals and execution routing trained on multi-year market microstructure.', icon: 'ai' },
  { id: 2, title: 'Real-time Analysis', description: 'Streaming books, depth, and volatility surfaces refreshed in milliseconds.', icon: 'analysis' },
  { id: 3, title: 'Multi-asset Access', description: 'Equities, FX, and digital assets from a single margin account.', icon: 'multi' },
  { id: 4, title: 'Risk Management', description: 'Stop-loss, take-profit, and margin safeguards on every ticket.', icon: 'risk' },
  { id: 5, title: '24/7 Support', description: 'Human desk coverage across New York, London, and Singapore sessions.', icon: 'support' },
  { id: 6, title: 'Instant Deposits & Withdrawals', description: 'Card, wire, and stablecoin rails with same-session settlement.', icon: 'deposits' },
  { id: 7, title: 'Referral Program', description: 'Share your code and earn $25 when invited clients fund an account.', icon: 'referral' },
  { id: 8, title: 'Mobile-friendly', description: 'A full terminal experience on any screen, no download required.', icon: 'mobile' },
  { id: 9, title: 'Bank-grade SSL', description: 'TLS 1.3 encryption and hardware-backed session keys.', icon: 'ssl' },
  { id: 10, title: 'Transparent Fees', description: 'Published spreads and commissions. No overnight surprises.', icon: 'fees' },
  { id: 11, title: 'Auto-reinvestment', description: 'Compound matured plan payouts back into the next cycle.', icon: 'reinvest' },
  { id: 12, title: 'Social Trading', description: 'Allocate capital to verified lead traders and copy their book.', icon: 'social' },
];

const PARTNER_ROWS = [
  { id: 1, name: 'JPMorgan', mark: 'JP' },
  { id: 2, name: 'Bloomberg', mark: 'BB' },
  { id: 3, name: 'Nasdaq', mark: 'NQ' },
  { id: 4, name: 'London Stock Exchange', mark: 'LSE' },
  { id: 5, name: 'Mastercard', mark: 'MC' },
  { id: 6, name: 'Amazon Web Services', mark: 'AWS' },
  { id: 7, name: 'Cloudflare', mark: 'CF' },
  { id: 8, name: 'Deutsche Bank', mark: 'DB' },
  { id: 9, name: 'BlackRock', mark: 'BR' },
];

const PLATFORM_STATS = [
  { id: 1, label: 'Active clients', value: 120000, prefix: '', suffix: '+' },
  { id: 2, label: 'Client deposits', value: 420, prefix: '$', suffix: 'M+' },
  { id: 3, label: 'Daily trades', value: 24, prefix: '', suffix: 'K+' },
  { id: 4, label: 'Platform uptime', value: 99.9, prefix: '', suffix: '%' },
];

const TESTIMONIALS = [
  { id: 1, name: 'Marcus Hale', country: 'United States', amount: 184200, quote: 'The desk feels like a bulge-bracket prime.', role: 'Family office principal' },
  { id: 2, name: 'Elena Voss', country: 'Germany', amount: 96250, quote: 'Stop-loss filled within a tick of my level.', role: 'Systematic trader' },
  { id: 3, name: 'Kenji Nakamura', country: 'Japan', amount: 241800, quote: 'Gold plan compounded exactly as advertised.', role: 'Private investor' },
  { id: 4, name: 'Sofia Alvarez', country: 'Spain', amount: 67340, quote: 'Copying two lead traders while I run FX.', role: 'FX specialist' },
];

const TIER_ROWS = [
  { id: 1, name: 'Starter', tier_level: 1, percent_return: 15, duration_days: 30, min_investment: 200, max_investment: 999, roi_min: 15, roi_max: 22, volatility_min: 5, volatility_max: 10, simulation_enabled: 1 },
  { id: 2, name: 'Silver', tier_level: 2, percent_return: 22, duration_days: 45, min_investment: 1000, max_investment: 4999, roi_min: 22, roi_max: 28, volatility_min: 6, volatility_max: 12, simulation_enabled: 1 },
  { id: 3, name: 'Gold', tier_level: 3, percent_return: 30, duration_days: 60, min_investment: 5000, max_investment: 24999, roi_min: 30, roi_max: 38, volatility_min: 8, volatility_max: 14, simulation_enabled: 1 },
];

function sqlValue(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Invalid numeric seed value: ${value}`);
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insertStatement(table, columns, row) {
  const values = columns.map((column) => sqlValue(row[column]));
  return `INSERT INTO ${table} (${columns.join(', ')}) SELECT ${values.join(', ')} WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ${sqlValue(row.id)});`;
}

function planStatement(plan) {
  const columns = ['id', 'name', 'tagline', 'min_amount', 'max_amount', 'daily_rate', 'duration_days', 'total_return', 'featured'];
  return insertStatement('plans', columns, plan);
}

function marketStatement(market) {
  const columns = ['symbol', 'name', 'asset_class', 'price', 'change_24h', 'volume', 'high_24h', 'low_24h'];
  return `INSERT INTO markets (${columns.join(', ')}) SELECT ${columns.map((column) => sqlValue(market[column])).join(', ')} WHERE NOT EXISTS (SELECT 1 FROM markets WHERE symbol = ${sqlValue(market.symbol)});`;
}

function tableStatement(table, columns, row) {
  return insertStatement(table, columns, row);
}

function factoryStatements(database) {
  const uniqueMarkets = [...new Map((UNIVERSE || []).map((market) => [market.symbol, market])).values()];
  const statements = [
    ...getDefaultPlans().map(planStatement),
    ...uniqueMarkets.map(marketStatement),
    ...FEATURE_ROWS.map((row) => tableStatement('features', ['id', 'title', 'description', 'icon'], row)),
    ...PARTNER_ROWS.map((row) => tableStatement('partners', ['id', 'name', 'mark'], row)),
    ...PLATFORM_STATS.map((row) => tableStatement('platform_stats', ['id', 'label', 'value', 'prefix', 'suffix'], row)),
    ...TESTIMONIALS.map((row) => tableStatement('testimonials', ['id', 'name', 'country', 'amount', 'quote', 'role'], row)),
    ...TIER_ROWS.map((row) => tableStatement('investment_tiers', ['id', 'name', 'tier_level', 'percent_return', 'duration_days', 'min_investment', 'max_investment', 'roi_min', 'roi_max', 'volatility_min', 'volatility_max', 'simulation_enabled'], row)),
  ];
  const chunks = [];
  for (let index = 0; index < statements.length; index += CHUNK_SIZE) {
    chunks.push(`${statements.slice(index, index + CHUNK_SIZE).join('\n')}\n`);
  }
  return { database, chunks, marketCount: uniqueMarkets.length, planCount: getDefaultPlans().length, featureCount: FEATURE_ROWS.length, partnerCount: PARTNER_ROWS.length, platformStatCount: PLATFORM_STATS.length, testimonialCount: TESTIMONIALS.length, tierCount: TIER_ROWS.length };
}

function applyChunk(sql, database, index) {
  const file = path.join(os.tmpdir(), `apex-prime-public-seed-${process.pid}-${index}.sql`);
  fs.writeFileSync(file, sql, 'utf8');
  try {
    execFileSync(process.execPath, [WRANGLER_CLI, 'd1', 'execute', database, '--remote', '--yes', `--file=${file}`], { stdio: 'inherit' });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const args = process.argv.slice(2);
const explicitDatabase = args.find((arg) => !arg.startsWith('--') && !arg.endsWith('.js') && !arg.endsWith('.mjs')) ?? DEFAULT_DATABASE;
const apply = args.includes('--apply');
const database = explicitDatabase || DEFAULT_DATABASE;
const { chunks, marketCount, planCount, featureCount, partnerCount, platformStatCount, testimonialCount, tierCount } = factoryStatements(database);

if (!apply) {
  console.log(JSON.stringify({ database, markets: marketCount, plans: planCount, features: featureCount, partners: partnerCount, platformStats: platformStatCount, testimonials: testimonialCount, tiers: tierCount, chunks: chunks.length, applied: false }, null, 2));
  console.log('Rerun with --apply to insert these built-in reference rows into the target D1 database.');
  process.exit(0);
}

for (const [index, chunk] of chunks.entries()) applyChunk(chunk, database, index);
console.log(JSON.stringify({ database, markets: marketCount, plans: planCount, features: featureCount, partners: partnerCount, platformStats: platformStatCount, testimonials: testimonialCount, tiers: tierCount, applied: true }, null, 2));
