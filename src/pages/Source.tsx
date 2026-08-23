import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const CONTENTS = [
  { path: 'src/pages/', note: 'Landing, Login, Dashboard, Trade, Markets, Wallet, Invest, Social, Referrals, History, Profile, Source' },
  { path: 'src/components/', note: 'Logo, Navbar, Footer, AppShell, Particles, LiveTicker, IndexBoard, PriceChart' },
  { path: 'src/lib/', note: 'Supabase client, API helpers, brand, formatters, Google auth' },
  { path: 'api/', note: 'Serverless routes + US/global universe seed data' },
  { path: 'public/videos/', note: 'Hero trading-floor film + 8 testimonials' },
  { path: 'public/logos/', note: 'JPMorgan, Bloomberg, Nasdaq, LSE, Mastercard, AWS, Cloudflare, TradingView, Deutsche Bank, BlackRock' },
  { path: 'public/images/', note: 'Trader / client portraits' },
  { path: 'schema.sql', note: 'Full Postgres schema including market_indices' },
  { path: '.env.example', note: 'Required environment keys (no secrets)' },
  { path: 'PUSH.md', note: 'How to push to GitHub' },
];

export default function Source() {
  return (
    <div className="min-h-screen bg-[#05070b] text-stone-100">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-32 lg:px-8">
        <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/80">Archive</div>
        <h1 className="mt-3 font-display text-5xl">Full website source</h1>
        <p className="mt-4 text-stone-400">
          One zip of the complete The Prime Markets app: landing page, authenticated terminal, API routes, videos, logos, and database schema. No <code className="text-stone-200">node_modules</code>, no <code className="text-stone-200">.env</code>.
        </p>
        <a
          href="/downloads/the-prime-markets.zip"
          download
          className="mt-8 inline-flex rounded-sm bg-amber-400 px-6 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#1a1304]"
        >
          Download the-prime-markets.zip
        </a>
        <ul className="mt-10 divide-y divide-white/5 rounded-md border border-white/8">
          {CONTENTS.map((c) => (
            <li key={c.path} className="px-4 py-3">
              <div className="font-mono text-sm text-amber-200">{c.path}</div>
              <div className="mt-1 text-sm text-stone-500">{c.note}</div>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-stone-500">
          After unzip: <code className="text-stone-300">npm install</code> · <code className="text-stone-300">cp .env.example .env</code> · apply <code className="text-stone-300">schema.sql</code> · <code className="text-stone-300">npm run dev</code>. Push steps are in <code className="text-stone-300">PUSH.md</code>.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm text-amber-200">← Back to landing</Link>
      </main>
      <Footer />
    </div>
  );
}
