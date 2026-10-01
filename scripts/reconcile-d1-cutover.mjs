#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.join(__dirname, '..', 'tmp', 'd1-cutover-reconciliation.json');

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

async function safeSelect(table, query) {
  const { data, error } = await db.from(table).select(query);
  if (error) throw error;
  return data || [];
}

async function main() {
  const [authResult, profiles, wallets, transactions, deposits, kycSubmissions, kycFiles, mnemonics, cryptoAddresses, investments] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 100 }),
    safeSelect('profiles', '*'),
    safeSelect('wallets', '*'),
    safeSelect('transactions', '*'),
    safeSelect('deposits', '*'),
    safeSelect('kyc_submissions', '*'),
    safeSelect('kyc_files', '*'),
    safeSelect('user_mnemonics', '*'),
    safeSelect('crypto_addresses', '*'),
    safeSelect('investments', '*'),
  ]);

  const authUsers = authResult.data?.users || [];
  const authIds = new Set(authUsers.filter(u => u?.id).map(u => u.id));
  const authByEmail = new Map(
    authUsers
      .filter(u => u?.email)
      .map(u => [String(u.email).trim().toLowerCase(), u.id]),
  );

  const orphanProfiles = profiles.filter(profile => !authIds.has(profile.user_id));
  const orphanProfileIds = orphanProfiles.map(p => p.user_id);

  const emailMatchProfiles = orphanProfiles.filter(profile => {
    const email = String(profile.email || '').trim().toLowerCase();
    return Boolean(email && authByEmail.has(email));
  });

  const orphanWallets = wallets.filter(wallet => !authIds.has(wallet.user_id));
  const fundedOrphanWallets = orphanWallets.filter(wallet => {
    const numbers = [Number(wallet.available || 0), Number(wallet.reserved || 0), Number(wallet.locked_balance || 0)];
    return numbers.some(value => value !== 0);
  });

  const orphanTables = {
    transactions: transactions.filter(row => !authIds.has(row.user_id)),
    deposits: deposits.filter(row => !authIds.has(row.user_id)),
    kycSubmissions: kycSubmissions.filter(row => !authIds.has(row.user_id)),
    kycFiles: kycFiles.filter(row => !authIds.has(row.user_id)),
    mnemonics: mnemonics.filter(row => !authIds.has(row.user_id)),
    cryptoAddresses: cryptoAddresses.filter(row => !authIds.has(row.user_id)),
    investments: investments.filter(row => !authIds.has(row.user_id)),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      authUsers: authUsers.length,
      profiles: profiles.length,
      orphanProfiles: orphanProfiles.length,
      orphanWallets: orphanWallets.length,
      fundedOrphanWallets: fundedOrphanWallets.length,
      orphanTransactions: orphanTables.transactions.length,
      orphanDeposits: orphanTables.deposits.length,
      orphanKycSubmissions: orphanTables.kycSubmissions.length,
      orphanKycFiles: orphanTables.kycFiles.length,
      orphanMnemonics: orphanTables.mnemonics.length,
      orphanCryptoAddresses: orphanTables.cryptoAddresses.length,
      orphanInvestments: orphanTables.investments.length,
      emailMatchedOrphanProfiles: emailMatchProfiles.length,
    },
    orphanProfileIds,
    emailMatchedProfileIds: emailMatchProfiles.map(profile => profile.user_id),
    orphanProfiles: orphanProfiles.map(profile => ({
      user_id: profile.user_id,
      email: profile.email || null,
      full_name: profile.full_name || null,
      created_at: profile.created_at || null,
      tier: profile.tier || null,
      kyc_status: profile.kyc_status || null,
      locked_balance: Number(profile.locked_balance || 0),
      emailMatch: Boolean(profile.email && authByEmail.has(String(profile.email).trim().toLowerCase())),
      matchedAuthUserId: profile.email ? authByEmail.get(String(profile.email).trim().toLowerCase()) || null : null,
    })),
    orphanWallets: orphanWallets.map(wallet => ({
      id: wallet.id,
      user_id: wallet.user_id,
      currency: wallet.currency || null,
      available: Number(wallet.available || 0),
      reserved: Number(wallet.reserved || 0),
      locked_balance: Number(wallet.locked_balance || 0),
      funded: [Number(wallet.available || 0), Number(wallet.reserved || 0), Number(wallet.locked_balance || 0)].some(value => value !== 0),
    })),
    orphanTables,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify(report.counts, null, 2));
  console.log(`\nReconciliation report written to ${outputPath}`);
}

main().catch(error => {
  console.error('Reconciliation failed:', error);
  process.exit(1);
});
