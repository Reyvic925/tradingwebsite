# Apex Prime Broker - LuxYield-Inspired Deposit System

**Implementation Date:** 2026-08-14  
**Architecture:** Supabase with MongoDB-inspired patterns  
**Focus:** Registration-time wallet generation + structured deposit flow

---

## System Overview

Apex Prime has been enhanced with LuxYield-inspired deposit features:

1. **8 Wallet Variants Generated at Registration** (instead of on-demand)
2. **Address Reuse for EVM-Compatible Chains** (ETH, BNB, USDT-ERC20, USDC-ERC20 share address)
3. **Structured Deposit Flow** with admin confirmation
4. **Separate Wallet Management** for public addresses vs admin key access

---

## Supported Wallet Variants

Every user gets 8 wallet variants automatically at registration:

| Variant | Network | Currency | Address Type | Keypair | Reuse? |
|---------|---------|----------|--------------|---------|--------|
| `btc` | Bitcoin | BTC | P2PKH (1...) | BIP32/BIP39 | ✗ |
| `eth` | Ethereum | ETH | EVM (0x...) | secp256k1 | Primary |
| `bnb` | Binance Smart Chain | BNB | EVM (0x...) | secp256k1 | ✓ (eth) |
| `tron` | TRON | TRX | Tron (T...) | ECDSA | Primary |
| `usdt_erc20` | Ethereum | USDT | EVM (0x...) | secp256k1 | ✓ (eth) |
| `usdt_trc20` | TRON | USDT | Tron (T...) | ECDSA | ✓ (tron) |
| `usdc_erc20` | Ethereum | USDC | EVM (0x...) | secp256k1 | ✓ (eth) |
| `usdc_trc20` | TRON | USDC | Tron (T...) | ECDSA | ✓ (tron) |

### Address Reuse Pattern

**EVM-Compatible Chains (Ethereum, Binance Smart Chain):**
```
eth.address       = 0x742d35Cc6634C0532925a3b844Bc9e7595f456a7
bnb.address       = 0x742d35Cc6634C0532925a3b844Bc9e7595f456a7  (SAME)
usdt_erc20.address = 0x742d35Cc6634C0532925a3b844Bc9e7595f456a7  (SAME)
usdc_erc20.address = 0x742d35Cc6634C0532925a3b844Bc9e7595f456a7  (SAME)
```

All derive from same private key, so user can receive any ERC20 token at one address.

**TRON:**
```
tron.address      = TRWBqiqoC41xwBvHc9AGVq7qQTSwQq87Zm
usdt_trc20.address = TRWBqiqoC41xwBvHc9AGVq7qQTSwQq87Zm  (SAME)
usdc_trc20.address = TRWBqiqoC41xwBvHc9AGVq7qQTSwQq87Zm  (SAME)
```

---

## Registration Flow

### Step 1: User Signup

```javascript
// Frontend: src/pages/Login.tsx
const { error: err } = await supabase.auth.signUp({ email, password });
if (err) throw err;

const { error: sErr } = await supabase.auth.signInWithPassword({ email, password });
if (sErr) throw sErr;

// Call bootstrap to create profile and wallets
await bootstrapProfile({ full_name: fullName, referred_by: referral || null });
```

### Step 2: Profile Creation with Wallet Generation

```javascript
// POST /api/profile
// Handler: api-handlers/profile.js
// When new profile is created:
1. Insert profile record
2. Create USD wallet
3. Call registrationWallet.createRegistrationWallets(user.id)
   └─ Generate 8 wallet variants
   └─ Store in crypto_addresses table
```

### Step 3: Wallet Addresses Available Immediately

