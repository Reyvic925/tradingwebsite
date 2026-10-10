#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const base = (process.env.D1_STAGING_URL || 'https://apex-prime-staging-worker.dprimemarkets.workers.dev').replace(/\/+$/, '');
const database = 'apex-prime-staging';
const wranglerCli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const email = `d1-paper-${randomUUID()}@example.invalid`;
const password = `D1-Paper-${randomUUID()}!`;
let userId = null;
let failed = false;

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function executeSql(sql) {
  const result = spawnSync(process.execPath, [
    wranglerCli, 'd1', 'execute', database, '--remote', '--env', 'staging', '--yes', '--command', sql,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'D1 test cleanup failed.');
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

  const unauthorized = await requestJson('/api/paper/account');
  if (unauthorized.response.status !== 401) {
    throw new Error(`Paper account endpoint returned ${unauthorized.response.status} without authentication: ${unauthorized.body?.error || 'no error message'}`);
  }

  const accountResult = await requestJson('/api/paper/account', { headers });
  if (accountResult.response.status !== 200 || Number(accountResult.body.initial_cash) !== 100000) {
    throw new Error('Paper account did not initialize with the expected virtual balance.');
  }

  const marketResult = await requestJson('/api/markets?limit=1');
  const market = marketResult.body?.items?.[0];
  if (marketResult.response.status !== 200 || !market?.id || !(Number(market.price) > 0)) {
    throw new Error('No valid D1 market is available for the paper trading smoke test.');
  }

  const orderResult = await requestJson('/api/paper/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify({ market_id: market.id, side: 'buy', type: 'market', quantity: 0.01 }),
  });
  const order = orderResult.body?.order;
  const position = orderResult.body?.position;
  if (orderResult.response.status !== 201 || order?.status !== 'filled' || !position?.id) {
    throw new Error(`Paper market order failed (${orderResult.response.status}): ${orderResult.body?.error || 'invalid fill response'}`);
  }

  const filledPrice = Number(order.filled_price);
  const reservedCash = filledPrice * Number(order.quantity);
  const positionsResult = await requestJson('/api/paper/positions', { headers });
  const openPosition = positionsResult.body?.find((row) => row.id === position.id);
  if (positionsResult.response.status !== 200 || !openPosition || !Number.isFinite(Number(openPosition.unrealized_pnl))) {
    throw new Error('Paper position or live mark-to-market P&L was not returned.');
  }

  const accountAfterFill = await requestJson('/api/paper/account', { headers });
  if (Math.abs(Number(accountAfterFill.body.reserved_cash) - reservedCash) > 0.001
    || Math.abs(Number(accountAfterFill.body.available_cash) - (100000 - reservedCash)) > 0.001) {
    throw new Error('Paper fill did not reserve virtual buying power correctly.');
  }

  const riskUpdate = await requestJson('/api/paper/positions', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ id: position.id, stop_loss: filledPrice * 0.5, take_profit: filledPrice * 2 }),
  });
  if (riskUpdate.response.status !== 200) throw new Error('Paper stop-loss/take-profit update failed.');

  const close = await requestJson('/api/paper/positions', {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ id: position.id }),
  });
  if (close.response.status !== 200 || close.body?.status !== 'closed') throw new Error('Paper position close/settlement failed.');
  const accountAfterClose = await requestJson('/api/paper/account', { headers });
  if (Math.abs(Number(accountAfterClose.body.reserved_cash)) > 0.001
    || Math.abs(Number(accountAfterClose.body.realized_pnl) - Number(close.body.realized_pnl)) > 0.001) {
    throw new Error('Closing the paper position did not release reserved cash and settle P&L.');
  }

  const limitResult = await requestJson('/api/paper/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify({ market_id: market.id, side: 'buy', type: 'limit', quantity: 0.01, limit_price: 0.00000001 }),
  });
  if (limitResult.response.status !== 201 || limitResult.body?.status !== 'pending') {
    throw new Error('Paper limit order was not created as pending.');
  }
  const cancel = await requestJson('/api/paper/orders', {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ id: limitResult.body.id }),
  });
  if (cancel.response.status !== 200) throw new Error('Paper limit order cancellation failed.');

  console.log(JSON.stringify({
    authenticationRequired: 'passed',
    virtualAccountInitialization: 'passed',
    marketOrderAndLiveMark: 'passed',
    virtualBuyingPowerReservation: 'passed',
    positionRiskUpdate: 'passed',
    positionCloseAndSettlement: 'passed',
    limitOrderCancellation: 'passed',
  }, null, 2));
} catch (error) {
  failed = true;
  console.error(`[d1-paper-trading-smoke] ${error.message}`);
} finally {
  if (userId) {
    try {
      executeSql(`DELETE FROM auth_users WHERE id = '${String(userId).replace(/'/g, "''")}';`);
    } catch (error) {
      failed = true;
      console.error(`[d1-paper-trading-smoke] Temporary account cleanup failed: ${error.message}`);
    }
  }
}

if (failed) process.exitCode = 1;
