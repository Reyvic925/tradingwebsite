import supabase from './db-client.js';
import { createNotification } from './notification-service.js';
import { first, requireUser as authUser, getProfileRow } from './helpers.js';
import cryptoKeys from './crypto-keys.js';
import { logAdminAction } from './admin-helpers.js';
import userKycHandler from './user-kyc.js';

async function requireUser(req) {
  return authUser(supabase, req);
}

const DEFAULT_SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'MATIC', 'AVAX', 'ARB', 'OP', 'BASE'];

function isMissingSchemaError(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || err?.code === '42703' || /does not exist/.test(msg) || /relation .* does not exist/.test(msg) || /column .* does not exist/.test(msg);
}

async function getOrCreateUserMnemonic(userId) {
  // Try to retrieve existing mnemonic
  const { data: existing, error: fetchErr } = await supabase
    .from('user_mnemonics')
    .select('encrypted_mnemonic')
    .eq('user_id', userId)
    .limit(1);

  if (!fetchErr && existing && existing.length > 0) {
    return cryptoKeys.decryptString(existing[0].encrypted_mnemonic);
  }

  // Generate new mnemonic for this user
  const mnemonic = cryptoKeys.generateUserMnemonic();
  const encryptedMnemonic = cryptoKeys.encryptString(mnemonic);
  
  const { error: createErr } = await supabase.from('user_mnemonics').insert({
    user_id: userId,
    encrypted_mnemonic: encryptedMnemonic,
  });

  if (createErr && !isMissingSchemaError(createErr)) {
    console.error('[user] Failed to store user mnemonic', createErr.message);
  }

  return mnemonic;
}

async function ensureAssignedCryptoAddressesForUser(userId) {
  // Get or create the user's mnemonic
  const userMnemonic = await getOrCreateUserMnemonic(userId);

  // Derive all wallet variants from the user's mnemonic
  const wallets = await cryptoKeys.generateAllWalletVariantsFromMnemonic(userMnemonic);
  const requiredRows = Object.entries(wallets).map(([variant, wallet]) => ({
    variant,
    currency: wallet.currency,
    network: wallet.network,
    address: wallet.address,
    encrypted_private_key: wallet.encryptedPrivateKey,
    encrypted_mnemonic: wallet.encryptedMnemonic,
  }));

  // First, delete all old crypto addresses for this user to ensure we have fresh addresses
  // This is important when we update the code to use new derivation paths
  await supabase
    .from('crypto_addresses')
    .delete()
    .eq('user_id', userId)
    .then((result) => {
      if (result.error && !isMissingSchemaError(result.error)) {
        console.error('[user] Failed to delete old addresses', result.error.message);
      }
    });

  const seenRows = new Set();

  // Now create fresh addresses from the current mnemonic
  for (const row of requiredRows) {
    const rowKey = `${row.currency}|${row.network || ''}|${row.address}`;
    if (seenRows.has(rowKey)) continue;
    seenRows.add(rowKey);

    const { error: createErr } = await supabase.from('crypto_addresses').insert({
      user_id: userId,
      currency: row.currency,
      address: row.address,
      encrypted_private_key: row.encrypted_private_key,
      encrypted_mnemonic: row.encrypted_mnemonic,
      network: row.network,
      metadata: { network: row.network, auto_assigned: true, wallet_variant: row.variant },
    });

    if (createErr) {
      if (!isMissingSchemaError(createErr)) {
        console.error('[user] ensureAssignedCryptoAddressesForUser create failed', createErr.message);
      }
    }
  }
}

