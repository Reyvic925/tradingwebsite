#!/usr/bin/env node

/**
 * Backfill Wallets Script
 * 
 * Generates all 8 wallet variants for existing users who don't have them yet.
 * Run once to ensure all users can access the new deposit system.
 * 
 * Usage:
 *   node scripts/backfill-wallets.js
 * 
 * Requirements:
 *   - NEXT_PUBLIC_SUPABASE_URL environment variable
 *   - SUPABASE_SERVICE_ROLE_KEY environment variable
 */

import { createClient } from '@supabase/supabase-js';
import registrationWallet from '../api-handlers/registration-wallet.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Error: Missing environment variables');
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function getExistingWallets(userId) {
  const { data, error } = await supabase
    .from('crypto_addresses')
    .select('id, currency, network')
    .eq('user_id', userId);

  if (error) throw error;
  return data || [];
}

async function backfillWallets() {
  try {
    // Step 1: Get all users
    console.log('📋 Fetching all users...');
    const { data: users, error: usersErr } = await supabase
      .from('profiles')
      .select('user_id, email, full_name')
      .order('created_at', { ascending: true });

    if (usersErr) {
      console.error('❌ Error fetching users:', usersErr.message);
      process.exit(1);
    }

    if (!users || users.length === 0) {
      console.log('✅ No users found. Nothing to backfill.');
      process.exit(0);
    }

    console.log(`✅ Found ${users.length} users\n`);

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Step 2: Process each user
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const progress = `[${i + 1}/${users.length}]`;

      try {
        // Check existing wallets
        const existing = await getExistingWallets(user.user_id);
        
        if (existing.length >= 8) {
          console.log(`${progress} ⏭️  ${user.full_name || user.email} - Already has ${existing.length} wallets`);
          skippedCount++;
          continue;
        }

        if (existing.length > 0) {
          console.log(`${progress} ⚠️  ${user.full_name || user.email} - Has ${existing.length}/8 wallets, regenerating...`);
        } else {
          console.log(`${progress} 🔄 ${user.full_name || user.email} - Generating wallets...`);
        }

        // Generate all 8 wallets
        const results = await registrationWallet.createRegistrationWallets(user.user_id);
        
        // Count successes
        const successCount = Object.values(results).filter(r => !r.error).length;
        const failCount = Object.values(results).filter(r => r.error).length;

        if (failCount === 0) {
          console.log(`${progress} ✅ Generated ${successCount} wallets for ${user.email}\n`);
          processedCount++;
        } else {
          console.log(`${progress} ⚠️  Generated ${successCount} wallets, ${failCount} failed for ${user.email}\n`);
          processedCount++;
        }
      } catch (err) {
        console.error(`${progress} ❌ Error processing ${user.email}:`, err.message);
        errorCount++;
      }
    }

    // Summary
    console.log('=' .repeat(60));
    console.log('📊 Backfill Summary');
    console.log('=' .repeat(60));
    console.log(`Total users: ${users.length}`);
    console.log(`✅ Processed: ${processedCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('=' .repeat(60));

    if (errorCount > 0) {
      console.log('⚠️  Some users had errors. Review the output above.');
      process.exit(1);
    } else {
      console.log('✅ Backfill complete! All users now have wallets.');
      process.exit(0);
    }
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  }
}

// Run the backfill
backfillWallets();
