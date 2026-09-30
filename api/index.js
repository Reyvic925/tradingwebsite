import { parse, pathToFileURL } from 'url';
import path from 'path';

const WORKER_PREVIEW_PATHS = new Set([
  '/api/profile', '/api/wallet', '/api/deposits', '/api/deposits/history', '/api/admin/deposits',
  '/api/user/crypto-addresses', '/api/kyc-upload', '/api/user/kyc', '/api/admin/kyc',
  '/api/user/withdraw/crypto', '/api/admin/withdrawals', '/api/withdrawal-request',
  '/api/admin/roi-approvals', '/api/transactions', '/api/investments',
  '/api/positions', '/api/orders', '/api/notifications', '/api/watchlist',
  '/api/landing', '/api/markets', '/api/plans', '/api/investment-tiers',
]);

async function proxyPreviewToWorker(req, res, urlPath) {
  const workerOrigin = String(process.env.WORKER_API_URL || '').trim().replace(/\/+$/, '');
  if (process.env.VERCEL_ENV !== 'preview' || !workerOrigin
    || (!WORKER_PREVIEW_PATHS.has(urlPath) && !urlPath.startsWith('/api/auth/'))) return false;

  const target = new URL(req.url || urlPath, workerOrigin);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers || {})) {
    if (value && !['connection', 'content-length', 'host'].includes(name.toLowerCase())) {
      headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
    }
  }

  const method = String(req.method || 'GET').toUpperCase();
  let body;
  if (!['GET', 'HEAD'].includes(method) && req.body !== undefined) {
    body = typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? req.body
      : JSON.stringify(req.body);
  }

  const upstream = await fetch(target, { method, headers, body, redirect: 'manual' });
  res.statusCode = upstream.status;
  for (const [name, value] of upstream.headers) {
    if (!['connection', 'content-encoding', 'content-length', 'transfer-encoding', 'set-cookie'].includes(name.toLowerCase())) {
      res.setHeader(name, value);
    }
  }
  const cookies = upstream.headers.getSetCookie?.();
  if (cookies?.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await upstream.arrayBuffer()));
  return true;
}

function ensureQuery(req) {
  if (req.query) return req.query;
  const url = new URL(req.url || '/', 'http://localhost');
  req.query = Object.fromEntries(url.searchParams.entries());
  return req.query;
}

async function ensureBody(req) {
  if (req.body !== undefined) return req.body;
  const method = String(req.method || '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return undefined;

  const contentType = String(req.headers?.['content-type'] || '');
  const chunks = [];
  for await (const chunk of req) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;

  if (contentType.includes('application/json')) {
    try {
      req.body = JSON.parse(raw);
      return req.body;
    } catch {
      req.body = raw;
      return raw;
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(raw);
    req.body = Object.fromEntries(params.entries());
    return req.body;
  }

  req.body = raw;
  return raw;
}

export default async function handler(req, res) {
  ensureQuery(req);
  await ensureBody(req);

  const urlPath = parse(req.url || '').pathname || '/';
  const parts = urlPath.split('/').filter(Boolean); // e.g. ['api','ticker'] or ['api','cron','roi'] or ['ticker']

  if (await proxyPreviewToWorker(req, res, urlPath)) return;

  if (parts[0] === 'api') parts.shift();

  const name = parts[0] || 'landing';
  let nestedName = null;

  if (name === 'cron' && parts[1]) {
    nestedName = parts[1];
  }

  const handlerCandidates = [];
  if (nestedName) {
    handlerCandidates.push(path.join(process.cwd(), 'api-handlers', `${name}-${nestedName}.js`));
    handlerCandidates.push(path.join(process.cwd(), 'api-handlers', `${name}-${nestedName}-simulator.js`));
    if (nestedName === 'roi') {
      handlerCandidates.push(path.join(process.cwd(), 'api-handlers', 'cron-roi-simulator.js'));
    }
  }
  handlerCandidates.push(path.join(process.cwd(), 'api-handlers', `${name}.js`));

  let resolvedHandlerPath = null;
  let lastImportError = null;

  for (const candidatePath of handlerCandidates) {
    try {
      const moduleUrl = pathToFileURL(candidatePath).href;
      await import(moduleUrl);
      resolvedHandlerPath = candidatePath;
      break;
    } catch (err) {
      lastImportError = err;
    }
  }

  if (!resolvedHandlerPath) {
    throw lastImportError || new Error('Handler not found');
  }

  try {
    const moduleUrl = pathToFileURL(resolvedHandlerPath).href;
    const handlerModule = await import(moduleUrl);
    const fn = handlerModule?.default || handlerModule?.handler || handlerModule;
    if (typeof fn === 'function') {
      return fn(req, res);
    }

    res.statusCode = 500;
    return res.end(`Handler for ${name} is not a function`);
  } catch (err) {
    // Module not found errors differ between Node versions; check message/code
    const msg = String(err?.message || '');
    if (err?.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module/.test(msg) || /not find/.test(msg)) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    console.error(err);
    res.statusCode = 500;
    return res.end('Internal Server Error');
  }
}
