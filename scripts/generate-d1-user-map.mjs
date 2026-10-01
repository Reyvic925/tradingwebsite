#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing required env vars: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function getAll(query, table) {
  const { data, error } = await db.from(table).select(query);
  if (error) throw error;
  return data || [];
}

async function main() {
  const [authResult, profiles, wallets] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 100 }),
    getAll('*', 'profiles'),
    getAll('*', 'wallets'),
  ]);

  const authUsers = authResult.data?.users || [];
  const authByEmail = new Map(
    authUsers.filter(u => u.email).map(u => [String(u.email).trim().toLowerCase(), u.id]),
  );
  const authIds = new Set(authUsers.map(u => u.id));
  const orphanProfiles = profiles.filter(profile => !authIds.has(profile.user_id));
  const walletsByUser = new Map();
  for (const wallet of wallets) {
    if (!walletsByUser.has(wallet.user_id)) walletsByUser.set(wallet.user_id, []);
    walletsByUser.get(wallet.user_id).push(wallet);
  }

  const decisions = orphanProfiles.map(profile => {
    const email = String(profile.email || '').trim().toLowerCase();
    const walletRows = walletsByUser.get(profile.user_id) || [];
    const funded = walletRows.some(row => [Number(row.available || 0), Number(row.reserved || 0), Number(row.locked_balance || 0)].some(v => v !== 0));
    const candidateAuthId = email && authByEmail.has(email) ? authByEmail.get(email) : null;
    let status = 'manual_review';
    let reason = 'No matching auth email';
    if (candidateAuthId) {
      status = 'relink_email_match';
      reason = 'Auth user exists with same email';
    }
    if (profile.email && !authByEmail.has(email)) {
      status = 'new_auth_user_required';
      reason = 'No auth email match; must create new D1 auth user';
    }

    return {
      source_profile_id: profile.user_id,
      source_email: profile.email || null,
      full_name: profile.full_name || null,
      created_at: profile.created_at || null,
      kyc_status: profile.kyc_status || null,
      locked_balance: Number(profile.locked_balance || 0),
      funded_wallets: funded,
      wallet_count: walletRows.length,
      total_available: walletRows.reduce((sum, row) => sum + Number(row.available || 0), 0),
      total_reserved: walletRows.reduce((sum, row) => sum + Number(row.reserved || 0), 0),
      total_locked: walletRows.reduce((sum, row) => sum + Number(row.locked_balance || 0), 0),
      decision: status,
      reason,
      canonical_auth_user_id: candidateAuthId,
      manual_review_required: status !== 'relink_email_match',
    };
  });

  const output = {
    generatedAt: new Date().toISOString(),
    counts: {
      authUsers: authUsers.length,
      orphanProfiles: decisions.length,
      relinkEmailMatches: decisions.filter(item => item.decision === 'relink_email_match').length,
      newAuthUserRequired: decisions.filter(item => item.decision === 'new_auth_user_required').length,
      manualReviewRequired: decisions.filter(item => item.manual_review_required).length,
      fundedOrphans: decisions.filter(item => item.funded_wallets).length,
    },
    decisions,
  };

  const outputPath = path.join(process.cwd(), 'tmp', 'd1-user-mapping.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');

  console.log(JSON.stringify(output.counts, null, 2));
  console.log(`\nMapping written to ${outputPath}`);
}

main().catch(error => {
  console.error('Failed to generate mapping:', error);
  process.exit(1);
});
