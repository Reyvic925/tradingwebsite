import assert from 'node:assert/strict';
import apiHandler from '../../api/index.js';

process.env.CRON_SECRET = 'local-route-secret';

const makeRes = () => ({
  headers: {},
  statusCode: 200,
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; },
  end(data) { this.body = data; return this; },
});

const req = {
  method: 'GET',
  url: '/api/cron/roi',
  headers: { 'x-cron-secret': 'local-route-secret' },
  query: {},
};

const res = makeRes();

await apiHandler(req, res);

assert.equal(res.statusCode, 200, `Unexpected status: ${res.statusCode}`);
assert.ok(res.body && typeof res.body === 'object', 'Expected JSON response body');
assert.ok('timestamp' in res.body, 'ROI cron route should respond with a timestamp payload');
assert.ok('updated' in res.body, 'ROI cron route should include updated count');

console.log('ROI cron route test passed');
