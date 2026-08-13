/*
 * Centralized admin authentication helper
 *
 * Decision and behavior:
 * - Prefer session-based admin authentication when a Bearer token is provided.
 *   The session check uses Supabase's getUser() and then checks the profiles row
 *   (profile.role === 'admin') or user.user_metadata?.is_admin or user.role === 'admin'.
 * - Fallback to header-based secrets for non-interactive/automation callers.
 *   Accepts X-Admin-Secret or X-Cron-Secret (or admin_secret query param) and
 *   validates against process.env.ADMIN_SECRET and process.env.CRON_SECRET.
 * - Returns null when not authorized, otherwise returns an object:
 *     { admin: <user|null>, method: 'session'|'admin-secret'|'cron-secret' }
 *   When method is 'session' admin will be the Supabase user object. When a
 *   header secret is used admin will be null (caller is non-interactive/system).
 *
 * Rationale:
 * - Prefer users authenticated via session so actions are attributed to a real
 *   user (useful for audit logs). For automation (CRON jobs, scripts) a secret
 *   header is still supported but will be recorded as a non-user action.
 */

import supabase from './db-client.js';
import { getProfileRow } from './helpers.js';

export async function requireAdmin(req) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query?.access_token || null;
    if (token) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        const profile = await getProfileRow(supabase, user.id).catch(() => null);
        if (profile?.role === 'admin' || user.role === 'admin' || user.user_metadata?.is_admin) {
          return { admin: user, method: 'session' };
        }
      }
    }
  } catch (e) {
    console.error('[auth-admin] session check failed', e?.message || e);
  }

  const provided = (req.headers['x-admin-secret'] || req.headers['x-cron-secret'] || req.query?.admin_secret || '').toString();
  if (provided) {
    if (process.env.ADMIN_SECRET && provided === process.env.ADMIN_SECRET) {
      return { admin: null, method: 'admin-secret' };
    }
    if (process.env.CRON_SECRET && provided === process.env.CRON_SECRET) {
      return { admin: null, method: 'cron-secret' };
    }
  }

  return null;
}
