# 🐛 BUG FIX: Random Balances Added to New Accounts

**Date:** 2026-08-14  
**Status:** ✅ **FIXED**

---

## The Bug

**Issue:** Newly created accounts were automatically getting a **$1,000 USD balance** added to their wallets.

**Root Cause:** 
```javascript
// helpers.js line 42 - BEFORE (WRONG)
export async function getOrCreateWallet(supabase, userId, starting = 1000) {
  // Default parameter was 1000, giving every new account $1,000
}
```

When new users registered, the `getOrCreateWallet()` function was called without specifying a starting balance, so it defaulted to **$1,000** (the hardcoded default parameter).

**Impact:**
- ❌ Every new user got free $1,000 in their account
- ❌ Misleading welcome notification saying "$1,000 welcome credit"
- ❌ Unfair advantage for new accounts
- ❌ No actual deposit required to trade

---

## Files Affected

### Locations Where Bug Occurred

1. **api-handlers/helpers.js** (Line 42)
   - Default parameter: `starting = 1000`
   - Called from 3 places without specifying starting amount

2. **api-handlers/profile.js** (Lines 103, 166)
   - Line 103: Profile creation calls `getOrCreateWallet(supabase, user.id)` → defaults to 1000
   - Line 166: Wallet endpoint calls `getOrCreateWallet(supabase, user.id)` → defaults to 1000
   - Also misleading notification: "Your account is live with a $1,000 welcome credit"

3. **api-handlers/wallet.js** (Line 23)
   - Wallet retrieval calls `getOrCreateWallet(supabase, user.id)` → defaults to 1000

---

## The Fix

### Change 1: Fixed Default Parameter in helpers.js

**Before:**
```javascript
export async function getOrCreateWallet(supabase, userId, starting = 1000) {
  // ...
}
```

**After:**
```javascript
export async function getOrCreateWallet(supabase, userId, starting = 0) {
  // ...
}
```

**Effect:** New accounts now start with $0 balance instead of $1,000.

---

### Change 2: Fixed Welcome Notification in profile.js

**Before:**
```javascript
await supabase.from('notifications').insert({
  user_id: user.id,
  title: 'Welcome to Apex Prime Broker',
  body: 'Your account is live with a $1,000 welcome credit. Complete KYC to unlock higher limits.',
  read: false,
});
```

**After:**
```javascript
await supabase.from('notifications').insert({
  user_id: user.id,
  title: 'Welcome to Apex Prime Broker',
  body: 'Your account is ready. Complete KYC and deposit to start trading.',
  read: false,
});
```

**Effect:** Notification now accurately reflects that users need to deposit their own money to trade.

---

## Verification

✅ **All tests passing:**
```bash
npm test
  ALL TESTS PASSED
  CHART FILES OK
```

✅ **No breaking changes** - The function still works exactly the same way, just with a different default starting balance.

---

## What This Means

### Before Fix ❌
```
User signs up
  ↓
Profile created
  ↓
getOrCreateWallet(user.id)
  ↓
Defaults to starting = 1000
  ↓
User's wallet created with $1,000 balance
  ↓
User sees: "Your account is live with a $1,000 welcome credit"
  ↓
User can trade immediately without depositing
  ❌ WRONG!
```

### After Fix ✅
```
User signs up
  ↓
Profile created
  ↓
getOrCreateWallet(user.id)
  ↓
Defaults to starting = 0
  ↓
User's wallet created with $0 balance
  ↓
User sees: "Your account is ready. Complete KYC and deposit to start trading."
  ↓
User must deposit their own money to trade
  ✅ CORRECT!
```

---

## Future Deposits

If you want to give welcome bonuses or promotional credits in the future, you can now:

**Option 1: Call with explicit amount**
```javascript
await getOrCreateWallet(supabase, userId, 500); // $500 welcome bonus
```

**Option 2: Update wallet after creation**
```javascript
const wallet = await getOrCreateWallet(supabase, userId); // Creates with $0
await supabase.from('wallets').update({ 
  available: 500 
}).eq('id', wallet.id); // Add $500 bonus
```

**Option 3: Use deposits.js for admin confirmation**
```javascript
// Create a deposit and have admin confirm it
// This properly credits the wallet with an audit trail
```

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| New Account Balance | $1,000 (hardcoded) | $0 (correct) |
| Welcome Message | Misleading ($1k credit) | Accurate (must deposit) |
| User Behavior | Can trade without deposit | Must deposit to trade ✅ |
| Fairness | Unfair advantage | Fair and correct ✅ |
| Compliance | No audit trail | Proper deposit workflow ✅ |

---

**Status:** ✅ **FIXED AND VERIFIED**

All new accounts will now start with $0 balance and require a deposit to begin trading.

🚀 Ready for production deployment!
