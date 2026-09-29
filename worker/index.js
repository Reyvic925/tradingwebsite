import { handleAuthRequest } from './auth.js';
import { handlePublicRequest } from './public-api.js';

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

    if (url.pathname.startsWith('/api/auth/')) {
      return handleAuthRequest(request, env);
    }

    if (url.pathname === '/api/landing' || url.pathname === '/api/markets') {
      return handlePublicRequest(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'This API route has not been migrated to D1 yet.' }, 501);
    }

    return env.ASSETS.fetch(request);
  },
};