function downsample(points, maxPoints = 500) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  // ensure last point is included
  if (out.length && out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const url = new URL(req.url, `http://localhost`);
    const parts = url.pathname.split('/').filter(Boolean); // e.g. ['api','user','order','123','chart']
    // normalize: if first is 'api' drop it
    if (parts[0] === 'api') parts.shift();
    // after this parts[0] === 'user'

    // /api/user/kyc (submit application + view history) -> dedicated handler
    if (parts[1] === 'kyc' && !parts[2] && (req.method === 'GET' || req.method === 'POST')) {
      return userKycHandler(req, res);
    }

    // GET /api/user/order/:id (details)
    if (req.method === 'GET' && parts[1] === 'order' && parts[2] && !parts[3]) {
      const id = Number(parts[2]);
      if (!id) return res.status(400).json({ error: 'Missing order id' });
      const { data: orders, error: oErr } = await supabase.from('orders').select('*').eq('id', id).eq('user_id', user.id).limit(1);
      if (oErr) throw oErr;
      const order = first(orders);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      const { data: posRows } = await supabase.from('positions').select('*').eq('user_id', user.id).eq('market_id', order.market_id).eq('status', 'open').limit(1);
      const position = first(posRows);
      return res.status(200).json({ ...order, position });
    }

    // POST /api/user/order/:id/close
    if (req.method === 'POST' && parts[1] === 'order' && parts[2] && parts[3] === 'close') {
      const id = Number(parts[2]);
      if (!id) return res.status(400).json({ error: 'Missing order id' });
      const { data: orders, error: oErr } = await supabase.from('orders').select('*').eq('id', id).eq('user_id', user.id).limit(1);
      if (oErr) throw oErr;
      const order = first(orders);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const { data: posRows } = await supabase.from('positions').select('*').eq('user_id', user.id).eq('market_id', order.market_id).eq('status', 'open').limit(1);
      const pos = first(posRows);
      if (!pos) return res.status(404).json({ error: 'Open position not found' });

      const { data: marketRows } = await supabase.from('markets').select('*').eq('id', pos.market_id).limit(1);
      const market = first(marketRows);
      const price = market ? Number(market.price) : Number(pos.current_price || 0);
      const dir = pos.side === 'long' || pos.side === 'buy' ? 1 : -1;
      const pnl = (price - Number(pos.entry_price)) * Number(pos.quantity) * dir;

      const { data: wallets } = await supabase.from('wallets').select('*').eq('user_id', user.id).order('id', { ascending: true });
      const wallet = (wallets && wallets[0]) || null;
      if (wallet) {
        await supabase
          .from('wallets')
          .update({
            available: Number(wallet.available) + Number(pos.margin) + pnl,
            reserved: Math.max(0, Number(wallet.reserved) - Number(pos.margin)),
          })
          .eq('id', wallet.id);
      }

      const { data: updated, error: uErr } = await supabase
        .from('positions')
        .update({ status: 'closed', current_price: price, pnl, closed_at: new Date().toISOString() })
        .eq('id', pos.id)
        .select();
      if (uErr) throw uErr;

      await supabase.from('orders').insert({
        user_id: user.id,
        market_id: pos.market_id,
        symbol: pos.symbol,
        side: dir === 1 ? 'sell' : 'buy',
        type: 'market',
        quantity: pos.quantity,
        price,
        status: 'filled',
        filled_price: price,
      });

      await createNotification(supabase, {
        user_id: user.id,
        title: `Closed ${pos.symbol}`,
        body: `Realized P&L ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USD at ${price}`,
        read: false,
      });

      return res.status(200).json(first(updated));
    }

    // GET /api/user/order/:id/chart
    if (req.method === 'GET' && parts[1] === 'order' && parts[3] === 'chart') {
      const id = Number(parts[2]);
      if (!id) return res.status(400).json({ error: 'Missing order id' });

      // try orders
      const { data: orders } = await supabase.from('orders').select('*').eq('id', id).eq('user_id', user.id).limit(1);
      let row = first(orders);
      let kind = 'order';
      if (!row) {
        // fall back to positions
        const { data: pos } = await supabase.from('positions').select('*').eq('id', id).eq('user_id', user.id).limit(1);
        row = first(pos);
        kind = 'position';
      }
      if (!row) return res.status(404).json({ error: 'Order/Position not found' });

      const marketId = row.market_id;
      const startTs = row.created_at || row.entry_time || row.created || null;
      // fetch up to 2000 points then downsample in JS
      const q = supabase
        .from('price_history')
        .select('ts,price')
        .eq('market_id', marketId)
        .order('ts', { ascending: true })
        .limit(2000);
      if (startTs) q.gte('ts', startTs);
      const { data, error } = await q;
      if (error) throw error;
      const points = (data || []).map((r) => ({ ts: r.ts, price: Number(r.price) }));
      const out = downsample(points, 500);
      return res.status(200).json(out);
    }

    // GET /api/user/crypto-addresses
    if (req.method === 'GET' && parts[1] === 'crypto-addresses' && !parts[2]) {
      await ensureAssignedCryptoAddressesForUser(user.id);
      try {
        const { data: rows, error: aErr } = await supabase
          .from('crypto_addresses')
          .select('id, currency, network, address, created_at, last_used_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (aErr) {
          if (isMissingSchemaError(aErr)) return res.status(200).json([]);
          throw aErr;
        }

        const deduped = Array.from(
          new Map(
            (rows || []).map((row) => [`${row.currency}|${row.network || ''}|${row.address}`, row])
          ).values()
        );

        return res.status(200).json(deduped);
      } catch (err) {
        if (isMissingSchemaError(err)) return res.status(200).json([]);
        throw err;
      }
    }

    // POST /api/user/withdraw/crypto
    if (req.method === 'POST' && parts[1] === 'withdraw' && parts[2] === 'crypto') {
      const { amount, currency, address: dest } = req.body || {};
      const amt = Number(amount || 0);
      if (!(amt > 0)) return res.status(400).json({ error: 'Invalid amount' });
      if (!dest) return res.status(400).json({ error: 'Destination address required' });

      // Withdrawals require completed KYC verification
      const profile = await getProfileRow(supabase, user.id).catch(() => null);
      if (!profile || profile.kyc_status !== 'verified') {
        return res.status(403).json({ error: 'KYC verification is required before withdrawing. Complete verification on the KYC page.' });
      }

      const { data: wallets } = await supabase.from('wallets').select('*').eq('user_id', user.id).order('id', { ascending: true }).limit(1);
      const wallet = (wallets && wallets[0]) || null;
      if (!wallet || Number(wallet.available) < amt) return res.status(400).json({ error: 'Insufficient funds' });

      // Deduct available and insert a withdrawal transaction
      await supabase.from('wallets').update({ available: Number(wallet.available) - amt }).eq('id', wallet.id);
      const tx = {
        user_id: user.id,
        amount: amt,
        currency: currency || 'USDT',
        type: 'withdrawal',
        method: 'crypto',
        status: 'pending',
        reference: `WDR-${Date.now().toString(36).toUpperCase()}`,
        created_at: new Date().toISOString(),
      };
      const { data: inserted, error: txErr } = await supabase.from('transactions').insert(tx).select();
      if (txErr) throw txErr;
      await logAdminAction(user.id, 'user.withdraw.initiated', 'transaction', inserted?.[0]?.id || null, { currency: tx.currency, amount: amt });
      return res.status(200).json({ ok: true, tx: inserted?.[0] || null });
    }

    // GET /api/user/portfolio/chart
    if (req.method === 'GET' && parts[1] === 'portfolio' && parts[2] === 'chart') {
      // get wallet
      const { data: wallets } = await supabase.from('wallets').select('*').eq('user_id', user.id).order('id', { ascending: true });
      const wallet = (wallets && wallets[0]) || { available: 0, reserved: 0 };
      // get open positions
      const { data: positions } = await supabase.from('positions').select('*').eq('user_id', user.id).order('id', { ascending: true });
      const posArr = positions || [];
      if (!posArr.length) {
        const now = new Date().toISOString();
        return res.status(200).json([{ ts: now, equity: Number(wallet.available || 0) + Number(wallet.reserved || 0) }]);
      }

      // determine markets and min start
      const markets = {};
      let minTs = null;
      for (const p of posArr) {
        markets[p.market_id] = true;
        const ts = p.created_at || p.entry_time || p.created || null;
        if (ts && (!minTs || new Date(ts) < new Date(minTs))) minTs = ts;
      }
      // if no start found, default to 7 days ago
      if (!minTs) minTs = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

      // fetch price history for each market (parallel)
      const marketIds = Object.keys(markets).map((m) => Number(m));
      const perMarket = {};
      for (const mid of marketIds) {
        const { data, error } = await supabase
          .from('price_history')
          .select('ts,price')
          .eq('market_id', mid)
          .gte('ts', minTs)
          .order('ts', { ascending: true })
          .limit(2000);
        if (error) throw error;
        perMarket[mid] = (data || []).map((r) => ({ ts: r.ts, price: Number(r.price) }));
      }

      // build sorted unique timestamps (merge)
      const tsSet = new Set();
      for (const arr of Object.values(perMarket)) for (const p of arr) tsSet.add(p.ts);
      const tsList = Array.from(tsSet).sort((a, b) => new Date(a) - new Date(b));
      // limit to 2000 timestamps max then downsample to 500
      let timestamps = tsList.slice(-2000);
      if (timestamps.length === 0) timestamps = [new Date().toISOString()];

      // helper to get latest price at or before ts for market (two-pointer)
      function priceAt(arr, ts) {
        if (!arr || !arr.length) return null;
        // binary search for last <= ts
        let lo = 0; let hi = arr.length - 1; let idx = -1;
        const tMs = new Date(ts).getTime();
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const midMs = new Date(arr[mid].ts).getTime();
          if (midMs <= tMs) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
        }
        if (idx === -1) return arr[0].price; // earliest
        return arr[idx].price;
      }

      const series = [];
      for (const ts of timestamps) {
        let totalPnl = 0;
        for (const p of posArr) {
          const arr = perMarket[p.market_id] || [];
          const price = priceAt(arr, ts);
          if (price == null) continue;
          const dir = p.side === 'long' || p.side === 'buy' ? 1 : -1;
          totalPnl += (price - Number(p.entry_price)) * Number(p.quantity) * dir;
        }
        const equity = Number(wallet.available || 0) + Number(wallet.reserved || 0) + totalPnl;
        series.push({ ts, equity });
      }

      const out = downsample(series, 500);
      return res.status(200).json(out);
    }

    res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
