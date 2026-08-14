# Production Wallet Generation Fixes - Deployment Guide

## Summary of Fixes

Three critical production issues have been identified and fixed:

### 1. **Broken Wallet Balance Update** (deposit-detector.js)
**Issue**: PostgREST arithmetic expressions don't work
```javascript
// BROKEN (before):
body: { balance: wallets.balance + ${amount} }

// FIXED (after):
// Use RPC function or DB trigger
```
**Fix**: Changed to use RPC function call `update_wallet_balance()` with proper error handling
**Action Required in Production**: 
- Create PostgreSQL function for atomic balance updates, OR
- Ensure database trigger on `transactions` table updates `wallets.balance` atomically

### 2. **Unsupported Chains Silently Fall Back to EVM** (crypto-keys.js)
**Issue**: Solana, Ripple, Cardano, Dogecoin users received EVM addresses
```javascript
// BROKEN (before):
if (...EVM networks) { return generateEvmKeypair(); }
return generateEvmKeypair(); // SILENT FALLBACK!

// FIXED (after):
if (...unsupported...) { throw new Error('...not yet implemented'); }
throw new Error('Unsupported network');
```
**Fix**: Now throws descriptive error instead of generating wrong address type
**Impact**: 
- Users requesting unsupported currencies get 501 error with clear message
- Prevents invalid address generation

### 3. **Race Condition in Address Generation** (deposit-crypto.js)
**Issue**: Concurrent requests could create duplicate addresses
**Fix**: 
- Added check-before-create pattern
- Handle unique constraint violations gracefully
- Return existing address if duplicate creation attempted

---

## Pre-Deployment Checklist

- [ ] **Database Function**: Create PostgreSQL RPC function for wallet balance updates
  ```sql
  CREATE OR REPLACE FUNCTION update_wallet_balance(user_id UUID, amount DECIMAL)
  RETURNS void AS $$
  BEGIN
    UPDATE wallets SET balance = balance + amount WHERE user_id = user_id;
  END;
  $$ LANGUAGE plpgsql;
  ```
  OR
  
- [ ] **Database Trigger**: Ensure trigger auto-updates wallets on transaction insert
  ```sql
  CREATE TRIGGER wallet_balance_trigger
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_wallet_balance_from_transaction();
  ```

- [ ] **Environment Variables**: Confirm production has `ENCRYPTION_MASTER_KEY` set
- [ ] **Test in Staging**: Run full test suite before production deployment
- [ ] **Backup Database**: Before deploying, backup production database
- [ ] **Monitor Logs**: Watch for 501 errors from unsupported currency requests

---

## Production Testing Steps

### Step 1: Verify Supported Currencies Still Work
```bash
# Test ETH address generation
curl -X POST https://your-api.com/api/deposit-crypto \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"currency":"ETH"}'

# Expected: 200 OK with valid EVM address starting with 0x
```

### Step 2: Verify Unsupported Currencies Fail Gracefully
```bash
# Test SOL (should now throw error instead of generating wrong address)
curl -X POST https://your-api.com/api/deposit-crypto \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"currency":"SOL"}'

# Expected: 501 Not Implemented with error message
```

### Step 3: Monitor Real Deposits
- Watch blockchain for actual deposits to generated addresses
- Check wallet balance updates in database
- Verify transactions table is populated correctly

### Step 4: Test Race Conditions
```bash
# Send multiple concurrent requests for same user/currency
# (Can use Apache Bench or similar tool)
ab -n 10 -c 10 -H "Authorization: Bearer <TOKEN>" \
  -p deposit.json https://your-api.com/api/deposit-crypto

# Expected: All requests succeed, user has only ONE address
```

---

## Rollback Plan

If issues occur in production:

1. **Revert code changes**:
   ```bash
   git revert <commit-hash>
   npm run build && npm run deploy
   ```

2. **Check for orphaned transactions**:
   ```sql
   SELECT * FROM transactions WHERE balance_update_failed = true;
   ```

3. **Manual balance reconciliation** (if needed):
   ```sql
   -- Recalculate wallet balances from transactions
   UPDATE wallets SET balance = (
     SELECT COALESCE(SUM(amount), 0) 
     FROM transactions 
     WHERE user_id = wallets.user_id AND status = 'completed'
   );
   ```

---

## Monitoring Metrics

After deployment, watch for:

- **501 errors**: Count requests for unsupported currencies (expected, track for feature requests)
- **Deposit detection lag**: Time from blockchain to wallet balance update
- **Unique constraint violations**: Count of duplicate address creation attempts (should be near 0)
- **RPC function errors**: Monitor `update_wallet_balance()` success rate

---

## Future Improvements

To fully support currently-unsupported chains:

1. **Solana**: Implement ed25519 keypair generation
2. **Ripple**: Implement ECDSA keypair generation  
3. **Cardano**: Implement HD wallet generation per CIP-1852
4. **Dogecoin**: Use Bitcoin-compatible BIP32/BIP39 (similar to BTC implementation)

---

## Files Modified

- `api-handlers/deposit-detector.js` - Fixed wallet balance update
- `api-handlers/crypto-keys.js` - Fixed unsupported chain fallback
- `api-handlers/deposit-crypto.js` - Fixed race condition handling
- `tests/unit/wallet-integration.test.mjs` - New comprehensive integration tests

## Test Results

✅ All local tests passing:
- EVM networks (Ethereum, Binance, Polygon): Working
- Bitcoin: Working with BIP39 mnemonics
- Unsupported currencies: Properly rejected with 501 errors
- Encryption/Decryption: Working correctly
- Currency validation: Working correctly
