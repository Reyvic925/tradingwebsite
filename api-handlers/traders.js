import supabase from './db-client.js';
import { first } from './helpers.js';
import { requireAdmin } from './auth-admin.js';
import { sanitizeTraderRecord, normalizeAssetFocus, filterVisibleTraders, validateTraderRecord } from './trader-validation.js';
import { reconcileTraderCopierMetrics } from './copier-metrics.js';

const AVATAR_BUCKET = 'trader-avatars';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

async function syncTraderSimulationState(trader, resetMetricBaseline = false) {
  const { data: existing, error: lookupError } = await supabase
    .from('trader_simulation_state')
    .select('trader_id, state, tick_index, last_processed_at, window_started_at')
    .eq('trader_id', trader.id)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const startingEquity = Number(trader.current_equity) || 10000;
  const config = {
    strategyType: 'momentum',
    assetClass: 'multi_asset',
    assets: trader.asset_focus,
    session: trader.session_type || 'crypto',
    startingEquity,
    targetReturnProfile: Number(trader.total_return) || 0,
    targetWinRate: (Number(trader.win_rate_trades) || 50) / 100,
    riskProfile: Number(trader.risk_score) || 5,
  };

  if (resetMetricBaseline) {
    const { error: tradeDeleteError } = await supabase
      .from('trade_logs')
      .delete()
      .eq('trader_id', trader.id)
      .not('event_id', 'is', null);
    if (tradeDeleteError) throw tradeDeleteError;

    const { error: snapshotDeleteError } = await supabase
      .from('synthetic_equity_snapshots')
      .delete()
      .eq('trader_id', trader.id);
    if (snapshotDeleteError) throw snapshotDeleteError;
  }

  const payload = {
    trader_id: trader.id,
    seed: `trader-${trader.id}`,
    config: {
      ...config,
      metricBaseline: resetMetricBaseline
        ? {
            totalReturn: Number(trader.total_return) || 0,
            totalTrades: Math.max(0, Math.trunc(Number(trader.total_trades) || 0)),
            winRate: Math.min(100, Math.max(0, Number(trader.win_rate_trades) || 0)),
            maxDrawdown: Math.max(0, Number(trader.max_drawdown) || 0),
          }
        : existing?.state?.metricBaseline
    },
    state: resetMetricBaseline ? {
      equity: startingEquity,
      peakEquity: startingEquity,
      prices: {},
      lossStreak: 0,
    } : existing?.state || {
      equity: startingEquity,
      peakEquity: startingEquity,
      prices: {},
      lossStreak: 0,
    },
    tick_index: existing?.tick_index || 0,
    last_processed_at: existing?.last_processed_at || null,
    window_started_at: existing?.window_started_at || new Date().toISOString(),
  };

  const { error: saveError } = await supabase
    .from('trader_simulation_state')
    .upsert(payload, { onConflict: 'trader_id' });
  if (saveError) throw saveError;
}

