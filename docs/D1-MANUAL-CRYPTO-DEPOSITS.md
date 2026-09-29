# D1 Manual Crypto Deposits

Each D1 user receives eight HD wallet variants derived from their own 12-word mnemonic, matching the existing application: BTC, ETH, BNB, ERC-20 USDT, ERC-20 USDC, Polygon, Avalanche, and Base. EVM-compatible variants reuse the same BIP44 key/address where the prior application did. The mnemonic and each private key are stored only as randomized AES-256-GCM ciphertext. Users can see their addresses; only administrators can reveal encrypted key material.

The Worker supports user-submitted crypto deposits with manual administrator review. A request never credits a wallet by itself. The wallet is credited only when an allowlisted administrator approves the pending request with a verified USD amount.

## Worker Configuration

Configure these Worker variables separately for staging and production in Cloudflare:

- `ADMIN_EMAILS`: comma-separated email addresses allowed to review deposits and reveal wallet keys, for example `finance@example.com,ops@example.com`. This is an allowlist, not an automatic role grant; each admin profile must also be promoted explicitly.
- `ENCRYPTION_MASTER_KEY`: a high-entropy secret of at least 32 characters. Store it as a Worker secret, never in `wrangler.toml`, the frontend, or source control. Use the same secret for wallet creation and admin decryption. Back it up securely; losing it makes existing wallet keys unrecoverable.

Do not assign admin roles automatically during public signup. The D1 signup flow does not verify email ownership. Provision and verify the first admin account before opening registration, then promote that exact account with Wrangler and add its address to `ADMIN_EMAILS`:

```powershell
npx wrangler d1 execute apex-prime-staging --remote --env staging --command "UPDATE profiles SET role = 'admin' WHERE user_id = (SELECT id FROM auth_users WHERE email = 'admin@example.com')"
```

The API requires both the database role and the email allowlist to match. Never grant `admin` to a public signup until email ownership and account control have been verified. Receiving addresses are per-user D1 rows; no shared address JSON variable is used.

If `ENCRYPTION_MASTER_KEY` is absent, account creation still succeeds but wallet generation fails closed. The wallet page shows that deposit wallets are unavailable, and deposit requests are rejected. Configure the secret before accepting deposits. Never place a mnemonic or private key in `DEPOSIT_ADDRESSES_JSON` or any public configuration.

## Review Flow

1. The user selects a configured currency/network, sends funds, and submits the amount and transaction hash.
2. D1 rejects a duplicate transaction hash on the same network.
3. An administrator independently verifies the transaction, destination, confirmations, and received amount.
4. The administrator enters the USD credit and approves or rejects the request.
5. Approval changes a pending request once. A D1 trigger atomically records the ledger credit, updates the USD wallet, inserts transaction history, and writes an admin audit record. Repeated approvals cannot credit twice.

The Worker does not automatically verify transactions on-chain or calculate exchange rates. The administrator must determine the USD credit from the verified transfer. Do not enable production deposits until the addresses, administrator allowlist, review procedure, and reconciliation process are confirmed.