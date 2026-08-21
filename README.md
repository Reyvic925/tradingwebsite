# Apex Prime Broker

Full-stack multi-asset trading desk.

**Apex Prime** is the brand. **Apex Broker** is the product.

> Trade Like a Pro, Earn Like a Legend

Demo only. Not a licensed broker.

## Download this folder

A complete source zip (code, videos, logos, schema — no `node_modules`, no secrets) is served from the live site:

`/downloads/apex-prime-broker.zip`

After unzip:

```bash
npm install
cp .env.example .env
npm run dev
```

Then follow `PUSH.md` to publish to GitHub.

## What’s in the product

**Landing**
- Full-screen trading-floor video, gradient overlay, animated particles
- Hero headline and CTAs
- Live trade tape
- Partner logos: JPMorgan, Bloomberg, Nasdaq, LSE, Mastercard, AWS, Cloudflare, TradingView, Deutsche Bank, BlackRock
- 12 features, four plans, animated stats, eight video testimonials
- Trust badges: SSL, GDPR, PCI-DSS, registered company, money-back

**Terminal**
- Email + Google auth
- Trade desk, wallet, plans, copy trading, referrals, KYC, history

## Layout

```
.
├── api/                 Vercel serverless routes
├── public/
│   ├── downloads/       Source zip (generated)
│   ├── images/          Avatars
│   ├── logos/           Partner marks
│   └── videos/          Hero + testimonials
├── src/
│   ├── components/
│   ├── contexts/
│   ├── lib/
│   └── pages/
├── schema.sql
├── .env.example
└── PUSH.md
```

## Environment

Copy `.env.example` to `.env`. Never commit `.env`.

| Name | Where |
| --- | --- |
| `VITE_SUPABASE_URL` | client |
| `VITE_SUPABASE_ANON_KEY` | client |
| `NEXT_PUBLIC_SUPABASE_URL` | API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | API |
| `SUPABASE_SERVICE_ROLE_KEY` | API |
| `RESEND_API_KEY` | API — transactional alert emails |
| `RESEND_FROM_EMAIL` | API — verified no-reply sender |
| `APP_URL` | API — email links |
| `VITE_GOOGLE_CLIENT_ID` | optional |
| `VITE_GOOGLE_AUTH_PROXY` | optional |

For signup confirmation/OTP emails, configure Resend SMTP in Supabase Authentication settings with the same verified no-reply sender. The application uses Resend directly for account and trading alerts.

## Demo

```
demo@apexprime.com
password123
```

## Plans

| Plan | Range | Daily | Term | Total |
| --- | --- | --- | --- | --- |
| Starter | $100–999 | 2.5% | 30d | 175% |
| Premium | $1K–4.9K | 3.5% | 45d | 257% |
| Gold | $5K–24.9K | 4.5% | 60d | 370% |
| Diamond | $25K+ | 6% | 90d | 640% |

## Scripts

```bash
npm run dev
npm run build
npm run pack    # rebuild public/downloads/apex-prime-broker.zip
```

## License

MIT

## Cron tick endpoint

The server exposes a protected cron tick endpoint at /api/cron/tick that advances simulated market prices and writes OHLCV rows to the price_history table.

For investment ROI processing, configure cron-job.org to call `POST /api/cron/roi` every five minutes. Setup, security, and verification instructions are in [docs/CRON-JOB-ORG-INVESTMENT.md](docs/CRON-JOB-ORG-INVESTMENT.md).

For copy trading, configure cron-job.org to call `POST /api/cron/copy-trading` every minute. The endpoint advances trader equity, copy-trade PnL, trade logs, risk triggers, and session expiry using the same `CRON_SECRET` protection.

Security
- The endpoint requires a secret environment variable CRON_SECRET to be set for the server process. Example (Unix):

  export CRON_SECRET="replace-with-a-random-string"

Or on Windows (PowerShell):

  $env:CRON_SECRET = 'replace-with-a-random-string'

How to call
- Call with the header X-Cron-Secret or the query parameter cron_secret. Example using curl:

  curl -X POST "https://your-site.example.com/api/cron/tick" -H "X-Cron-Secret: replace-with-a-random-string"

or with query string:

  curl "https://your-site.example.com/api/cron/tick?cron_secret=replace-with-a-random-string"

Notes
- Per-market admin tunables supported: markets.hidden_drift and markets.volatility (decimal values). hidden_drift biases the expected drift per tick; volatility scales random shocks.
- A convenience verification script is available at scripts/tick_once.js to run a single tick locally and confirm a price_history row is inserted (it requires SUPABASE credentials as documented in the Environment section).