async function resolveAvatarUrl(avatarData, existingUrl = '') {
  if (!avatarData) return existingUrl;
  if (typeof avatarData !== 'string' || !avatarData.startsWith('data:image/')) {
    throw new Error('Avatar must be a valid image');
  }

  const match = avatarData.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([\s\S]+)$/i);
  if (!match) throw new Error('Avatar must be PNG, JPG, WEBP, or GIF');

  const contentType = match[1].toLowerCase().replace('jpg', 'jpeg');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_AVATAR_BYTES) {
    throw new Error('Avatar must be smaller than 2 MB');
  }

  if (!supabase.storage?.from) return avatarData;

  const extension = contentType.split('/')[1];
  const path = `traders/${crypto.randomUUID()}.${extension}`;
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  const { error: uploadError } = await bucket.upload(path, buffer, {
    contentType,
    upsert: false,
  });

  if (uploadError) {
    if (/not found|does not exist/i.test(uploadError.message || '')) {
      const { error: bucketError } = await supabase.storage.createBucket(AVATAR_BUCKET, { public: true });
      if (bucketError && !/already exists/i.test(bucketError.message || '')) throw bucketError;
      const retry = await bucket.upload(path, buffer, { contentType, upsert: false });
      if (retry.error) throw retry.error;
    } else {
      throw uploadError;
    }
  }

  const { data } = bucket.getPublicUrl(path);
  return data.publicUrl;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // GET: Fetch active traders, sorted by total_return
    if (req.method === 'GET') {
      const { id, session, asset, include_inactive } = req.query;
      let query = supabase
        .from('traders')
        .select('*')
        .order('total_return', { ascending: false });

      if (id) {
        if (!/^\d+$/.test(String(id))) return res.status(400).json({ error: 'Trader ID must be an integer' });
        query = query.eq('id', id);
      }

      if (include_inactive === '1') {
        const admin = await requireAdmin(req);
        if (!admin) return res.status(403).json({ error: 'Admin access required' });
      } else {
        query = query.eq('is_active', true);
      }
      
      if (session) {
        query = query.eq('session_type', session);
      }
      
      if (asset) {
        // Filter by asset focus (requires PostgreSQL array contains)
        query = query.contains('asset_focus', [asset]);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      const normalized = (data || []).map((trader) => {
        try {
          return validateTraderRecord(trader);
        } catch (validationError) {
          console.error(`[traders] Invalid record rejected: ${trader?.id ?? 'unknown'} ${trader?.name ?? 'unknown'}: ${validationError.message}`);
          return null;
        }
      }).filter(Boolean).filter((trader) => include_inactive === '1' || trader.is_active !== false);
      return res.status(200).json(normalized);
    }

    // POST: Create new trader (Admin only)
    if (req.method === 'POST') {
      const admin = await requireAdmin(req);
      if (!admin) return res.status(403).json({ error: 'Admin access required' });

      const {
        name, bio, country, avatar_url, avatar_data, asset_focus, session_type,
        specialty, badge, risk_level, current_equity, drift, volatility, risk_score,
        total_return, daily_return, monthly_return, total_trades, win_rate_trades,
        max_drawdown, profit_sharing_fee, session_start, session_end
      } = req.body || {};

      if (!name || (!avatar_url && !avatar_data)) {
        return res.status(400).json({ error: 'Name and avatar image required' });
      }

      const resolvedAvatarUrl = await resolveAvatarUrl(avatar_data, avatar_url);
      const safePayload = validateTraderRecord({
        name,
        bio: bio || '',
        country: country || '',
        avatar_url: resolvedAvatarUrl,
        specialty: specialty || '',
        badge: badge || 'Gold',
        risk_level: risk_level || 'Medium',
        asset_focus: asset_focus || ['BTC-USD', 'ETH-USD', 'SOL-USD'],
        current_equity: current_equity,
        total_return: total_return,
        daily_return: daily_return,
        monthly_return: monthly_return,
        total_trades: total_trades,
        win_rate_trades: win_rate_trades,
        max_drawdown: max_drawdown,
        volatility: volatility || 0.005,
        drift: drift || 0.001,
        risk_score: risk_score || 5,
        session_type: session_type || 'nyc',
        is_active: true,
        profit_sharing_fee: profit_sharing_fee,
        session_start: session_start || new Date().toISOString().slice(0, 10),
        session_end: session_end || null
      });

      const { data, error } = await supabase
        .from('traders')
        .insert({
          ...safePayload,
          current_equity: Number.isFinite(Number(safePayload.current_equity)) ? Math.max(Number(safePayload.current_equity), 0) : 10000.00,
          total_return: Number.isFinite(Number(safePayload.total_return)) ? Number(safePayload.total_return) : 0.00,
          daily_return: Number.isFinite(Number(safePayload.daily_return)) ? Number(safePayload.daily_return) : 0.00,
          monthly_return: Number.isFinite(Number(safePayload.monthly_return)) ? Number(safePayload.monthly_return) : 0.00,
          total_trades: Number.isFinite(Number(safePayload.total_trades)) ? Math.max(Math.trunc(Number(safePayload.total_trades)), 0) : 0,
          win_rate_trades: Number.isFinite(Number(safePayload.win_rate_trades)) ? Math.min(Math.max(Number(safePayload.win_rate_trades), 0), 100) : 50.00,
          max_drawdown: Number.isFinite(Number(safePayload.max_drawdown)) ? Math.max(Number(safePayload.max_drawdown), 0) : 0.00,
          profit_sharing_fee: Number.isFinite(Number(safePayload.profit_sharing_fee)) ? Math.min(Math.max(Number(safePayload.profit_sharing_fee), 0), 100) : 20,
        })
        .select();
      
      if (error) throw error;
      const trader = first(data);
      await syncTraderSimulationState(trader);
      await reconcileTraderCopierMetrics(supabase, trader.id);
      return res.status(201).json(trader);
    }

    // PUT: Update trader (Admin only)
    if (req.method === 'PUT') {
      const admin = await requireAdmin(req);
      if (!admin) return res.status(403).json({ error: 'Admin access required' });

      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Trader ID required' });

      const updateData = { ...req.body };
      delete updateData.id; // Prevent ID modification
      delete updateData.followers;
      delete updateData.copiers_current;
      delete updateData.copiers_all_time;
      delete updateData.under_management;
      delete updateData.profit_for_copiers;
      if (updateData.session_start === '') delete updateData.session_start;
      if (updateData.session_end === '') updateData.session_end = null;

      if (updateData.avatar_data) {
        updateData.avatar_url = await resolveAvatarUrl(updateData.avatar_data, updateData.avatar_url);
      }
      delete updateData.avatar_data;
      
      if (updateData.risk_score) {
        updateData.risk_score = Math.min(Math.max(updateData.risk_score, 1), 10);
      }
      if (updateData.asset_focus) {
        updateData.asset_focus = normalizeAssetFocus(updateData.asset_focus, ['BTC-USD', 'ETH-USD', 'SOL-USD']);
      }
      if (updateData.total_return !== undefined) {
        const totalReturn = Number(updateData.total_return);
        if (!Number.isFinite(totalReturn)) return res.status(400).json({ error: 'Total return must be a number' });
        if (totalReturn < -99.99 || totalReturn > 499.99) {
          return res.status(400).json({ error: 'Total return must be between -99.99 and 499.99' });
        }
        updateData.total_return = totalReturn;
      }
      if (updateData.monthly_return !== undefined) {
        const monthlyReturn = Number(updateData.monthly_return);
        if (!Number.isFinite(monthlyReturn)) return res.status(400).json({ error: 'Monthly return must be a number' });
        if (monthlyReturn < -100 || monthlyReturn > 2000) {
          return res.status(400).json({ error: 'Monthly return is outside the supported range (-100 to 2000)' });
        }
        updateData.monthly_return = monthlyReturn;
      }
      if (updateData.win_rate_trades !== undefined) {
        const winRate = Number(updateData.win_rate_trades);
        if (!Number.isFinite(winRate)) return res.status(400).json({ error: 'Win rate must be a number' });
        updateData.win_rate_trades = Math.min(Math.max(winRate, 0), 100);
      }
      const sanitizedUpdate = validateTraderRecord(updateData);

      const { data, error } = await supabase
        .from('traders')
        .update({ ...sanitizedUpdate, updated_at: new Date() })
        .eq('id', id)
        .select();
      
      if (error) throw error;
      const trader = first(data);
      await syncTraderSimulationState(trader, true);
      await reconcileTraderCopierMetrics(supabase, id);
      return res.status(200).json(trader);
    }

    // DELETE: Delete trader (Admin only)
    if (req.method === 'DELETE') {
      const admin = await requireAdmin(req);
      if (!admin) return res.status(403).json({ error: 'Admin access required' });

      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Trader ID required' });

      // Soft delete (mark as inactive)
      const { error } = await supabase
        .from('traders')
        .update({ is_active: false, updated_at: new Date() })
        .eq('id', id);
      
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
