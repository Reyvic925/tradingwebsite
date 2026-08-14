/**
 * Admin Backfill Endpoint
 * 
 * POST /api/admin/backfill-wallets - Trigger wallet backfill for existing users
 * 
 * Query parameters:
 *   ?user_id=<id>      - Backfill specific user (optional)
 *   ?dry_run=true      - Don't actually backfill, just report (optional)
 * 
 * Requires: Admin authentication
 */

import supabase from './db-client.js';
import { requireAdmin } from './auth-admin.js';
import registrationWallet from './registration-wallet.js';

async function getExistingWallets(userId) {
  const { data, error } = await supabase
    .from('crypto_addresses')
    .select('id, currency, network')
    .eq('user_id', userId);

  if (error) throw error;
  return data || [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify admin authentication
    const admin = await requireAdmin(req);
    if (!admin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const url = new URL(req.url, 'http://localhost');
    const specificUserId = url.searchParams.get('user_id');
    const dryRun = url.searchParams.get('dry_run') === 'true';

    console.log(`[admin-backfill] Starting backfill (dry_run=${dryRun})`);

    // Get users to process
    let usersQuery = supabase
      .from('profiles')
      .select('user_id, email, full_name')
      .order('created_at', { ascending: true });

    if (specificUserId) {
      usersQuery = usersQuery.eq('user_id', specificUserId);
    }

    const { data: users, error: usersErr } = await usersQuery;
    if (usersErr) throw usersErr;

    if (!users || users.length === 0) {
      return res.status(200).json({
        message: 'No users found to backfill',
        stats: { total: 0, processed: 0, skipped: 0, errors: 0 },
      });
    }

    const stats = {
      total: users.length,
      processed: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    // Process each user
    for (const user of users) {
      try {
        // Check existing wallets
        const existing = await getExistingWallets(user.user_id);

        if (existing.length >= 8) {
          stats.skipped++;
          stats.details.push({
            user_id: user.user_id,
            email: user.email,
            status: 'skipped',
            reason: `Already has ${existing.length} wallets`,
          });
          continue;
        }

        if (!dryRun) {
          // Generate wallets
          const results = await registrationWallet.createRegistrationWallets(user.user_id);
          const failCount = Object.values(results).filter(r => r.error).length;

          if (failCount === 0) {
            stats.processed++;
            stats.details.push({
              user_id: user.user_id,
              email: user.email,
              status: 'success',
              wallets_generated: 8,
            });
          } else {
            stats.errors++;
            stats.details.push({
              user_id: user.user_id,
              email: user.email,
              status: 'partial_error',
              wallets_generated: 8 - failCount,
            });
          }
        } else {
          // Dry run: just report
          stats.processed++;
          stats.details.push({
            user_id: user.user_id,
            email: user.email,
            status: 'would_generate',
            current_wallets: existing.length,
            action: 'Would generate 8 wallets',
          });
        }
      } catch (err) {
        stats.errors++;
        stats.details.push({
          user_id: user.user_id,
          email: user.email,
          status: 'error',
          error: err.message,
        });
      }
    }

    console.log(`[admin-backfill] Complete: ${stats.processed} processed, ${stats.skipped} skipped, ${stats.errors} errors`);

    return res.status(200).json({
      message: dryRun ? 'Dry run complete' : 'Backfill complete',
      dry_run: dryRun,
      stats,
    });
  } catch (err) {
    console.error('[admin-backfill] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
