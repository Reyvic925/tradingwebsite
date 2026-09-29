#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const base = (process.env.D1_STAGING_URL || 'https://apex-prime-staging-worker.dprimemarkets.workers.dev').replace(/\/+$/, '');
const email = `d1-smoke-${randomUUID()}@example.invalid`;
const password = `D1-Smoke-${randomUUID()}!`;
let userId = null;
let failed = false;

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}: ${body.error || 'request failed'}`);
  return { response, body };
}

try {
  const { response: signupResponse, body: signup } = await requestJson('/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  userId = signup?.user?.id || null;
  if (!userId) throw new Error('Signup response did not include a user id.');

  const cookie = (signupResponse.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie.startsWith('apex_session=')) throw new Error('Signup did not return the D1 session cookie.');
  const headers = { cookie, 'content-type': 'application/json' };

  const { body: session } = await requestJson('/api/auth/session', { headers });
  if (session?.user?.id !== userId) throw new Error('D1 session did not resolve to the newly created user.');

  const { body: profile } = await requestJson('/api/profile', {
    method: 'POST',
    headers,
    body: '{}',
  });
  if (!profile?.profile || !profile?.wallet) throw new Error('Profile bootstrap did not return a profile and wallet.');

  const { body: wallet } = await requestJson('/api/wallet', { headers: { cookie } });
  if (wallet.currency !== 'USD' || Number(wallet.available) !== 0) {
    throw new Error('Fresh D1 wallet did not start at zero USD.');
  }

  for (const pathname of [
    '/api/transactions', '/api/investments', '/api/positions', '/api/orders',
    '/api/notifications', '/api/watchlist',
  ]) {
    const { body } = await requestJson(pathname, { headers: { cookie } });
    if (!Array.isArray(body) || body.length !== 0) throw new Error(`${pathname} did not return an empty fresh-account list.`);
  }

  const { body: plans } = await requestJson('/api/plans');
  if (!Array.isArray(plans) || plans.length !== 4) throw new Error('D1 did not return the four default plans.');
  const anonymousPositions = await fetch(`${base}/api/positions`);
  if (anonymousPositions.status !== 401) throw new Error('Private positions API did not reject an anonymous request.');
  const unconfiguredDeposit = await fetch(`${base}/api/deposits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ amount: 1, currency: 'USDT', network: 'ethereum', tx_hash: `smoke-${randomUUID()}` }),
  });
  if (unconfiguredDeposit.status !== 503) throw new Error('Deposits were not disabled without receiving-address configuration.');
  const unavailableCryptoAddresses = await fetch(`${base}/api/user/crypto-addresses`, { headers: { cookie } });
  if (unavailableCryptoAddresses.status !== 503) throw new Error('Wallet generation did not fail closed without an encryption secret.');
  const nonAdminReview = await fetch(`${base}/api/admin/deposits`, { headers: { cookie } });
  if (nonAdminReview.status !== 403) throw new Error('A regular user was allowed to access admin deposit review.');
  const nonAdminKeys = await fetch(`${base}/api/admin/crypto-addresses`, { headers: { cookie } });
  if (nonAdminKeys.status !== 403) throw new Error('A regular user was allowed to access admin wallet keys.');

  console.log(JSON.stringify({
    signup: 'passed',
    session: 'passed',
    profile: 'passed',
    wallet: 'passed',
    dashboardReads: 'passed',
    plans: plans.length,
    anonymousProtection: 'passed',
    depositsFailClosed: 'passed',
    walletEncryptionFailClosed: 'passed',
    adminAuthorization: 'passed',
    adminKeysAuthorization: 'passed',
    startingBalance: Number(wallet.available),
  }, null, 2));
} catch (error) {
  failed = true;
  console.error(`[d1-staging-smoke] ${error.message}`);
} finally {
  if (userId) {
    const quote = String.fromCharCode(39);
    const sql = `DELETE FROM auth_users WHERE id = ${quote}${userId.replaceAll(quote, quote + quote)}${quote}`;
    const cli = path.resolve('node_modules/wrangler/bin/wrangler.js');
    const cleanup = spawnSync(process.execPath, [
      cli, 'd1', 'execute', 'apex-prime-staging', '--remote', '--env', 'staging', '--yes', '--command', sql,
    ], { stdio: 'inherit' });
    if (cleanup.status !== 0) {
      failed = true;
      console.error('[d1-staging-smoke] Temporary account cleanup failed.');
    }
  }
}

if (failed) process.exitCode = 1;