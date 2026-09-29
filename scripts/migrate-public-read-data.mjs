#!/usr/bin/env node

import 'dotenv/config.js';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const STAGING_DATABASE = 'apex-prime-staging';
const DEFAULT_EXPORT = path.join('tmp', 'apex-prime-public-data.json');
const DEFAULT_SQL = path.join('tmp', 'apex-prime-public-data.sql');

const TABLES = {
  features: ['id', 'title', 'description', 'icon'],
  partners: ['id', 'name', 'mark'],
  platform_stats: ['id', 'label', 'value', 'suffix', 'prefix'],
  plans: ['id', 'name', 'tagline', 'min_amount', 'max_amount', 'daily_rate', 'duration_days', 'total_return', 'featured'],
  testimonials: ['id', 'name', 'country', 'amount', 'quote', 'video_url', 'avatar_url', 'role'],
  markets: ['id', 'symbol', 'name', 'asset_class', 'price', 'change_24h', 'volume', 'high_24h', 'low_24h'],
};

function usage() {
  console.log(`Usage:
  node scripts/migrate-public-read-data.mjs --export [file]
  node scripts/migrate-public-read-data.mjs --import [file] --database ${STAGING_DATABASE} [--sql file]
  node scripts/migrate-public-read-data.mjs --import [file] --database ${STAGING_DATABASE} --apply [--sql file]

Export reads only approved public tables from Supabase.
Import validates the export and writes a deterministic SQL transaction for staging.
Import requires --apply to execute Wrangler; without it, no database is changed.`);
}

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function ensureParent(file) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
}

function sourceSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '')
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key || key === 'your-service-role-key') {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL (or VITE_SUPABASE_URL/SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY before exporting.');
  }
  return createClient(url, key);
}

function normalizeValue(table, column, value) {
  if (value === undefined || value === null) return null;
  if (column === 'featured') {
    if (value === true || value === 1 || value === '1' || value === 'true') return 1;
    if (value === false || value === 0 || value === '0' || value === 'false') return 0;
    throw new Error(`${table}.${column} has a non-boolean value: ${JSON.stringify(value)}`);
  }
  if (['id', 'duration_days'].includes(column)) {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error(`${table}.${column} is not a safe integer: ${JSON.stringify(value)}`);
    return number;
  }
  if (['value', 'amount', 'min_amount', 'max_amount', 'daily_rate', 'total_return', 'price', 'change_24h', 'volume', 'high_24h', 'low_24h'].includes(column)) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${table}.${column} is not a finite number: ${JSON.stringify(value)}`);
    return number;
  }
  return String(value);
}

function normalizeRows(table, rows) {
  const columns = TABLES[table];
  return rows.map((row, index) => {
    const normalized = {};
    for (const column of columns) normalized[column] = normalizeValue(table, column, row[column]);
    if (!Number.isSafeInteger(normalized.id)) throw new Error(`${table} row ${index} has no valid id.`);
    return normalized;
  }).sort((left, right) => left.id - right.id);
}

async function exportData(file) {
  const supabase = sourceSupabase();
  const data = { version: 1, tables: {} };
  for (const [table, columns] of Object.entries(TABLES)) {
    const { data: rows, error } = await supabase.from(table).select(columns.join(',')).order('id', { ascending: true });
    if (error) throw new Error(`Supabase export failed for ${table}: ${error.message}`);
    data.tables[table] = normalizeRows(table, rows || []);
  }
  ensureParent(file);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ exported: Object.fromEntries(Object.entries(data.tables).map(([table, rows]) => [table, rows.length])), file }, null, 2));
}

function sqlValue(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function loadExport(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data?.version !== 1 || !data.tables || typeof data.tables !== 'object') throw new Error('Invalid public data export format.');
  for (const [table, columns] of Object.entries(TABLES)) {
    if (!Array.isArray(data.tables[table])) throw new Error(`Export is missing table ${table}.`);
    data.tables[table] = normalizeRows(table, data.tables[table]);
    for (const row of data.tables[table]) {
      if (Object.keys(row).some((key) => !columns.includes(key))) throw new Error(`Unexpected column in ${table}.`);
    }
  }
  return data;
}

function createSql(data) {
  const statements = ['PRAGMA foreign_keys = ON;', 'BEGIN TRANSACTION;'];
  for (const [table, columns] of Object.entries(TABLES)) {
    statements.push(`DELETE FROM ${table};`);
    for (const row of data.tables[table]) {
      statements.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((column) => sqlValue(row[column])).join(', ')});`);
    }
  }
  statements.push('COMMIT;');
  return `${statements.join('\n')}\n`;
}

function importData(file, sqlFile, apply) {
  const database = argument('--database');
  if (database !== STAGING_DATABASE) throw new Error(`Import is restricted to --database ${STAGING_DATABASE}.`);
  const data = loadExport(file);
  ensureParent(sqlFile);
  fs.writeFileSync(sqlFile, createSql(data), 'utf8');
  console.log(JSON.stringify({ validated: Object.fromEntries(Object.entries(data.tables).map(([table, rows]) => [table, rows.length])), sqlFile, applied: false }, null, 2));
  if (!apply) return;
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'd1', 'execute', STAGING_DATABASE, '--remote', `--file=${path.resolve(sqlFile)}`], { stdio: 'inherit' });
  console.log(`Applied approved public data to ${STAGING_DATABASE}.`);
}

try {
  if (hasFlag('--help') || process.argv.length < 3) {
    usage();
  } else if (hasFlag('--export')) {
    await exportData(argument('--export', DEFAULT_EXPORT));
  } else if (hasFlag('--import')) {
    importData(argument('--import'), argument('--sql', DEFAULT_SQL), hasFlag('--apply'));
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`[public-data-migration] ${error.message}`);
  process.exitCode = 1;
}