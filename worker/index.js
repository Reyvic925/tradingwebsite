import { handleAuthRequest } from './auth.js';
import { handleAccountRequest } from './account-api.js';
import { handleAdminCryptoRequest } from './admin-crypto-api.js';
import { handleDepositRequest } from './deposit-api.js';
import { handleKycRequest } from './kyc-api.js';
import { handlePrivateRequest } from './private-api.js';
import { handlePublicRequest } from './public-api.js';
import { handleRoiWithdrawalRequest } from './roi-withdrawal-api.js';
import { handleWithdrawalRequest } from './withdrawal-api.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      try {
        const result = await env.DB.prepare('SELECT 1 AS ok').first();
        return json({ ok: result?.ok === 1, database: 'd1' });
      } catch (error) {
        console.error('[worker] D1 health check failed', error);
        return json({ ok: false, database: 'd1' }, 503);
      }
    }

    if (url.pathname === '/api/ticker') {
      return json([
        { id: 1, trader_name: 'M. Hale', symbol: 'NVDA', side: 'BUY', quantity: 120, price: 131.05, asset_class: 'stock', created_at: new Date().toISOString() },
        { id: 2, trader_name: 'E. Voss', symbol: 'EURUSD', side: 'SELL', quantity: 25000, price: 1.0863, asset_class: 'forex', created_at: new Date().toISOString() },
        { id: 3, trader_name: 'K. Nakamura', symbol: 'BTCUSD', side: 'BUY', quantity: 0.42, price: 67380, asset_class: 'crypto', created_at: new Date().toISOString() },
        { id: 4, trader_name: 'S. Alvarez', symbol: 'XAUUSD', side: 'BUY', quantity: 12, price: 4300.0, asset_class: 'forex', created_at: new Date().toISOString() },
        { id: 5, trader_name: 'J. Okafor', symbol: 'AAPL', side: 'BUY', quantity: 80, price: 228.2, asset_class: 'stock', created_at: new Date().toISOString() },
        { id: 6, trader_name: 'P. Mehta', symbol: 'ETHUSD', side: 'SELL', quantity: 4.2, price: 3491.1, asset_class: 'crypto', created_at: new Date().toISOString() },
      ]);
    }

    if (url.pathname.startsWith('/api/auth/')) {
      return handleAuthRequest(request, env);
    }

    if (url.pathname === '/api/admin/crypto-addresses' || url.pathname.startsWith('/api/admin/crypto-addresses/')) {
      return handleAdminCryptoRequest(request, env);
    }

    if (url.pathname === '/api/profile' || url.pathname === '/api/wallet') {
      return handleAccountRequest(request, env);
    }

    if ([
      '/api/deposits', '/api/deposits/history', '/api/admin/deposits',
      '/api/user/crypto-addresses',
    ].includes(url.pathname)) {
      return handleDepositRequest(request, env);
    }

    if (['/api/kyc-upload', '/api/user/kyc', '/api/admin/kyc'].includes(url.pathname)) {
      return handleKycRequest(request, env);
    }

    if (['/api/user/withdraw/crypto', '/api/admin/withdrawals'].includes(url.pathname)) {
      return handleWithdrawalRequest(request, env);
    }

    if (['/api/withdrawal-request', '/api/admin/roi-approvals'].includes(url.pathname)) {
      return handleRoiWithdrawalRequest(request, env);
    }

    if ([
      '/api/landing', '/api/markets', '/api/plans', '/api/investment-tiers',
    ].includes(url.pathname)) {
      return handlePublicRequest(request, env);
    }

    if ([
      '/api/transactions', '/api/investments', '/api/positions', '/api/orders',
      '/api/notifications', '/api/watchlist',
    ].includes(url.pathname)) {
      return handlePrivateRequest(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'This API route has not been migrated to D1 yet.' }, 501);
    }

    return env.ASSETS.fetch(request);
  },
};