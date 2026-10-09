async function proxyToWorker(req, res, urlPath) {
  const workerOrigin = String(process.env.WORKER_API_URL || '').trim().replace(/\/+$/, '');
  if (!urlPath.startsWith('/api/')) return false;

  if (!workerOrigin) {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Worker API is not configured. Set WORKER_API_URL to the Cloudflare Worker URL.' }));
    return true;
  }

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

  let upstream;
  try {
    upstream = await fetch(target, { method, headers, body, redirect: 'manual' });
  } catch (error) {
    console.error('[api] Worker API request failed:', error);
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Worker API is unavailable.' }));
    return true;
  }
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
  const urlPath = new URL(req.url || '/', 'http://localhost').pathname;
  if (!urlPath.startsWith('/api/')) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  await ensureBody(req);
  await proxyToWorker(req, res, urlPath);
}
