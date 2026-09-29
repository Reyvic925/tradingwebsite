#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { UNIVERSE } from '../api-handlers/universe-data.js';
import { getDefaultPlans } from '../api-handlers/plan-data.js';

const DATABASE = 'apex-prime-staging';
const CHUNK_SIZE = 60;
const WRANGLER_CLI = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

function sqlValue(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Invalid numeric seed value: ${value}`);
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function planStatement(plan) {
  const columns = ['id', 'name', 'tagline', 'min_amount', 'max_amount', 'daily_rate', 'duration_days', 'total_return', 'featured'];
  const values = columns.map((column) => sqlValue(plan[column]));
  return `INSERT INTO plans (${columns.join(', ')}) SELECT ${values.join(', ')} WHERE NOT EXISTS (SELECT 1 FROM plans WHERE id = ${sqlValue(plan.id)});`;
}

function marketStatement(market) {
  const columns = ['symbol', 'name', 'asset_class', 'price', 'change_24h', 'volume', 'high_24h', 'low_24h'];
  const values = columns.map((column) => sqlValue(market[column]));
  return `INSERT INTO markets (${columns.join(', ')}) SELECT ${values.join(', ')} WHERE NOT EXISTS (SELECT 1 FROM markets WHERE symbol = ${sqlValue(market.symbol)});`;
}

function createChunks() {
  const uniqueMarkets = [...new Map(UNIVERSE.map((market) => [market.symbol, market])).values()];
  const statements = [
    ...getDefaultPlans().map(planStatement),
    ...uniqueMarkets.map(marketStatement),
  ];
  const chunks = [];
  for (let index = 0; index < statements.length; index += CHUNK_SIZE) {
    chunks.push(`${statements.slice(index, index + CHUNK_SIZE).join('\n')}\n`);
  }
  return { chunks, marketCount: uniqueMarkets.length, planCount: getDefaultPlans().length };
}

function applyChunk(sql, index) {
  const file = path.join(os.tmpdir(), `apex-prime-d1-seed-${process.pid}-${index}.sql`);
  fs.writeFileSync(file, sql, 'utf8');
  try {
    execFileSync(process.execPath, [
      WRANGLER_CLI, 'd1', 'execute', DATABASE, '--remote', '--yes', `--file=${file}`,
    ], { stdio: 'inherit' });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const { chunks, marketCount, planCount } = createChunks();
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ database: DATABASE, markets: marketCount, plans: planCount, chunks: chunks.length, applied: false }, null, 2));
  console.log('Rerun with --apply to insert these built-in reference rows into staging.');
  process.exit(0);
}

for (const [index, chunk] of chunks.entries()) applyChunk(chunk, index);
console.log(JSON.stringify({ database: DATABASE, markets: marketCount, plans: planCount, applied: true }, null, 2));