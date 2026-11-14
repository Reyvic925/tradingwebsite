import { quoteMarkets } from './market-quotes.js';
export { TradingEngine } from './trading-engine.js';
import { handleAuthRequest } from './auth.js';
import { handleAccountRequest } from './account-api.js';
import { handleAdminCryptoRequest } from './admin-crypto-api.js';
import { handleDepositRequest } from './deposit-api.js';
import { handleKycRequest } from './kyc-api.js';
import { handlePrivateRequest } from './private-api.js';
import { handlePaperTradingRequest, runPaperTradingTick } from './paper-trading.js';
import { handlePublicRequest } from './public-api.js';
import { handleReferralRequest } from './referral-api.js';
import { handleRoiWithdrawalRequest } from './roi-withdrawal-api.js';
import { handleWithdrawalRequest } from './withdrawal-api.js';
import { handleTraderRequest } from './traders-api.js';
import { handleCopyRequest } from './copy-trading.js';
import { handleCronRequest, runCronJob } from './cron.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

const pendingMarketResponses = new Map();

export default {
  async scheduled(controller, env, context) {
    context.waitUntil(runPaperTradingTick(env));
    const now = new Date(controller.scheduledTime || Date.now());
    context.waitUntil(runCronJob('copy-trading', env, now));
    context.waitUntil(runCronJob('roi', env, now));
  },

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
      const quotes = await quoteMarkets([
        { id: 1, symbol: 'NVDA', asset_class: 'stock' },
        { id: 2, symbol: 'EURUSD', asset_class: 'forex' },
        { id: 3, symbol: 'BTCUSD', asset_class: 'crypto' },
        { id: 4, symbol: 'AAPL', asset_class: 'stock' },
        { id: 5, symbol: 'ETHUSD', asset_class: 'crypto' },
        { id: 6, symbol: 'XAUUSD', asset_class: 'forex' },
      ]);
      return json(quotes);
    }

    if (url.pathname.startsWith('/api/auth/')) {
      return handleAuthRequest(request, env);
    }

    if (url.pathname.startsWith('/api/cron/')) {
      return handleCronRequest(request, env);
    }

    if (['/api/copy-trades', '/api/copy-summary', '/api/copy-activity'].includes(url.pathname)) {
      return handleCopyRequest(request, env);
    }

    if (url.pathname.startsWith('/api/paper/')) {
      return handlePaperTradingRequest(request, env);
    }

    if (url.pathname === '/api/admin/crypto-addresses' || url.pathname.startsWith('/api/admin/crypto-addresses/')) {
      return handleAdminCryptoRequest(request, env);
    }

    if (url.pathname === '/api/profile' || url.pathname === '/api/wallet') {
      return handleAccountRequest(request, env);
    }

    if (url.pathname === '/api/referrals') {
      return handleReferralRequest(request, env);
    }

    if ([
      '/api/traders', '/api/trader-trades', '/api/trader-history', '/api/trader-comparison', '/api/leaderboard',
      '/api/trader-watchlist', '/api/trader-analytics',
    ].includes(url.pathname)) {
      return handleTraderRequest(request, env);
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
      if (url.pathname === '/api/markets' && request.method === 'GET') {
        const marketCache = globalThis.caches?.default;
        if (marketCache) {
          const cacheUrl = new URL(request.url);
          cacheUrl.searchParams.sort();
          const cacheKey = new Request(cacheUrl, { method: 'GET' });
          const responseWithCacheStatus = (response, cacheStatus) => {
            const clone = response.clone();
            const headers = new Headers(clone.headers);
            headers.set('x-market-cache', cacheStatus);
            return new Response(clone.body, {
              status: clone.status,
              statusText: clone.statusText,
              headers,
            });
          };
          try {
            const cached = await marketCache.match(cacheKey);
            if (cached) return responseWithCacheStatus(cached, 'HIT');
          } catch (error) {
            console.error('[worker] Market response cache read failed', error);
          }

          const cacheKeyUrl = cacheKey.url;
          let pending = pendingMarketResponses.get(cacheKeyUrl);
          const cacheStatus = pending ? 'COALESCED' : 'MISS';
          if (!pending) {
            pending = (async () => {
              const response = await handlePublicRequest(request, env);
              if (!response.ok) return response;
              const headers = new Headers(response.headers);
              headers.set('cache-control', 'public, max-age=15');
              const cacheable = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers,
              });
              try {
                await marketCache.put(cacheKey, cacheable.clone());
              } catch (error) {
                console.error('[worker] Market response cache write failed', error);
              }
              return cacheable;
            })();
            pendingMarketResponses.set(cacheKeyUrl, pending);
          }
          try {
            const response = await pending;
            return responseWithCacheStatus(response, cacheStatus);
          } finally {
            if (pendingMarketResponses.get(cacheKeyUrl) === pending) {
              pendingMarketResponses.delete(cacheKeyUrl);
            }
          }
        }
      }
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
