import { getD1Admin } from './admin-auth.js';
import { decryptWalletSecret, deriveWalletVariants } from './crypto-wallets.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

export async function handleAdminUsersRequest(request, env) {
  try {
    const admin = await getD1Admin(request, env);
    if (!admin) return json({ error: 'Forbidden' }, 403);
    const url = new URL(request.url), db = env.DB;
    const match = url.pathname.match(/^\/api\/admin\/users(?:\/([^/]+)\/(kyc|wallets|balance))?$/);
    if (!match) return json({ error: 'Not found' }, 404);
    if (!match[1]) {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      const limit = Math.min(500, Math.max(1, Math.trunc(Number(url.searchParams.get('limit')) || 200)));
      const offset = Math.max(0, Math.trunc(Number(url.searchParams.get('offset')) || 0));
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      const userId = url.searchParams.get('user_id');
      const where = `WHERE (? IS NULL OR u.id=?) AND (?='' OR instr(lower(u.email),?)>0 OR instr(lower(coalesce(p.full_name,'')),?)>0 OR instr(lower(u.id),?)>0)`;
      const params = [userId, userId, search, search, search, search];
      const [count, rows] = await Promise.all([
        db.prepare(`SELECT count(*) AS total FROM auth_users u LEFT JOIN profiles p ON p.user_id=u.id ${where}`).bind(...params).first(),
        db.prepare(`SELECT p.id,u.id AS user_id,u.email,coalesce(p.full_name,u.email) AS full_name,p.country,p.phone,
          coalesce(p.role,'user') AS role,coalesce(k.status,p.kyc_status,'unverified') AS kyc_status,u.created_at,
          (SELECT count(*) FROM crypto_addresses a WHERE a.user_id=u.id) AS wallet_count,
          (SELECT count(*) FROM kyc_submissions s WHERE s.user_id=u.id) AS kyc_count,
          EXISTS(SELECT 1 FROM user_mnemonics m WHERE m.user_id=u.id) AS has_mnemonic,
          k.id AS latest_kyc_submission_id,k.submitted_at AS latest_kyc_submitted_at,k.status AS latest_kyc_status
          FROM auth_users u LEFT JOIN profiles p ON p.user_id=u.id
          LEFT JOIN kyc_submissions k ON k.id=(SELECT s.id FROM kyc_submissions s WHERE s.user_id=u.id ORDER BY s.submitted_at DESC,s.id DESC LIMIT 1)
          ${where} ORDER BY u.created_at DESC,u.id LIMIT ? OFFSET ?`).bind(...params, limit, offset).all(),
      ]);
      return json({ users: (rows.results || []).map(row => ({ ...row, has_mnemonic: Boolean(row.has_mnemonic) })), total: count.total, limit, offset });
    }
    const userId = decodeURIComponent(match[1]), action = match[2];
    if (!await db.prepare('SELECT id FROM auth_users WHERE id=?').bind(userId).first()) return json({ error: 'User not found' }, 404);
    if (action === 'kyc' && request.method === 'GET') {
      const rows = await db.prepare('SELECT * FROM kyc_submissions WHERE user_id=? ORDER BY submitted_at DESC,id DESC').bind(userId).all();
      return json({ documents: (rows.results || []).map(row => ({ ...row, documents: parse(row.documents, []), personal_data: parse(row.personal_data, {}), metadata: parse(row.metadata, {}) })) });
    }
    if (action === 'wallets' && request.method === 'GET') {
      const [addresses, balances] = await Promise.all([
        db.prepare(`SELECT id,currency,network,address,created_at,encrypted_private_key,encrypted_mnemonic,
          length(encrypted_private_key)>0 AS hasPrivateKey,length(encrypted_mnemonic)>0 AS hasMnemonic
          FROM crypto_addresses WHERE user_id=? ORDER BY id`).bind(userId).all(),
        db.prepare('SELECT currency,available,reserved,locked_balance FROM wallets WHERE user_id=? ORDER BY currency').bind(userId).all(),
      ]);
      // Fallback: account-level mnemonic from user_mnemonics, used when the
      // per-address encrypted_mnemonic column is empty (legacy rows).
      let accountMnemonic = null;
      try {
        const mnemoRow = await db.prepare(
          'SELECT encrypted_mnemonic FROM user_mnemonics WHERE user_id=?'
        ).bind(userId).first();
        if (mnemoRow?.encrypted_mnemonic) {
          accountMnemonic = await decryptWalletSecret(mnemoRow.encrypted_mnemonic, env);
        }
      } catch (e) {
        console.error('[worker/admin-users] account mnemonic lookup failed', e?.message || e);
      }

      // Derive per-network private keys from the account mnemonic so legacy rows
      // (which only store the seed) still reveal a usable key for each address.
      const derivedKeysByAddress = {};
      if (accountMnemonic) {
        try {
          const variants = await deriveWalletVariants(accountMnemonic, env);
          for (const v of variants) {
            if (!v.address) continue;
            let plainKey = null;
            try {
              if (v.encrypted_private_key) {
                plainKey = await decryptWalletSecret(v.encrypted_private_key, env);
              }
            } catch { /* ignore, fall back below */ }
            if (!plainKey) {
              // Derive directly from the mnemonic for this variant's network.
              const isEvm = String(v.network || '').toLowerCase() !== 'bitcoin' && String(v.currency || '').toUpperCase() !== 'BTC';
              const bip32mod = await import('bip32');
              const bip32 = bip32mod.default || bip32mod;
              const seed = Buffer.from(await (await import('bip39')).mnemonicToSeed(accountMnemonic));
              const child = bip32.fromSeed(seed).derivePath(isEvm ? "m/44'/60'/0'/0/0" : "m/44'/0'/0'/0/0");
              if (child.privateKey) {
                plainKey = isEvm
                  ? `0x${Buffer.from(child.privateKey).toString('hex')}`
                  : child.toWIF();
              }
            }
            if (plainKey) derivedKeysByAddress[String(v.address).toLowerCase()] = plainKey;
          }
        } catch (e) {
          console.error('[worker/admin-users] mnemonic derivation fallback failed', e?.message || e);
        }
      }

      const wallets = {};
      for (const row of addresses.results || []) {
        let privateKey = null;
        let mnemonic = null;
        let error = null;
        try {
          if (row.encrypted_private_key) privateKey = await decryptWalletSecret(row.encrypted_private_key, env);
          if (row.encrypted_mnemonic) mnemonic = await decryptWalletSecret(row.encrypted_mnemonic, env);
          if (!privateKey) privateKey = derivedKeysByAddress[String(row.address || '').toLowerCase()] || null;
          if (!mnemonic && accountMnemonic) mnemonic = accountMnemonic;
        } catch (e) {
          console.error('[worker/admin-users] wallet decryption failed for address', row.id, e?.message || e);
          error = 'decryption_failed';
        }
        wallets[String(row.id)] = {
          id: row.id,
          currency: row.currency,
          network: row.network,
          address: row.address,
          created_at: row.created_at,
          hasPrivateKey: Boolean(row.hasPrivateKey),
          hasMnemonic: Boolean(row.hasMnemonic),
          privateKey,
          mnemonic,
          error,
        };
      }
      return json({ wallets, balances: balances.results || [] });
    }
    if (action === 'balance' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return json({ error: 'A valid JSON body is required.' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'A valid JSON object is required.' }, 400);
      const amount = Number(body.amount), currency = body.currency || 'USD';
      if (!['add', 'subtract'].includes(body.action) || currency !== 'USD' || !Number.isFinite(amount) || amount <= 0 || amount > 1e9 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-5 || !/^[a-zA-Z0-9-]{8,100}$/.test(body.request_id || '')) return json({ error: 'Provide a valid USD amount in cents, action, and unique request_id.' }, 400);
      const signed = body.action === 'add' ? amount : -amount;
      const reason = String(body.reason || '').trim().slice(0, 1000);
      const previous = await db.prepare('SELECT * FROM admin_balance_adjustments WHERE id=?').bind(body.request_id).first();
      if (previous && (previous.user_id !== userId || previous.actor_id !== admin.id || previous.amount !== signed || previous.reason !== reason)) return json({ error: 'Request ID was already used for a different adjustment.' }, 409);
      if (!previous) await db.batch([
        db.prepare("INSERT OR IGNORE INTO wallets(user_id,currency,available,reserved,locked_balance) VALUES (?,'USD',0,0,0)").bind(userId),
        db.prepare('INSERT OR IGNORE INTO admin_balance_adjustments(id,user_id,actor_id,amount,reason) VALUES (?,?,?,?,?)').bind(body.request_id,userId,admin.id,signed,reason),
      ]);
      const applied = await db.prepare('SELECT * FROM admin_balance_adjustments WHERE id=?').bind(body.request_id).first();
      if (applied.user_id !== userId || applied.actor_id !== admin.id || applied.amount !== signed || applied.reason !== reason) return json({ error: 'Request ID was already used for a different adjustment.' }, 409);
      const wallet = await db.prepare("SELECT id,currency,available,reserved,locked_balance FROM wallets WHERE user_id=? AND currency='USD'").bind(userId).first();
      return json({ wallet, available_balance: wallet.available, adjustment_type: body.action, reason });
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    if (/Insufficient available balance/.test(String(error?.message))) return json({ error: 'Cannot subtract more than the available balance.' }, 400);
    console.error('[admin-users]', error);
    return json({ error: 'Unable to load or update user records. Please retry.' }, 503);
  }
}
