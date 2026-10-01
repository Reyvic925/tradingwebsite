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

const mappingPath = path.join(process.cwd(), 'tmp', 'd1-user-mapping.json');
if (!fs.existsSync(mappingPath)) {
  console.error(`Missing mapping file: ${mappingPath}. Run scripts/generate-d1-user-map.mjs first.`);
  process.exit(1);
}

const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
const db = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function getAll(table, select = '*') {
  const { data, error } = await db.from(table).select(select);
  if (error) throw error;
  return data || [];
}

async function main() {
  const [profiles, wallets, transactions, deposits, kycSubmissions, kycFiles, mnemonics, cryptoAddresses, investments] = await Promise.all([
    getAll('profiles'),
    getAll('wallets'),
    getAll('transactions'),
    getAll('deposits'),
    getAll('kyc_submissions'),
    getAll('kyc_files'),
    getAll('user_mnemonics'),
    getAll('crypto_addresses'),
    getAll('investments'),
  ]);

  const authUsers = new Set((await db.auth.admin.listUsers({ page: 1, perPage: 100 })).data?.users?.map(user => user.id) || []);
  const orphanProfileIds = new Set(mapping.decisions.map(item => item.source_profile_id));
  const relinkIds = new Set(mapping.decisions.filter(item => item.decision === 'relink_email_match').map(item => item.source_profile_id));
  const newAuthIds = mapping.decisions.filter(item => item.decision === 'new_auth_user_required');

  const relinkWalletBalance = wallets
    .filter(wallet => relinkIds.has(wallet.user_id))
    .reduce((sum, wallet) => sum + Number(wallet.available || 0) + Number(wallet.reserved || 0) + Number(wallet.locked_balance || 0), 0);

  const sourceWalletBalance = wallets
    .filter(wallet => orphanProfileIds.has(wallet.user_id))
    .reduce((sum, wallet) => sum + Number(wallet.available || 0) + Number(wallet.reserved || 0) + Number(wallet.locked_balance || 0), 0);

  const dryRun = {
    generatedAt: new Date().toISOString(),
    status: 'dry_run_only',
    sourceProject: supabaseUrl,
    summary: {
      authUsers: authUsers.size,
      orphanProfiles: mapping.decisions.length,
      relinkEmailMatches: relinkIds.size,
      newAuthUserRequired: newAuthIds.length,
      fundedOrphans: mapping.decisions.filter(item => item.funded_wallets).length,
      totalSourceOrphanWalletBalance: sourceWalletBalance,
      relinkWalletBalance,
      totalSourceOrphanTransactions: transactions.filter(tx => orphanProfileIds.has(tx.user_id)).length,
      totalSourceOrphanDeposits: deposits.filter(row => orphanProfileIds.has(row.user_id)).length,
      totalSourceOrphanKycSubmissions: kycSubmissions.filter(row => orphanProfileIds.has(row.user_id)).length,
      totalSourceOrphanKycFiles: kycFiles.filter(row => orphanProfileIds.has(row.user_id)).length,
      totalSourceOrphanCryptoAddresses: cryptoAddresses.filter(row => orphanProfileIds.has(row.user_id)).length,
      totalSourceOrphanInvestments: investments.filter(row => orphanProfileIds.has(row.user_id)).length,
    },
    relinkPlan: mapping.decisions.filter(item => item.decision === 'relink_email_match').map(item => ({
      source_profile_id: item.source_profile_id,
      canonical_auth_user_id: item.canonical_auth_user_id,
      source_email: item.source_email,
      total_available: item.total_available,
      total_reserved: item.total_reserved,
      total_locked: item.total_locked,
    })),
    newUserPlan: newAuthIds.map(item => ({
      source_profile_id: item.source_profile_id,
      source_email: item.source_email,
      full_name: item.full_name,
      source_total_wallet_balance: item.total_available + item.total_reserved + item.total_locked,
      reason: item.reason,
    })),
    dryRunChecks: [
      'No database writes executed.',
      'Source rows are enumerated only.',
      'Balance reconciliation remains a manual review step for funded orphan wallets.',
      'Auth-user creation for new profiles is deferred until the import is approved.',
    ],
    nextAction: 'Review the relink and new-user plans, then execute a staging dry-run import only after every funded orphan wallet is reconciled.'
  };

  console.log(JSON.stringify(dryRun.summary, null, 2));
  console.log('\nDRY_RUN_OK');
}

main().catch(error => {
  console.error('Dry-run import generation failed:', error);
  process.exit(1);
});
