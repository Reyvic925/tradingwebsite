Deposit detection cron job and webhook

Overview
- Adds a cron endpoint /api/cron/deposits that scans known crypto addresses and credits user wallets when incoming blockchain deposits are detected.
- Adds a webhook endpoint /api/webhook/blockchain for providers that push deposit notifications.
- Designed to support multiple providers (Etherscan, BlockCypher, or a custom BLOCKCHAIN_API).
- Use DRY_RUN=true when testing locally to avoid writes to production DB.

Files added
- api-handlers/deposit-detector.js -- cron endpoint + library (exports handler and checkAddresses)
- api-handlers/blockchain-webhook.js -- webhook receiver (exports handler)

Required environment variables
- SUPABASE_URL -- your PostgREST/Supabase rest endpoint (e.g. https://xyz.supabase.co)
- SUPABASE_KEY -- service role or REST API key used to read/write DB rows
- CRON_SECRET -- secret used to protect the cron endpoint (/api/cron/deposits). Must match x-cron-secret header or cron_secret query param.
- BLOCKCHAIN_PROVIDER -- provider name: etherscan (default), blockcypher, or leave unset when using BLOCKCHAIN_API
- BLOCKCHAIN_API_KEY -- API key for the chosen provider (e.g., Etherscan API key)
- BLOCKCHAIN_API -- (optional) base URL for a custom provider supporting GET /address/{addr}?since={unix}
- BLOCKCHAIN_WEBHOOK_SECRET -- (optional) HMAC-SHA256 secret for webhook signature verification. The webhook expects header X-Webhook-Signature with hex HMAC-SHA256 of the raw body.
- DRY_RUN -- set to true to prevent any writes (useful for development)

Minimal example usage

Cron (HTTP GET or POST):
- URL: https://your-deployment.example.com/api/cron/deposits
- Header: x-cron-secret: <CRON_SECRET>
- Response: { ok: true, dryRun: <true|false>, results: [...] }

Webhook
- Register your provider to POST to https://your-deployment.example.com/api/webhook/blockchain
- If BLOCKCHAIN_WEBHOOK_SECRET is set, compute hex HMAC-SHA256 over the raw JSON body and send it in header X-Webhook-Signature.
- Example payload expected: { "address": "0xabc...", "tx_hash": "0x123...", "amount": "1000000000000000000", "currency": "ETH", "timestamp": 1620000000 }

Dry-run mode (local testing)
- Set DRY_RUN=true in your environment. The cron endpoint will fetch addresses and simulate detection but will not perform writes to transactions/wallets/notifications.

Notes and assumptions
- This implementation uses Supabase/PostgREST endpoints to query and update tables (crypto_addresses, transactions, wallets, notifications). If your schema is different, adjust the field names and queries in api-handlers/deposit-detector.js.
- The code attempts to insert a transactions row and create a notification, but updating wallet balances may require a DB trigger or a dedicated RPC to safely increment balances (the sample PATCH to wallets in the code is a placeholder).
- For robustness in production, prefer to (a) use DB triggers or SQL functions to ensure transactions are idempotent and atomically update balances, and (b) verify transaction confirmations on-chain before crediting.

Testing
- A DRY_RUN mode is available. For unit testing, require and call checkAddresses() from api-handlers/deposit-detector.js with mocked provider responses.

Security
- Protect CRON endpoint with a strong CRON_SECRET and lock inbound IPs if possible.
- Use service-role SUPABASE_KEY that is restricted to only necessary operations (or run cron job inside a secure backend with DB access instead of embedding keys in the runtime environment).

If you need help customizing SQL for your schema (e.g. atomic crediting), provide the schema for wallets and transactions and I can draft SQL trigger/RPC functions.
