/*
Generic blockchain webhook receiver
- Endpoint: POST /api/webhook/blockchain
- Validates HMAC-SHA256 signature header (X-Webhook-Signature) if BLOCKCHAIN_WEBHOOK_SECRET is set
- Expects payload: { address, tx_hash, amount, currency, confirmed }
- Uses same credit logic as deposit-detector (via REST to Supabase)
- Honors DRY_RUN=true to avoid writes during local testing
*/

const crypto = require('crypto');
const { creditDeposit } = require('./deposit-detector');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const WEBHOOK_SECRET = process.env.BLOCKCHAIN_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
const DRY_RUN = (process.env.DRY_RUN || '').toLowerCase() === 'true';

function errJson(res, code, message) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = code;
  res.end(JSON.stringify({ error: message }));
}

function okJson(res, obj) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify(obj));
}

function verifySignature(rawBody, headerSig) {
  if (!WEBHOOK_SECRET) return true; // no secret configured
  if (!headerSig) return false;
  const h = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(headerSig));
}

// Minimal handler
async function handler(req, res) {
  try {
    const sig = req.headers['x-webhook-signature'] || req.headers['x-signature'] || req.headers['x-hub-signature'];
    const rawBody = req.rawBody || (req._rawBody || JSON.stringify(req.body));
    if (!verifySignature(rawBody, sig)) return errJson(res, 401, 'Invalid signature');

    const payload = req.body;
    if (!payload || !payload.address || !payload.tx_hash || !payload.amount) {
      return errJson(res, 400, 'Invalid payload; expected address, tx_hash, amount');
    }

    // Find owner for address if possible via Supabase
    let ownerId = payload.user_id || null;
    if (!ownerId && SUPABASE_URL && SUPABASE_KEY) {
      try {
        const url = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/crypto_addresses?address=eq.' + encodeURIComponent(payload.address.toLowerCase()) + '&select=user_id,id,currency';
        const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data) && data.length > 0) {
            ownerId = data[0].user_id;
          }
        }
      } catch (err) { /* ignore */ }
    }

    const ts = payload.timestamp || Math.floor(Date.now() / 1000);
    const currency = payload.currency || 'ETH';

    if (DRY_RUN) {
      console.log('[DRY_RUN] webhook payload', payload, 'ownerId=', ownerId);
      return okJson(res, { ok: true, dryRun: true });
    }

    // Credit deposit
    try {
      await creditDeposit({ user_id: ownerId, amount: payload.amount, currency, tx_hash: payload.tx_hash, timestamp: ts }, false);
    } catch (err) {
      console.error('Failed to credit deposit from webhook', err);
      return errJson(res, 500, 'Failed to credit deposit: ' + err.message);
    }

    return okJson(res, { ok: true });
  } catch (err) {
    console.error('Webhook handler error', err);
    return errJson(res, 500, 'Internal error');
  }
}

module.exports = { handler };
