#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const base = (process.env.D1_STAGING_URL || 'https://apex-prime-staging-worker.dprimemarkets.workers.dev').replace(/\/+$/, '');
const database = 'apex-prime-staging';
const wranglerCli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const email = `d1-investment-${randomUUID()}@example.invalid`;
const password = `D1-Invest-${randomUUID()}!`;
let userId = null;
let failed = false;

async function request(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function executeSql(sql) {
  const file = path.join(os.tmpdir(), `apex-prime-d1-investment-${process.pid}-${randomUUID()}.sql`);
  fs.writeFileSync(file, sql, 'utf8');
  try {
    const result = spawnSync(process.execPath, [
      wranglerCli, 'd1', 'execute', database, '--remote', '--env', 'staging', '--yes', `--file=${file}`,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'D1 investment fixture failed.');
  } finally {
    fs.rmSync(file, { force: true });
  }
}

try {
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (signup.response.status !== 201) throw new Error(`Temporary signup returned ${signup.response.status}.`);
  userId = signup.body?.user?.id || null;
  if (!userId) throw new Error('Temporary signup returned no user id.');
  const cookie = (signup.response.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie.startsWith('apex_session=')) throw new Error('Temporary signup returned no D1 session cookie.');
  const headers = { cookie, 'content-type': 'application/json' };

  const profile = await request('/api/profile', { method: 'POST', headers, body: '{}' });
  if (profile.response.status !== 200) throw new Error('Temporary account profile bootstrap failed.');
  executeSql(`UPDATE wallets SET available = 1000, reserved = 0 WHERE user_id = '${userId}' AND currency = 'USD';`);

  const tiers = await request('/api/investment-tiers');
  if (tiers.response.status !== 200 || !Array.isArray(tiers.body)) throw new Error('Investment tier read endpoint failed.');

  const purchase = await request('/api/investments', {
    method: 'POST',
    headers,
    body: JSON.stringify({ plan_id: 1, amount: 200 }),
  });
  if (purchase.response.status !== 201) throw new Error(`Investment purchase returned ${purchase.response.status}: ${purchase.body?.error || 'no error message'}`);
  const investmentId = purchase.body.id;
  const walletAfterPurchase = await request('/api/wallet', { headers: { cookie } });
  if (Math.abs(Number(walletAfterPurchase.body.available) - 800) > 0.001) throw new Error('Investment did not debit the USD wallet by its principal.');

  const detail = await request(`/api/investments?id=${encodeURIComponent(investmentId)}`, { headers: { cookie } });
  if (detail.response.status !== 200 || detail.body.investment?.id !== investmentId) throw new Error('Investment detail read failed.');
  if (detail.body.transactions?.length !== 1 || detail.body.transactions[0].type !== 'deposit') {
    throw new Error('Investment detail is missing its initial ledger entry.');
  }

  executeSql(`UPDATE wallets SET available = 100, reserved = 0 WHERE user_id = '${userId}' AND currency = 'USD';`);
  const insufficient = await request('/api/investments', {
    method: 'POST',
    headers,
    body: JSON.stringify({ plan_id: 1, amount: 200 }),
  });
  if (insufficient.response.status !== 400) throw new Error('Insufficient-funds investment was not rejected.');
  const list = await request('/api/investments', { headers: { cookie } });
  if (list.body.length !== 1) throw new Error('Rejected investment created an investment row.');
  const walletAfterReject = await request('/api/wallet', { headers: { cookie } });
  if (Number(walletAfterReject.body.available) !== 100) throw new Error('Rejected investment changed the wallet.');

  console.log(JSON.stringify({
    planPurchase: 'passed',
    walletDebit: 'passed',
    detailLedger: 'passed',
    insufficientBalanceRollback: 'passed',
    configuredTierCount: tiers.body.length,
  }, null, 2));
} catch (error) {
  failed = true;
  console.error(`[d1-investment-smoke] ${error.message}`);
} finally {
  if (userId) {
    try {
      executeSql(`DELETE FROM auth_users WHERE id = '${userId}';`);
    } catch (error) {
      failed = true;
      console.error(`[d1-investment-smoke] Temporary account cleanup failed: ${error.message}`);
    }
  }
}

if (failed) process.exitCode = 1;