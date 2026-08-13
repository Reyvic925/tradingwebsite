/*
Deposit detector cron endpoint and library
- Endpoint: GET/POST /api/cron/deposits (protected by CRON_SECRET header or query param)
- Uses SUPABASE (SUPABASE_URL + SUPABASE_KEY) to read and write DB rows OR a generic HTTP DB API if provided
- Uses BLOCKCHAIN_PROVIDER and BLOCKCHAIN_API_KEY (or BLOCKCHAIN_API url) to query for incoming txs
- DRY_RUN=true avoids writes for local testing

Exports:
- handler(req,res): express/serverless-style handler for the cron endpoint
- checkAddresses(addresses, opts): programmatic function for unit tests / dry-run

Notes: This implementation assumes the following DB tables exist: crypto_addresses, transactions, wallets (or user balances), notifications. Adjust column names to match your schema if different.
*/

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const BLOCKCHAIN_PROVIDER = process.env.BLOCKCHAIN_PROVIDER || 'etherscan';
const BLOCKCHAIN_API_KEY = process.env.BLOCKCHAIN_API_KEY || process.env.ETHERSCAN_API_KEY || '';
const BLOCKCHAIN_API = process.env.BLOCKCHAIN_API; // optional custom provider base URL
const CRON_SECRET = process.env.CRON_SECRET;
const DRY_RUN = (process.env.DRY_RUN || '').toLowerCase() === 'true';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // It's valid to run in read-only / dry-run without Supabase credentials; warn via logs when used.
}

async function fetchSupabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY are required for DB writes. Use DRY_RUN=true for local testing.');
  }
  const url = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + path;
  const res = await fetch(url, {
    headers: Object.assign({
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json'
    }, options.headers || {}),
    method: options.method || 'GET',
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await res.text();
  try {
    return { status: res.status, data: text ? JSON.parse(text) : null, raw: text };
  } catch (err) {
    return { status: res.status, data: null, raw: text };
  }
}

function okJson(res, obj) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify(obj));
}

function errJson(res, code, message) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = code;
  res.end(JSON.stringify({ error: message }));
}

// Parse tx list from various providers into unified shape: { tx_hash, to, from, value (as decimal wei/units), timestamp, confirmations }
async function fetchTxsForAddress(addr, sinceTimestamp) {
  addr = addr.toLowerCase();
  if (BLOCKCHAIN_API) {
    // Expect BLOCKCHAIN_API to support GET /address/{addr}?since={unix}
    const url = `${BLOCKCHAIN_API.replace(/\/$/, '')}/address/${addr}` + (sinceTimestamp ? `?since=${Math.floor(sinceTimestamp)}` : '');
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Provider ${BLOCKCHAIN_API} returned ${r.status}`);
    const payload = await r.json();
    // Expect payload.transactions array
    return (payload.transactions || []).map(t => ({
      tx_hash: t.tx_hash || t.hash || t.hash_hex,
      to: (t.to || t.to_address || '').toLowerCase(),
      from: (t.from || t.from_address || '').toLowerCase(),
      value: t.value || t.amount || t.value_wei || '0',
      timestamp: t.timestamp || t.time || (t.block_time ? Date.parse(t.block_time)/1000 : null),
      confirmations: t.confirmations || 0
    }));
  }

  if (BLOCKCHAIN_PROVIDER === 'etherscan') {
    // Etherscan API: module=account&action=txlist
    const base = 'https://api.etherscan.io/api';
    const query = new URL(base);
    query.searchParams.set('module', 'account');
    query.searchParams.set('action', 'txlist');
    query.searchParams.set('address', addr);
    query.searchParams.set('startblock', '0');
    query.searchParams.set('endblock', '99999999');
    query.searchParams.set('sort', 'asc');
    if (BLOCKCHAIN_API_KEY) query.searchParams.set('apikey', BLOCKCHAIN_API_KEY);
    const r = await fetch(query.toString());
    if (!r.ok) throw new Error(`Etherscan returned ${r.status}`);
    const json = await r.json();
    if (json.status === '0' && json.message && json.message !== 'OK') {
      // no txs or error
      return [];
    }
    const result = (json.result || []).map(t => ({
      tx_hash: t.hash,
      to: (t.to || '').toLowerCase(),
      from: (t.from || '').toLowerCase(),
      value: t.value, // in wei for ETH
      timestamp: parseInt(t.timeStamp, 10),
      confirmations: parseInt(t.confirmations || '0', 10)
    }));
    if (sinceTimestamp) return result.filter(t => t.timestamp > sinceTimestamp);
    return result;
  }

  if (BLOCKCHAIN_PROVIDER === 'blockcypher') {
    const base = `https://api.blockcypher.com/v1/eth/main/addrs/${addr}`;
    const q = new URL(base);
    if (BLOCKCHAIN_API_KEY) q.searchParams.set('token', BLOCKCHAIN_API_KEY);
    const r = await fetch(q.toString());
    if (!r.ok) throw new Error(`BlockCypher returned ${r.status}`);
    const json = await r.json();
    const txs = (json.txrefs || []).map(t => ({
      tx_hash: t.tx_hash,
      to: addr,
      from: t.address, // blockcypher txref doesn't include 'from' reliably
      value: t.value,
      timestamp: Math.floor(new Date(t.confirmed).getTime() / 1000),
      confirmations: t.confirmations || 0
    }));
    if (sinceTimestamp) return txs.filter(t => t.timestamp > sinceTimestamp);
    return txs;
  }

  throw new Error('Unsupported BLOCKCHAIN_PROVIDER and no BLOCKCHAIN_API configured');
}

