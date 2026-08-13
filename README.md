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
| `VITE_GOOGLE_CLIENT_ID` | optional |
| `VITE_GOOGLE_AUTH_PROXY` | optional |

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
