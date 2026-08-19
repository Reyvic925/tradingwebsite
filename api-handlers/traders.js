import supabase from './db-client.js';
import { requireUser as authUser, first } from './helpers.js';

const AVATAR_BUCKET = 'trader-avatars';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

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

async function requireAdmin(req) {
  // DEVELOPMENT MODE: Allow creation with ?admin_key=dev_test_key for testing
  // Remove this in production or replace with proper API key validation
  if (process.env.NODE_ENV !== 'production' && req.query?.admin_key === 'dev_test_key') {
    return { id: 'dev-user', email: 'dev@test.local' };
  }

  const user = await authUser(supabase, req);
  if (!user) return null;
  
  // Check if user is admin (implement based on your auth system)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();
  
  return profile?.role === 'admin' ? user : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // GET: Fetch active traders, sorted by total_return
    if (req.method === 'GET') {
      const { session, asset } = req.query;
      let query = supabase
        .from('traders')
        .select('*')
        .eq('is_active', true)
        .order('total_return', { ascending: false });
      
      if (session) {
        query = query.eq('session_type', session);
      }
      
      if (asset) {
        // Filter by asset focus (requires PostgreSQL array contains)
        query = query.contains('asset_focus', [asset]);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // POST: Create new trader (Admin only)
    if (req.method === 'POST') {
      const admin = await requireAdmin(req);
      if (!admin) return res.status(403).json({ error: 'Admin access required' });

      const {
        name, bio, avatar_url, avatar_data, asset_focus, session_type,
        drift, volatility, risk_score
      } = req.body || {};

      if (!name || (!avatar_url && !avatar_data)) {
        return res.status(400).json({ error: 'Name and avatar image required' });
      }

      const resolvedAvatarUrl = await resolveAvatarUrl(avatar_data, avatar_url);

      const { data, error } = await supabase
        .from('traders')
        .insert({
          name,
          bio: bio || '',
          avatar_url: resolvedAvatarUrl,
          asset_focus: asset_focus || ['BTC-USD', 'ETH-USD'],
          current_equity: 10000.00,
          total_return: 0.00,
          daily_return: 0.00,
          total_trades: 0,
          win_rate_trades: 50.00,
          max_drawdown: 0.00,
          volatility: volatility || 0.005,
          drift: drift || 0.001,
          risk_score: Math.min(Math.max(risk_score || 5, 1), 10),
          session_type: session_type || 'nyc',
          is_active: true,
          followers: 0
        })
        .select();
      
      if (error) throw error;
      return res.status(201).json(first(data));
    }

    // PUT: Update trader (Admin only)
    if (req.method === 'PUT') {
      const admin = await requireAdmin(req);
      if (!admin) return res.status(403).json({ error: 'Admin access required' });

      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Trader ID required' });

      const updateData = { ...req.body };
      delete updateData.id; // Prevent ID modification

      if (updateData.avatar_data) {
        updateData.avatar_url = await resolveAvatarUrl(updateData.avatar_data, updateData.avatar_url);
      }
      delete updateData.avatar_data;
      
      if (updateData.risk_score) {
        updateData.risk_score = Math.min(Math.max(updateData.risk_score, 1), 10);
      }

      const { data, error } = await supabase
        .from('traders')
        .update({ ...updateData, updated_at: new Date() })
        .eq('id', id)
        .select();
      
      if (error) throw error;
      return res.status(200).json(first(data));
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