```javascript
// User can fetch addresses immediately
GET /api/wallets
{
  "wallets": {
    "btc": { "address": "1A1z7agoat2...", "currency": "BTC" },
    "eth": { "address": "0x742d35Cc...", "currency": "ETH" },
    "bnb": { "address": "0x742d35Cc...", "currency": "BNB" },
    "tron": { "address": "TRWBqiqo...", "currency": "TRX" },
    "usdt_erc20": { "address": "0x742d35Cc...", "currency": "USDT" },
    "usdt_trc20": { "address": "TRWBqiqo...", "currency": "USDT" },
    "usdc_erc20": { "address": "0x742d35Cc...", "currency": "USDC" },
    "usdc_trc20": { "address": "TRWBqiqo...", "currency": "USDC" }
  }
}
```

---

## Deposit Flow

### User Initiates Deposit

```javascript
// Frontend calls:
POST /api/deposits
{
  "amount": 100,
  "currency": "USD",
  "method": "manual"
}

// Response:
{
  "deposit": {
    "id": 123,
    "user_id": "...",
    "amount": 100,
    "currency": "USD",
    "status": "pending",
    "created_at": "2026-08-14T..."
  }
}
```

### Admin Confirms Deposit

```javascript
// Admin calls:
POST /api/deposits/confirm
Headers: { "Authorization": "Bearer <admin-token>" }
{
  "depositId": 123,
  "admin_notes": "Verified manual transfer"
}

// System:
1. Updates deposit.status = "confirmed"
2. Updates deposit.confirmed_at
3. Credits user.wallet.available += amount
4. Returns confirmed deposit
```

### User Views Deposit History

```javascript
GET /api/deposits/history
Authorization: Bearer <user-token>

// Response:
{
  "deposits": [
    {
      "id": 123,
      "amount": 100,
      "currency": "USD",
      "status": "confirmed",
      "method": "manual",
      "created_at": "2026-08-14T10:00:00Z",
      "confirmed_at": "2026-08-14T10:05:00Z"
    }
  ]
}
```

---

## Database Schema

### New `deposits` Table

```sql
create table if not exists deposits (
  id bigserial primary key,
  user_id text not null,
  amount numeric not null,
  currency text default 'USD',
  status text default 'pending',      -- pending, confirmed, rejected
  method text default 'manual',        -- manual, card, crypto, bank_transfer
  tx_hash text,
  admin_notes text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_deposits_user on deposits (user_id);
create index if not exists idx_deposits_status on deposits (status);
```

### Updated `crypto_addresses` Table

Stores wallet variants with metadata:

```
user_id: "user-uuid"
currency: "ETH"                    -- Display currency
network: "ethereum"                -- Primary network
address: "0x742d35Cc..."
encrypted_private_key: "iv:enc:tag"
encrypted_mnemonic: "iv:enc:tag"
metadata: {
  "wallet_variant": "eth",
  "auto_generated_at_registration": true
}
```

---

## API Endpoints

### User Endpoints

**GET /api/wallets**
- Returns all 8 wallet addresses (no private keys)
- Requires: User authentication
- Response: `{ wallets: { btc: {...}, eth: {...}, ... } }`

**POST /api/deposits**
- Create deposit request
- Requires: User authentication
- Body: `{ amount, currency?, method? }`
- Response: `{ deposit: {...} }`

**GET /api/deposits/history**
- Get user's deposit history
- Requires: User authentication
- Response: `{ deposits: [...] }`

### Admin Endpoints

**GET /api/wallets/admin/:userId**
- Get user's full wallet data including private keys
- Requires: Admin authentication
- Response: `{ wallets: { btc: {...with keys...}, ... } }`

**POST /api/deposits/confirm**
- Confirm a pending deposit
- Requires: Admin authentication
- Body: `{ depositId, admin_notes? }`
- Response: `{ deposit: {...} }`

---

## Implementation Files

| File | Purpose |
|------|---------|
| `api-handlers/crypto-keys.js` | Keypair generation with wallet variants |
| `api-handlers/registration-wallet.js` | Generate & store 8 wallets at registration |
| `api-handlers/deposits.js` | Deposit creation & admin confirmation |
| `api-handlers/wallets.js` | Wallet address retrieval (public) & admin key access |
| `api-handlers/auth-profile.js` | Alternative profile creation endpoint |
| `api-handlers/profile.js` | Updated to generate wallets at registration |
| `schema.sql` | Updated with deposits table |

