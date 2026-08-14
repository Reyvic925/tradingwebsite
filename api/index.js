import { parse, pathToFileURL } from 'url';
import path from 'path';

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
  const parts = urlPath.split('/').filter(Boolean); // e.g. ['api','ticker'] or ['ticker']

  if (parts[0] === 'api') parts.shift();

  const name = parts[0] || 'landing';
  const handlerPath = path.join(process.cwd(), 'api-handlers', `${name}.js`);

  try {
    const moduleUrl = pathToFileURL(handlerPath).href;
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
