#!/usr/bin/env node
// Simple verification script for seed-markets endpoint
// Usage: node scripts/verify-seed.js [--url http://localhost:3000] [--secret <admin-secret>]
// If ADMIN_SECRET env var is set and server not running, you can also run direct seeding by:
//   ADMIN_SECRET=... node scripts/verify-seed.js --direct

const http = require('http');
const https = require('https');
const { spawnSync } = require('child_process');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { url: 'http://localhost:3000', secret: process.env.ADMIN_SECRET || '', direct: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--url' && args[i+1]) { out.url = args[++i]; }
    else if (a === '--secret' && args[i+1]) { out.secret = args[++i]; }
    else if (a === '--direct') { out.direct = true; }
  }
  return out;
}

async function callEndpoint(url, secret) {
  const u = new URL(url + '/api/admin/seed-markets');
  const lib = u.protocol === 'https:' ? https : http;
  const opts = { method: 'POST', headers: { 'X-Admin-Secret': secret } };
  return new Promise((resolve, reject) => {
    const req = lib.request(u, opts, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch (err) { resolve({ status: res.statusCode, body: body }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const { url, secret, direct } = parseArgs();
  if (direct) {
    // attempt to require the local handler and run ensureUniverse directly
    try {
      const { ensureUniverse } = require('../api-handlers/markets.js');
      if (!secret || secret !== process.env.ADMIN_SECRET) {
        console.error('Direct run requires ADMIN_SECRET env var to match provided secret');
      }
      console.log('Running ensureUniverse() directly (requires DB env/credentials)...');
      await ensureUniverse();
      console.log('ensureUniverse() completed. Now checking market count...');
      const db = require('../api-handlers/db-client.js').default;
      const { data, error, count } = await db.from('markets').select('*', { count: 'exact', head: true });
      if (error) {
        console.error('DB count failed', error);
        process.exit(2);
      }
      console.log('Markets count:', count || 0);
      process.exit(0);
    } catch (err) {
      console.error('Direct run failed:', err.message || err);
      process.exit(3);
    }
  }

  if (!secret) {
    console.error('No admin secret provided. Pass --secret or set ADMIN_SECRET env var.');
    process.exit(1);
  }
  try {
    console.log(`Calling ${url}/api/admin/seed-markets`);
    const r = await callEndpoint(url, secret);
    console.log('Status:', r.status);
    console.log('Body:', JSON.stringify(r.body, null, 2));
  } catch (err) {
    console.error('Request failed:', err.message || err);
    process.exit(2);
  }
}

main();
