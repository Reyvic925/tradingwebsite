# D1 Manual Crypto Deposits

The Worker supports user-submitted crypto deposits with manual administrator review. A request never credits a wallet by itself. The wallet is credited only when an allowlisted administrator approves the pending request with a verified USD amount.

## Worker Configuration

Configure these Worker variables separately for staging and production in Cloudflare:

- `ADMIN_EMAILS`: comma-separated email addresses allowed to review deposits, for example `finance@example.com,ops@example.com`. Profiles for these accounts receive the `admin` role when `/api/profile` is loaded.
- `DEPOSIT_ADDRESSES_JSON`: JSON array of public receiving addresses. Configure only assets and networks whose funds your organization controls and can verify.

Do not assign admin roles automatically during public signup. The D1 signup flow does not verify email ownership. Provision the first admin account yourself before opening public registration, verify you control its password, then promote that exact account with Wrangler and add its address to `ADMIN_EMAILS`:

```powershell
npx wrangler d1 execute apex-prime-staging --remote --env staging --command "UPDATE profiles SET role = 'admin' WHERE user_id = (SELECT id FROM auth_users WHERE email = 'admin@example.com')"
```

Use the production database name only after its binding exists and the account has been verified. The API requires both the database role and the email allowlist match.

Example shape (replace every example value before enabling deposits):

```json
[
  { "currency": "USDT", "network": "ethereum", "address": "REPLACE_WITH_CONTROLLED_ADDRESS" },
  { "currency": "USDT", "network": "tron", "address": "REPLACE_WITH_CONTROLLED_ADDRESS" },
  { "currency": "BTC", "network": "bitcoin", "address": "REPLACE_WITH_CONTROLLED_ADDRESS" }
]
```

Receiving addresses are public and are returned to signed-in users. Never put private keys, seed phrases, or signing credentials in this variable. If no valid address entries are configured, the API rejects new deposit requests and the wallet page shows no available deposit option.

## Review Flow

1. The user selects a configured currency/network, sends funds, and submits the amount and transaction hash.
2. D1 rejects a duplicate transaction hash on the same network.
3. An administrator independently verifies the transaction, destination, confirmations, and received amount.
4. The administrator enters the USD credit and approves or rejects the request.
5. Approval changes a pending request once. A D1 trigger atomically records the ledger credit, updates the USD wallet, inserts transaction history, and writes an admin audit record. Repeated approvals cannot credit twice.

The Worker does not automatically verify transactions on-chain or calculate exchange rates. The administrator must determine the USD credit from the verified transfer. Do not enable production deposits until the addresses, administrator allowlist, review procedure, and reconciliation process are confirmed.