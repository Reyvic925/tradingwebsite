#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DATABASE = 'apex-prime-db';
const ACCOUNT_COUNT = 20;
const INITIAL_BALANCE = 25000;
const COPY_ALLOCATION = 1000;
const TRADERS_PER_ACCOUNT = 3;
const WRANGLER_CLI = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const args = process.argv.slice(2);

if (args.some((arg) => arg !== '--apply')) {
  throw new Error('Only --apply is supported. This seeder always targets local D1.');
}

function sqlValue(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Invalid number: ${value}`);
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildSql() {
  const statements = [];
  for (let index = 1; index <= ACCOUNT_COUNT; index++) {
    const suffix = String(index).padStart(3, '0');
    const userId = `sandbox-copy-user-${suffix}`;
    const email = `copy-sandbox-${suffix}@example.invalid`;
    const fullName = `Sandbox Follower ${suffix}`;
    const followPrefix = `sandbox-copy-${suffix}-`;

    statements.push(
      `INSERT OR IGNORE INTO auth_users (id,email,password_hash,email_verified_at) VALUES (${sqlValue(userId)},${sqlValue(email)},'SANDBOX_FIXTURE_NO_LOGIN',NULL);`,
      `INSERT OR IGNORE INTO profiles (user_id,email,full_name,kyc_status) VALUES (${sqlValue(userId)},${sqlValue(email)},${sqlValue(fullName)},'unverified');`,
      `INSERT OR IGNORE INTO wallets (user_id,currency,available,reserved,locked_balance) VALUES (${sqlValue(userId)},'USD',${INITIAL_BALANCE},0,0);`,
      `INSERT INTO copy_follows (id,user_id,trader_id,allocated_amount,current_value,peak_value,fee_high_water,stop_loss_percent,take_profit_percent,leverage_multiplier,followed_at,updated_at)
       SELECT ${sqlValue(followPrefix)} || t.id,${sqlValue(userId)},t.id,${COPY_ALLOCATION},${COPY_ALLOCATION},${COPY_ALLOCATION},${COPY_ALLOCATION},20,200,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
       FROM traders t WHERE t.is_active=1 AND NOT EXISTS (SELECT 1 FROM copy_follows f WHERE f.id=${sqlValue(followPrefix)} || t.id)
       ORDER BY t.id LIMIT ${TRADERS_PER_ACCOUNT};`,
      `INSERT OR IGNORE INTO copy_activity (id,follow_id,kind,value_after,reason,created_at)
       SELECT id || ':start',id,'started',${COPY_ALLOCATION},'sandbox_fixture',CURRENT_TIMESTAMP FROM copy_follows WHERE id LIKE ${sqlValue(`${followPrefix}%`)};`,
    );
  }
  return `${statements.join('\n')}\n`;
}

function applySql(sql) {
  const file = path.join(os.tmpdir(), `apex-prime-local-copy-sandbox-${process.pid}.sql`);
  fs.writeFileSync(file, sql, 'utf8');
  try {
    execFileSync(process.execPath, [WRANGLER_CLI, 'd1', 'execute', DATABASE, '--local', '--yes', `--file=${file}`], { stdio: 'inherit' });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const sql = buildSql();
if (!args.includes('--apply')) {
  console.log(JSON.stringify({ database: DATABASE, mode: 'local-only', accounts: ACCOUNT_COUNT,
    initial_balance_usd: INITIAL_BALANCE, allocation_per_trader_usd: COPY_ALLOCATION,
    traders_per_account: TRADERS_PER_ACCOUNT, applied: false }, null, 2));
  console.log('Run with --apply to add sandbox fixtures to local D1. Accounts cannot log in; KYC remains unverified.');
  process.exit(0);
}

applySql(sql);
console.log(JSON.stringify({ database: DATABASE, mode: 'local-only', accounts: ACCOUNT_COUNT,
  initial_balance_usd: INITIAL_BALANCE, allocation_per_trader_usd: COPY_ALLOCATION,
  traders_per_account: TRADERS_PER_ACCOUNT, applied: true }, null, 2));