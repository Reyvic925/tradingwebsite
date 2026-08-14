import supabase from './db-client.js';
import { cors, requireUser as requireUserHelper } from './helpers.js';
import { requireAdmin } from './auth-admin.js';

// KYC document upload + retrieval.
// POST /api/kyc-upload   { kind, data_url, filename }  -> stores the image in kyc_files
// GET  /api/kyc-upload?id=<fileId>                     -> streams the image (owner or admin only)
//
// The API router only parses JSON bodies, so the frontend sends the (client-compressed)
// image as a base64 data URL. Files are never public: the GET path checks that the
// requester owns the file or is an admin before streaming bytes.

const ALLOWED_KINDS = ['document_front', 'document_back'];
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DECODED_BYTES = 5 * 1024 * 1024; // 5MB

function parseDataUrl(dataUrl) {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || '').trim());
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const base64 = m[2];
  const size = Math.floor((base64.length * 3) / 4);
  return { mime, base64, size };
}

function sanitizeFilename(name) {
  return String(name || 'document')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'POST') {
      const user = await requireUserHelper(supabase, req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const { kind, data_url, filename } = req.body || {};
      if (!ALLOWED_KINDS.includes(kind)) {
        return res.status(400).json({ error: `kind must be one of: ${ALLOWED_KINDS.join(', ')}` });
      }

      const parsed = parseDataUrl(data_url);
      if (!parsed || !ALLOWED_MIMES.includes(parsed.mime)) {
        return res.status(400).json({ error: 'data_url must be a base64 JPEG, PNG or WebP image' });
      }
      if (parsed.size > MAX_DECODED_BYTES) {
        return res.status(400).json({ error: 'Image too large (max 5MB after compression)' });
      }

      const { data, error } = await supabase
        .from('kyc_files')
        .insert({
          user_id: user.id,
          kind,
          mime: parsed.mime,
          size: parsed.size,
          filename: sanitizeFilename(filename),
          data_base64: parsed.base64,
        })
        .select('id, kind, mime, size, filename, created_at');

      if (error) throw error;
      const inserted = (data || [])[0];
      if (!inserted) throw new Error('Insert returned no data');
      return res.status(201).json({ 
        file: { 
          id: inserted.id,
          kind: inserted.kind,
          mime: inserted.mime,
          size: inserted.size
        } 
      });
    }

    if (req.method === 'GET') {
      const user = await requireUserHelper(supabase, req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const id = Number(req.query?.id);
      if (!id || Number.isNaN(id)) return res.status(400).json({ error: 'id query param is required' });

      const { data: rows, error } = await supabase
        .from('kyc_files')
        .select('id, user_id, kind, mime, filename, data_base64')
        .eq('id', id)
        .limit(1);
      if (error) throw error;
      const file = (rows || [])[0];
      if (!file) return res.status(404).json({ error: 'File not found' });

      if (file.user_id !== user.id) {
        const adminAuth = await requireAdmin(req);
        if (!adminAuth) return res.status(403).json({ error: 'Forbidden' });
      }

      const buf = Buffer.from(file.data_base64, 'base64');
      res.setHeader('Content-Type', file.mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${file.filename || `kyc-${file.id}`}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.end(buf);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[kyc-upload] error', err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}