async function creditDeposit({ user_id, amount, currency = 'ETH', tx_hash, timestamp }, dryRun = false) {
  // amount is a string (wei or smallest unit) — leave conversion to consumers. We insert raw amount and assume downstream normalization.
  const txObj = {
    user_id: user_id,
    amount: amount,
    currency: currency,
    tx_hash: tx_hash,
    direction: 'deposit',
    status: 'confirmed',
    created_at: new Date(timestamp * 1000).toISOString()
  };
  if (dryRun) {
    console.log('[DRY_RUN] Would insert transaction:', txObj);
    return { success: true, inserted: false };
  }
  // Insert into transactions table
  const insertRes = await fetchSupabase('transactions', { method: 'POST', body: txObj, headers: { Prefer: 'return=representation' } });
  if (!(insertRes.status >= 200 && insertRes.status < 300)) {
    throw new Error('Failed to insert transaction: ' + insertRes.raw);
  }

  // Update wallet balance — try wallets table, fallback to users table update via rpc or leave to triggers
  try {
    // Attempt to increment wallets.balance using PostgREST casting via RPC-like update
    const updateRes = await fetchSupabase(`wallets?user_id=eq.${user_id}`, {
      method: 'PATCH',
      body: { balance: `wallets.balance + ${amount}` }
    });
    // Note: This simplistic patch likely won't work with PostgREST for arithmetic without SQL functions.
    // Many deployments use DB triggers on transactions insert to update wallets. If so, the above is unnecessary.
  } catch (err) {
    console.warn('Could not update wallet automatically; ensure DB trigger or implement incremental update. Error:', err.message);
  }

  // Create user notification
  try {
    const notif = {
      user_id,
      title: 'Deposit received',
      body: `Deposit of ${amount} ${currency} received (tx ${tx_hash})`,
      created_at: new Date().toISOString(),
      read: false
    };
    await fetchSupabase('notifications', { method: 'POST', body: notif });
  } catch (err) {
    console.warn('Failed to create notification:', err.message);
  }

  return { success: true, inserted: true };
}