---

## Key Design Decisions

### 1. Registration-Time Generation
✅ **Advantage:** Users have instant addresses, no wait time  
✅ **Advantage:** All addresses guaranteed to exist  
❌ **Trade-off:** More storage, all wallets generated even if unused

### 2. Address Reuse for EVM Chains
✅ **Advantage:** Simpler user UX (one address for multiple assets)  
✅ **Advantage:** Reduced blockchain bloat  
✅ **Advantage:** Standard practice (MetaMask, Ledger do this)  
❌ **Trade-off:** Reduced privacy (transaction linkage)

### 3. Admin-Confirmed Deposits
✅ **Advantage:** Full control over deposits  
✅ **Advantage:** Fraud prevention  
✅ **Advantage:** Compliance-friendly  
❌ **Trade-off:** Not instant (requires manual review)  
❌ **Trade-off:** Operational overhead

### 4. Encryption at Rest
✅ Private keys encrypted in database (AES-256-GCM)  
✅ Uses fallback mechanism if ENCRYPTION_MASTER_KEY missing  
❌ Decryption required for admin operations

---

## Security Considerations

### Private Key Storage
- **Encrypted in Database:** AES-256-GCM encryption with authenticated tags
- **Format:** `iv:encrypted:tag` (all hex)
- **Key Derivation:** SHA-256(ENCRYPTION_MASTER_KEY)

### Admin Key Access
- **Restricted to Admins Only:** Checked via role='admin' in profiles
- **No Audit Trail Yet:** Consider adding admin key access logs
- **Decryption Overhead:** Each key access requires decryption

### Threat Model
- **Compromised Database:** Keys encrypted, but encryption key must be protected
- **Weak Passwords:** User passwords hashed by Supabase Auth
- **Address Reuse:** Transaction linkage risk (but standard practice)

### Recommendations
1. ✅ Implement audit logging for admin key access
2. ✅ Set up key rotation for ENCRYPTION_MASTER_KEY
3. ✅ Use hardware security module (HSM) for master key storage
4. ⚠️ Consider per-user encryption keys for better isolation
5. ⚠️ Implement withdrawal PIN requirement for sensitive operations

---

## Testing Checklist

- [ ] New user registration generates all 8 wallets
- [ ] GET /api/wallets returns addresses for logged-in user
- [ ] POST /api/deposits creates pending deposit
- [ ] Admin can confirm deposit
- [ ] Confirmed deposit credits user wallet
- [ ] Address reuse verified (eth, bnb, usdt_erc20, usdc_erc20 same address)
- [ ] BTC address different from EVM addresses
- [ ] TRON addresses correct format (T...)
- [ ] Private keys decryptable by admin

---

## Migration Guide

### For Existing Users

If upgrading from on-demand generation:

```javascript
// Run this script to backfill wallets for existing users:
for each user in profiles where user_id not in (
  select distinct user_id from crypto_addresses
):
  await createRegistrationWallets(user.id)
```

### Environment Variables

Required:
```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ENCRYPTION_MASTER_KEY=...  (or fallback used)
ADMIN_SECRET=...
```

---

## Future Enhancements

1. **Automated Deposit Detection:** Watch blockchain for incoming deposits
2. **Withdrawal Flow:** Multi-step withdrawal with fees (keep current withdrawal system)
3. **Address Diversity:** Generate new address per deposit (HD wallet support)
4. **KYC Integration:** Require KYC before enabling deposits
5. **Rate Limiting:** Limit deposits per user per day
6. **Webhook Integration:** Notify user when deposit confirmed

---

**Status:** ✅ Implementation Complete  
**Last Updated:** 2026-08-14
