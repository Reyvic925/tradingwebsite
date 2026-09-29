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
const email = `d1-trading-${randomUUID()}@example.invalid`;
const password = `D1-Trading-${randomUUID()}!`;
let userId = null;
let failed = false;

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function executeSql(sql) {
  const file = path.join(os.tmpdir(), `apex-prime-d1-trading-${process.pid}-${randomUUID()}.sql`);
  fs.writeFileSync(file, sql, 'utf8');
  try {
    const result = spawnSync(process.execPath, [
      wranglerCli, 'd1', 'execute', database, '--remote', '--env', 'staging', '--yes', `--file=${file}`,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'D1 test fixture failed.');
  } finally {
    fs.rmSync(file, { force: true });
  }
}

try {
  const signup = await requestJson('/api/auth/signup', {
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
  const profile = await requestJson('/api/profile', {
    method: 'POST', headers, body: '{}',
  });
  if (profile.response.status !== 200) throw new Error('Unable to initialize temporary D1 profile.');

  executeSql(`UPDATE wallets SET available = 10000, reserved = 0 WHERE user_id = '${userId}' AND currency = 'USD';`);
  const marketResult = await requestJson('/api/markets?limit=1');
  const market = marketResult.body?.items?.[0];
  if (marketResult.response.status !== 200 || !market?.id || !(Number(market.price) > 0)) {
    throw new Error('No valid D1 market is available for the trading smoke test.');
  }

  const orderResult = await requestJson('/api/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify({ market_id: market.id, side: 'buy', type: 'market', quantity: 1 }),
  });
  if (orderResult.response.status !== 201 || orderResult.body?.order?.status !== 'filled' || !orderResult.body?.position?.id) {
    throw new Error(`Market order failed (${orderResult.response.status}): ${orderResult.body?.error || 'invalid fill response'}`);
  }

  const margin = Number(market.price) * 0.1;
  const walletAfterFill = await requestJson('/api/wallet', { headers: { cookie } });
  if (Math.abs(Number(walletAfterFill.body.available) - (10000 - margin)) > 0.001 || Math.abs(Number(walletAfterFill.body.reserved) - margin) > 0.001) {
    throw new Error('Market fill did not reserve the expected margin atomically.');
  }

  const opposing = await requestJson('/api/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify({ market_id: market.id, side: 'sell', type: 'market', quantity: 1 }),
  });
  if (opposing.response.status !== 409) {
    throw new Error(`Opposing order returned ${opposing.response.status}: ${opposing.body?.error || 'no error message'}`);
  }
  const walletAfterOpposing = await requestJson('/api/wallet', { headers: { cookie } });
  if (Math.abs(Number(walletAfterOpposing.body.available) - (10000 - margin)) > 0.001
    || Math.abs(Number(walletAfterOpposing.body.reserved) - margin) > 0.001) {
    throw new Error('Rejected opposing order changed the wallet balance.');
  }

  const stopUpdate = await requestJson('/api/positions', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ id: orderResult.body.position.id, stop_loss: Number(market.price) * 0.8, take_profit: Number(market.price) * 1.2 }),
  });
  if (stopUpdate.response.status !== 200) throw new Error('Position stop-loss/take-profit update failed.');

  const close = await requestJson('/api/positions', {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ id: orderResult.body.position.id }),
  });
  if (close.response.status !== 200 || close.body?.status !== 'closed') throw new Error('Position close/settlement failed.');
  const walletAfterClose = await requestJson('/api/wallet', { headers: { cookie } });
  if (Math.abs(Number(walletAfterClose.body.available) - 10000) > 0.01 || Math.abs(Number(walletAfterClose.body.reserved)) > 0.001) {
    throw new Error('Position close did not release reserved margin and settle P&L.');
  }

  const limitOrder = await requestJson('/api/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify({ market_id: market.id, side: 'buy', type: 'limit', quantity: 1, price: Number(market.price) * 0.8 }),
  });
  if (limitOrder.response.status !== 201 || limitOrder.body?.status !== 'pending') throw new Error('Limit order was not created pending.');
  const cancel = await requestJson('/api/orders', {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ id: limitOrder.body.id }),
  });
  if (cancel.response.status !== 200) throw new Error('Limit order cancellation failed.');

  executeSql(`UPDATE wallets SET available = 1, reserved = 0 WHERE user_id = '${userId}' AND currency = 'USD';`);
  const insufficient = await requestJson('/api/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify({ market_id: market.id, side: 'buy', type: 'market', quantity: 1 }),
  });
  if (insufficient.response.status !== 400) throw new Error('Insufficient-margin order was not rejected.');
  const walletAfterRejected = await requestJson('/api/wallet', { headers: { cookie } });
  if (Number(walletAfterRejected.body.available) !== 1 || Number(walletAfterRejected.body.reserved) !== 0) {
    throw new Error('Rejected order changed the wallet balance.');
  }

  console.log(JSON.stringify({
    marketFill: 'passed',
    marginReservation: 'passed',
    opposingOrderRejection: 'passed',
    positionRiskUpdate: 'passed',
    closeSettlement: 'passed',
    limitOrderCancel: 'passed',
    insufficientMarginAtomicity: 'passed',
  }, null, 2));
} catch (error) {
  failed = true;
  console.error(`[d1-trading-smoke] ${error.message}`);
} finally {
  if (userId) {
    try {
      executeSql(`DELETE FROM auth_users WHERE id = '${userId}';`);
    } catch (error) {
      failed = true;
      console.error(`[d1-trading-smoke] Temporary account cleanup failed: ${error.message}`);
    }
  }
}

if (failed) process.exitCode = 1;