import assert from 'node:assert/strict';
import handler from '../../api/index.js';

const originalFetch = globalThis.fetch;
const originalVercelEnv = process.env.VERCEL_ENV;
const originalWorkerApiUrl = process.env.WORKER_API_URL;
let capturedRequest;

process.env.VERCEL_ENV = 'preview';
process.env.WORKER_API_URL = 'https://apex-prime-staging-worker.dprimemarkets.workers.dev/';
globalThis.fetch = async (url, init) => {
  capturedRequest = { url: String(url), init };
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 201,
    headers: {
      'content-type': 'application/octet-stream',
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
assert.equal(responseHeaders.get('set-cookie')[0], 'apex_session=worker-session; Path=/; HttpOnly; SameSite=Lax');
assert.deepEqual([...response.body], [1, 2, 3]);

globalThis.fetch = originalFetch;
if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
else process.env.VERCEL_ENV = originalVercelEnv;
if (originalWorkerApiUrl === undefined) delete process.env.WORKER_API_URL;
else process.env.WORKER_API_URL = originalWorkerApiUrl;

console.log('VERCEL_PREVIEW_PROXY_TESTS_PASSED');