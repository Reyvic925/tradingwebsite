# Wallet Backfill Guide for Existing Users

**Date:** 2026-08-14  
**Purpose:** Generate 8 wallet variants for existing users who registered before the LuxYield deposit system was implemented

---

## Overview

When the new deposit system was deployed, **new users automatically get 8 wallet variants** (BTC, ETH, BNB, TRON + 4 stablecoins) at registration.

However, **existing users** who registered before this update only have addresses generated on-demand (1 per currency request). They need to be backfilled to get all 8 wallets.

This guide provides three ways to backfill:
1. **Backfill Script** (recommended for one-time bulk operation)
2. **Admin API Endpoint** (recommended for scheduled/web-triggered backfill)
3. **On-Demand Generation** (automatic fallback, no action needed)

---

## Option 1: Backfill Script (Recommended for Bulk)

### Prerequisites

```bash
# Ensure environment variables are set in .env.local or .env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Running the Script

```bash
# From project root:
node scripts/backfill-wallets.js
```

### Expected Output

```
📋 Fetching all users...
✅ Found 42 users

[1/42] ⏭️  john@example.com - Already has 8 wallets
[2/42] 🔄 jane@example.com - Generating wallets...
[2/42] ✅ Generated 8 wallets for jane@example.com

[3/42] ⚠️  bob@example.com - Has 3/8 wallets, regenerating...
[3/42] ✅ Generated 8 wallets for bob@example.com

...

============================================================
📊 Backfill Summary
============================================================
Total users: 42
✅ Processed: 35
⏭️  Skipped: 7
❌ Errors: 0
============================================================
✅ Backfill complete! All users now have wallets.
```

### What the Script Does

1. **Fetches all users** from the `profiles` table
2. **For each user**, checks how many wallets they have
3. **If fewer than 8 wallets**, generates the missing ones
4. **Logs progress** and reports summary
5. **Returns exit code 0** on success, 1 on errors

### Troubleshooting

**Error: "Missing environment variables"**
```bash
# Make sure you have .env.local with:
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

**Error: "Supabase connection failed"**
- Check that your NEXT_PUBLIC_SUPABASE_URL is correct
- Verify SUPABASE_SERVICE_ROLE_KEY is the service role key (not anon key)
- Ensure your IP is allowed by Supabase network restrictions

**Some users show errors**
- Script will continue and report failures at the end
- Review the error messages for the failing user IDs
- Can re-run the script to retry failed users

---

## Option 2: Admin API Endpoint (Recommended for Web-Triggered)

### Dry Run (Preview)

```bash
curl -X POST "https://your-domain.com/api/admin/backfill-wallets?dry_run=true" \
  -H "Authorization: Bearer <admin-token>" \
  -H "X-Admin-Secret: <admin-secret>"
```

### Execute Backfill

```bash
curl -X POST "https://your-domain.com/api/admin/backfill-wallets" \
  -H "Authorization: Bearer <admin-token>" \
  -H "X-Admin-Secret: <admin-secret>"
```

### Backfill Specific User

```bash
curl -X POST "https://your-domain.com/api/admin/backfill-wallets?user_id=abc123" \
  -H "Authorization: Bearer <admin-token>"
```

### Response Example

```json
{
  "message": "Backfill complete",
  "dry_run": false,
  "stats": {
    "total": 42,
    "processed": 35,
    "skipped": 7,
    "errors": 0,
    "details": [
      {
        "user_id": "user-123",
        "email": "john@example.com",
        "status": "skipped",
        "reason": "Already has 8 wallets"
      },
      {
        "user_id": "user-456",
        "email": "jane@example.com",
        "status": "success",
        "wallets_generated": 8
      }
    ]
  }
}
```

### Advantages

- ✅ Can be triggered from admin panel
- ✅ Dry run preview before executing
- ✅ No local environment setup needed
- ✅ Supports individual user backfill
- ✅ Requires admin authentication

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `user_id` | query | none | Backfill specific user (optional) |
| `dry_run` | query | false | Preview without making changes (optional) |
| `Authorization` | header | required | Bearer token with admin role |

---

## Option 3: On-Demand Generation (Automatic)

**No action required.** The system automatically generates wallets on-demand:

```
User tries to deposit → System checks for wallets
  ↓
If wallets exist → Use them
  ↓
If wallets don't exist → Generate them automatically
```

### How It Works

The `profile.js` handler includes fallback logic:

```javascript
// Check if user has any wallets
const { data: existingWallets } = await supabase
  .from('crypto_addresses')
  .select('id')
  .eq('user_id', user.id)
  .limit(1);

// If not, generate them now
if (!existingWallets || existingWallets.length === 0) {
  await registrationWallet.createRegistrationWallets(user.id);
}
```

### Pros & Cons

✅ **Pros:**
- No manual action needed
- Works seamlessly in background
- Failsafe mechanism

❌ **Cons:**
- Slight delay when user first requests deposit (wallet generation takes ~2-3 seconds)
- User may not see address immediately
- Could be confusing UX

---

## Comparison: Which Option to Choose?