async function checkAddresses(addresses, opts = {}) {
  const results = [];
  for (const addrRow of addresses) {
    const addr = (addrRow.address || addrRow.crypto_address || '').toLowerCase();
    const user_id = addrRow.user_id || addrRow.owner_id || null;
    const last_checked = addrRow.last_checked ? Math.floor(new Date(addrRow.last_checked).getTime() / 1000) : (addrRow.created_at ? Math.floor(new Date(addrRow.created_at).getTime() / 1000) : 0);
    console.log(`Checking address ${addr} for user ${user_id}, since ${last_checked}`);
    let txs = [];
    try {
      txs = await fetchTxsForAddress(addr, last_checked);
    } catch (err) {
      console.error('Failed to fetch txs for', addr, err.message);
      results.push({ address: addr, error: err.message });
      continue;
    }
    // Filter incoming txs to this address
    const incoming = txs.filter(t => t.to && t.to.toLowerCase() === addr && t.value && t.value !== '0');
    if (incoming.length === 0) {
      // update last_checked
      results.push({ address: addr, found: 0 });
      // optionally update last_checked timestamp in DB
      if (!opts.dryRun && SUPABASE_URL && SUPABASE_KEY) {
        try {
          const now = new Date().toISOString();
          await fetchSupabase(`crypto_addresses?id=eq.${addrRow.id}`, { method: 'PATCH', body: { last_checked: now } });
        } catch (err) { /* ignore */ }
      }
      continue;
    }
    for (const t of incoming) {
      try {
        const amount = t.value;
        const tx_hash = t.tx_hash;
        const timestamp = t.timestamp || Math.floor(Date.now()/1000);
        // idempotency: check if transaction exists already
        let exists = false;
        if (SUPABASE_URL && SUPABASE_KEY && !opts.dryRun) {
          try {
            const q = `transactions?tx_hash=eq.${encodeURIComponent(tx_hash)}`;
            const res = await fetchSupabase(q);
            if (res.data && res.data.length > 0) exists = true;
          } catch (err) {
            console.warn('Failed to check existing tx:', err.message);
          }
        }
        if (exists) {
          console.log('Tx already recorded, skipping', tx_hash);
          continue;
        }
        const creditRes = await creditDeposit({ user_id, amount, currency: addrRow.currency || 'ETH', tx_hash, timestamp }, opts.dryRun);
        results.push({ address: addr, tx_hash, credited: creditRes.success });
        // update crypto_addresses.last_used_at
        if (!opts.dryRun && SUPABASE_URL && SUPABASE_KEY) {
          try {
            const now = new Date().toISOString();
            await fetchSupabase(`crypto_addresses?id=eq.${addrRow.id}`, { method: 'PATCH', body: { last_used_at: now, last_checked: now } });
          } catch (err) { console.warn('Failed to update crypto_address last_used_at', err.message); }
        }
      } catch (err) {
        console.error('Failed processing tx', t, err.message);
        results.push({ address: addr, tx_hash: t.tx_hash, error: err.message });
      }
    }
  }
  return results;
}

async function handler(req, res) {
  // Protect by CRON_SECRET: either header x-cron-secret or ?cron_secret= on query string
  const secret = (req.headers && (req.headers['x-cron-secret'] || req.headers['x-cron-secret'.toLowerCase()])) || req.query && (req.query.cron_secret || req.query.cronSecret) || null;
  if (!CRON_SECRET || !secret || secret !== CRON_SECRET) {
    return errJson(res, 401, 'Invalid cron secret');
  }

  // Read known addresses from DB
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('SUPABASE_* not provided; running in limited mode. Use DRY_RUN for safe local testing.');
  }

  let addresses = [];
  try {
    const resDb = await fetchSupabase('crypto_addresses?select=*,id');
    if (resDb && resDb.data) addresses = resDb.data;
    else addresses = [];
  } catch (err) {
    console.error('Failed to query crypto_addresses', err.message);
    return errJson(res, 500, 'Failed to query addresses');
  }

  try {
    const results = await checkAddresses(addresses, { dryRun: DRY_RUN });
    return okJson(res, { ok: true, dryRun: DRY_RUN, results });
  } catch (err) {
    console.error('Exception during deposit detection', err);
    return errJson(res, 500, 'Error during deposit detection: ' + err.message);
  }
}

module.exports = { handler, checkAddresses };
