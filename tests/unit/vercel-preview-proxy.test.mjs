import assert from 'node:assert/strict';
import handler from '../../api/index.js';

const originalFetch = globalThis.fetch;
const originalVercelEnv = process.env.VERCEL_ENV;
const originalVercel = process.env.VERCEL;
const originalWorkerApiUrl = process.env.WORKER_API_URL;
let capturedRequest;

process.env.VERCEL_ENV = 'preview';
process.env.WORKER_API_URL = 'https://apex-prime-staging-worker.dprimemarkets.workers.dev/';
globalThis.fetch = async (url, init) => {
  capturedRequest = { url: String(url), init };
  return new Response(new Uint8Array([1, 2, 3]), {
    status: init.method === 'GET' ? 200 : 201,
    headers: {
      'content-type': 'application/octet-stream',
      'content-encoding': 'gzip',
      'set-cookie': 'apex_session=worker-session; Path=/; HttpOnly; SameSite=Lax',
    },
  });
};

const responseHeaders = new Map();
const response = {
  statusCode: 200,
  setHeader(name, value) { responseHeaders.set(name.toLowerCase(), value); },
  end(body) { this.body = body; },
};
const request = {
  url: '/api/kyc-upload?id=17',
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: 'apex_session=preview-session' },
  body: { kind: 'document_front' },
};

await handler(request, response);

assert.equal(capturedRequest.url, 'https://apex-prime-staging-worker.dprimemarkets.workers.dev/api/kyc-upload?id=17');
assert.equal(capturedRequest.init.method, 'POST');
assert.equal(capturedRequest.init.headers.get('cookie'), 'apex_session=preview-session');
assert.equal(capturedRequest.init.body, JSON.stringify({ kind: 'document_front' }));
assert.equal(response.statusCode, 201);
assert.equal(responseHeaders.get('content-type'), 'application/octet-stream');
assert.equal(responseHeaders.has('content-encoding'), false);
assert.equal(responseHeaders.get('set-cookie')[0], 'apex_session=worker-session; Path=/; HttpOnly; SameSite=Lax');
assert.deepEqual([...response.body], [1, 2, 3]);

const roiResponseHeaders = new Map();
const roiResponse = {
  statusCode: 200,
  setHeader(name, value) { roiResponseHeaders.set(name.toLowerCase(), value); },
  end(body) { this.body = body; },
};
const roiRequest = {
  url: '/api/admin/roi-approvals?status=pending',
  method: 'GET',
  headers: { cookie: 'apex_session=preview-session' },
};

await handler(roiRequest, roiResponse);
assert.equal(capturedRequest.url, 'https://apex-prime-staging-worker.dprimemarkets.workers.dev/api/admin/roi-approvals?status=pending');
assert.equal(capturedRequest.init.method, 'GET');
assert.equal(roiResponse.statusCode, 200);

process.env.VERCEL_ENV = 'production';
const productionResponse = {
  statusCode: 200,
  setHeader(name, value) { responseHeaders.set(name.toLowerCase(), value); },
  end(body) { this.body = body; },
};
await handler({ url: '/api/copy-trades', method: 'GET', headers: {} }, productionResponse);
assert.equal(capturedRequest.url, 'https://apex-prime-staging-worker.dprimemarkets.workers.dev/api/copy-trades');
assert.equal(productionResponse.statusCode, 200);

process.env.VERCEL = '1';
process.env.VERCEL_ENV = 'development';
process.env.WORKER_API_URL = 'https://apex-prime-dev-worker.example.workers.dev';
const vercelDevResponse = {
  statusCode: 200,
  setHeader(name, value) { responseHeaders.set(name.toLowerCase(), value); },
  end(body) { this.body = body; },
};
await handler({ url: '/api/health', method: 'GET', headers: {} }, vercelDevResponse);
assert.equal(capturedRequest.url, 'https://apex-prime-dev-worker.example.workers.dev/api/health');
assert.equal(vercelDevResponse.statusCode, 200);

delete process.env.WORKER_API_URL;
const unconfiguredResponse = {
  statusCode: 200,
  headers: new Map(),
  setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
  end(body) { this.body = body; },
};
await handler({ url: '/api/unknown-route', method: 'GET', headers: {} }, unconfiguredResponse);
assert.equal(unconfiguredResponse.statusCode, 503);
assert.equal(unconfiguredResponse.headers.get('content-type'), 'application/json; charset=utf-8');
assert.match(unconfiguredResponse.body, /Worker API is not configured/);

globalThis.fetch = originalFetch;
if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
else process.env.VERCEL_ENV = originalVercelEnv;
if (originalVercel === undefined) delete process.env.VERCEL;
else process.env.VERCEL = originalVercel;
if (originalWorkerApiUrl === undefined) delete process.env.WORKER_API_URL;
else process.env.WORKER_API_URL = originalWorkerApiUrl;

console.log('VERCEL_PREVIEW_PROXY_TESTS_PASSED');