| Option | Best For | Effort | Speed | UX |
|--------|----------|--------|-------|-----|
| **Script** | One-time bulk backfill | Low | Fast (~1-2 min) | Great |
| **API Endpoint** | Scheduled backfill, admin triggers | Medium | Fast | Great |
| **On-Demand** | Failsafe, no maintenance | None | Slower (per user) | Fair |

### Recommendation

1. **For immediate deployment:** Use **Option 1 (Script)** - runs once, done
2. **For production safety:** Keep **Option 3 (On-Demand)** as fallback
3. **For future backfills:** Use **Option 2 (API Endpoint)** via admin panel

---

## What Gets Backfilled

Each existing user receives:

```javascript
{
  btc: {
    address: "1A1z7agoat2...",
    currency: "BTC",
    network: "bitcoin"
  },
  eth: {
    address: "0x742d35Cc...",
    currency: "ETH",
    network: "ethereum"
  },
  bnb: {
    address: "0x742d35Cc...",  // SAME as eth (address reuse)
    currency: "BNB",
    network: "binance"
  },
  tron: {
    address: "TRWBqiqoC41...",
    currency: "TRX",
    network: "tron"
  },
  usdt_erc20: {
    address: "0x742d35Cc...",  // SAME as eth
    currency: "USDT",
    network: "ethereum"
  },
  usdt_trc20: {
    address: "TRWBqiqoC41...", // SAME as tron
    currency: "USDT",
    network: "tron"
  },
  usdc_erc20: {
    address: "0x742d35Cc...",  // SAME as eth
    currency: "USDC",
    network: "ethereum"
  },
  usdc_trc20: {
    address: "TRWBqiqoC41...", // SAME as tron
    currency: "USDC",
    network: "tron"
  }
}
```

All stored in `crypto_addresses` table with proper encryption.

---

## Monitoring & Verification

### Check backfill status

```sql
-- Supabase SQL editor
SELECT 
  user_id,
  COUNT(*) as wallet_count,
  STRING_AGG(currency, ', ') as currencies
FROM crypto_addresses
GROUP BY user_id
ORDER BY wallet_count;
```

Expected result: All rows should show `wallet_count = 8`

### Verify specific user

```sql
SELECT 
  user_id,
  currency,
  address,
  network,
  created_at
FROM crypto_addresses
WHERE user_id = 'user-uuid-here'
ORDER BY created_at;
```

Should return 8 rows with:
- 2 unique Bitcoin addresses (different for each user)
- 5 rows pointing to same Ethereum address (eth, bnb, usdt_erc20, usdc_erc20)
- 2 rows pointing to same TRON address (tron, usdt_trc20, usdc_trc20)

---

## Performance Expectations

### Script Performance

- **Setup:** ~1 second (connect to Supabase)
- **Per user:** ~0.5-1 second (generate 8 wallets)
- **For 1,000 users:** ~10-15 minutes

### API Performance

- **Per request:** ~2-5 seconds (depending on user count)
- **Network requests:** Batched in Supabase
- **No blocking:** Can make requests simultaneously

---

## Troubleshooting

### Issue: "SUPABASE_SERVICE_ROLE_KEY not recognized"

**Solution:** Ensure you're using the Service Role key, not Anon key. Check Supabase settings → Project Settings → API keys. The Service Role key is the larger one.

### Issue: "Some users show errors during backfill"

**Solution:** Re-run the script. It will skip users who already have 8 wallets and retry failed ones.

### Issue: "Script hangs or times out"

**Solution:** 
- Check internet connection
- Verify Supabase is accessible
- Try `--timeout=300000` if supported (increases timeout)
- Run for smaller subset using API endpoint with `?user_id=` parameter

### Issue: "Users still don't see wallets after backfill"

**Solution:** 
1. Verify backfill completed with SQL query (see Monitoring section)
2. Clear browser cache (Ctrl+Shift+Delete)
3. Check `/api/wallets` endpoint directly in browser console:
```javascript
fetch('/api/wallets', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('sb-auth-token') }
}).then(r => r.json()).then(console.log)
```

---

## Rollback

If something goes wrong, you can revert:

```sql
-- Delete ALL wallets (careful!)
DELETE FROM crypto_addresses WHERE metadata->>'auto_generated_at_registration' = 'true';
```

Or keep only original wallets:
```sql
-- Keep only on-demand generated wallets, remove registration backfill
DELETE FROM crypto_addresses 
WHERE metadata->>'auto_generated_at_registration' = 'true' 
AND created_at > '2026-08-14'::date;
```

---

## Summary

| Method | Command | Time | Auth |
|--------|---------|------|------|
| **Script** | `npm run backfill:wallets` | ~10-15 min for 1k users | Local (env vars) |
| **API** | `POST /api/admin/backfill-wallets` | Per-request | Bearer token |
| **Auto** | `GET /api/wallets` on deposit | ~2-3 sec per user | Automatic |

**Recommended:** Run the **backfill script once** for immediate deployment, keep **on-demand generation** as safety net.

---

**Documentation Version:** 1.0  
**Last Updated:** 2026-08-14  
**Status:** Ready for Production
