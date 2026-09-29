#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const database = 'apex-prime-staging';
const wranglerCli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const testId = `deposit-trigger-${randomUUID()}`;
const email = `${testId}@example.invalid`;
const txHash = `d1test${randomUUID().replaceAll('-', '')}`;
const quote = String.fromCharCode(39);
const literal = (value) => `${quote}${String(value).replaceAll(quote, quote + quote)}${quote}`;
let failed = false;

function executeSql(sql) {
  const file = path.join(os.tmpdir(), `apex-prime-d1-trigger-${process.pid}-${randomUUID()}.sql`);
  fs.writeFileSync(file, sql, 'utf8');
  try {
    return execFileSync(process.execPath, [
      wranglerCli, 'd1', 'execute', database, '--remote', '--env', 'staging', '--yes', `--file=${file}`,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function querySql(sql) {
  return execFileSync(process.execPath, [
    wranglerCli, 'd1', 'execute', database, '--remote', '--env', 'staging', '--yes', '--command', sql,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

try {
  executeSql(`
    INSERT INTO auth_users (id, email, password_hash) VALUES (${literal(testId)}, ${literal(email)}, 'test-only');
    INSERT INTO profiles (user_id, email, full_name, role) VALUES (${literal(testId)}, ${literal(email)}, 'D1 Trigger Test', 'admin');
    INSERT INTO wallets (user_id, currency, available, reserved, locked_balance) VALUES (${literal(testId)}, 'USD', 0, 0, 0);
    INSERT INTO deposits (user_id, amount, currency, network, destination_address, tx_hash, status)
      VALUES (${literal(testId)}, 25, 'USDT', 'testnet', 'test-address', ${literal(txHash)}, 'pending');
    UPDATE deposits SET status = 'confirmed', credited_usd = 25, reviewed_by = ${literal(testId)}, confirmed_at = CURRENT_TIMESTAMP
      WHERE tx_hash = ${literal(txHash)} AND status = 'pending';
    UPDATE deposits SET status = 'confirmed', credited_usd = 25
      WHERE tx_hash = ${literal(txHash)} AND status = 'confirmed';
  `);

  const result = querySql(`
    SELECT CASE WHEN
      (SELECT available FROM wallets WHERE user_id = ${literal(testId)} AND currency = 'USD') = 25
      AND (SELECT COUNT(*) FROM wallet_ledger WHERE source_type = 'deposit' AND source_id =
        (SELECT id FROM deposits WHERE tx_hash = ${literal(txHash)})) = 1
      AND (SELECT COUNT(*) FROM transactions WHERE reference = 'DEP-' ||
        (SELECT id FROM deposits WHERE tx_hash = ${literal(txHash)})) = 1
      AND (SELECT status FROM deposits WHERE tx_hash = ${literal(txHash)}) = 'confirmed'
      THEN 'DEPOSIT_CREDIT_ONCE_PASS' ELSE 'DEPOSIT_CREDIT_ONCE_FAIL' END AS result;
  `);
  if (!result.includes('DEPOSIT_CREDIT_ONCE_PASS')) {
    throw new Error(`Deposit trigger did not credit exactly once. D1 verification output: ${result}`);
  }
  console.log('D1_DEPOSIT_CREDIT_ONCE_PASSED');
} catch (error) {
  failed = true;
  console.error(`[d1-deposit-trigger-smoke] ${error.stderr?.toString() || error.message}`);
} finally {
  try {
    executeSql(`
      DELETE FROM admin_audit_logs WHERE admin_user_id = ${literal(testId)};
      DELETE FROM auth_users WHERE id = ${literal(testId)};
    `);
  } catch (error) {
    failed = true;
    console.error(`[d1-deposit-trigger-smoke] Cleanup failed: ${error.stderr?.toString() || error.message}`);
  }
}

if (failed) process.exitCode = 1;