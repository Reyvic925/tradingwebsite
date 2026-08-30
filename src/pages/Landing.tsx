import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  Clock,
  Fingerprint,
  Headphones,
  Landmark,
  LineChart,
  Lock,
  RefreshCcw,
  Scale,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Particles from '../components/Particles';
import LiveTicker from '../components/LiveTicker';
import IndexBoard from '../components/IndexBoard';
import type { Feature, Market, Partner, Plan, Stat, Testimonial } from '../types';
import { formatPct, formatPrice } from '../lib/format';
import { useAuth } from '../contexts/AuthContext';
import { isSignupConfirmationCallback } from '../lib/supabase';
import { isTraderEligible } from '../lib/session-utils';

const PARTNER_LOGOS: Record<string, string> = {
  JPMorgan: '/logos/jpmorgan.svg',
  Bloomberg: '/logos/bloomberg.svg',
  Nasdaq: '/logos/nasdaq.svg',
  'London Stock Exchange': '/logos/lse.svg',
  LSE: '/logos/lse.svg',
  Mastercard: '/logos/mastercard.svg',
  'Amazon Web Services': '/logos/aws.svg',
  AWS: '/logos/aws.svg',
  Cloudflare: '/logos/cloudflare.svg',
  'Deutsche Bank': '/logos/deutschebank.svg',
  BlackRock: '/logos/blackrock.svg',
};

const fallbackPartners: Partner[] = [
  { id: 1, name: 'JPMorgan', mark: 'JP' },
  { id: 2, name: 'Bloomberg', mark: 'BB' },
  { id: 3, name: 'Nasdaq', mark: 'NQ' },
  { id: 4, name: 'London Stock Exchange', mark: 'LSE' },
  { id: 5, name: 'Mastercard', mark: 'MC' },
  { id: 6, name: 'Amazon Web Services', mark: 'AWS' },
  { id: 7, name: 'Cloudflare', mark: 'CF' },
  { id: 8, name: 'Deutsche Bank', mark: 'DB' },
  { id: 10, name: 'BlackRock', mark: 'BR' },
];

const fallbackPlans: Plan[] = [
  { id: 1, name: 'Starter', tagline: 'First desk allocation', min_amount: 200, max_amount: 999, daily_rate: 2.5, duration_days: 6, total_return: 275, featured: false },
  { id: 2, name: 'Premium', tagline: 'The house favorite', min_amount: 1000, max_amount: 4900, daily_rate: 3.5, duration_days: 7, total_return: 357, featured: true },
  { id: 3, name: 'Gold', tagline: 'For serious books', min_amount: 5000, max_amount: 24900, daily_rate: 4.5, duration_days: 9, total_return: 480, featured: false },
  { id: 4, name: 'Diamond', tagline: 'Private client mandate', min_amount: 25000, max_amount: null, daily_rate: 6, duration_days: 14, total_return: 640, featured: false },
];

const fallbackTestimonials: Testimonial[] = [
  { id: 1, name: 'Marcus Hale', country: 'United States', amount: 184200, quote: 'The desk feels like a bulge-bracket prime.', video_url: '/videos/testimonial-1.mp4', avatar_url: '/images/avatar-1.jpg', role: 'Family office principal' },
  { id: 2, name: 'Elena Voss', country: 'Germany', amount: 96250, quote: 'Stop-loss filled within a tick of my level.', video_url: '/videos/testimonial-2.mp4', avatar_url: '/images/avatar-2.jpg', role: 'Systematic trader' },
  { id: 3, name: 'Kenji Nakamura', country: 'Japan', amount: 241800, quote: 'Gold plan compounded exactly as advertised.', video_url: '/videos/testimonial-3.mp4', avatar_url: '/images/avatar-3.jpg', role: 'Private investor' },
  { id: 4, name: 'Sofia Alvarez', country: 'Spain', amount: 67340, quote: 'Copying two lead traders while I run FX.', video_url: '/videos/testimonial-4.mp4', avatar_url: '/images/avatar-4.jpg', role: 'FX specialist' },
  { id: 5, name: 'Amir Farouk', country: 'United Arab Emirates', amount: 312900, quote: 'A human on the phone at 2am Dubai time.', video_url: '/videos/testimonial-5.mp4', avatar_url: '/images/avatar-5.jpg', role: 'Commodity allocator' },
  { id: 6, name: 'Amara Okafor', country: 'United Kingdom', amount: 128600, quote: 'Funded with a card, long NVDA before London open.', video_url: '/videos/testimonial-6.mp4', avatar_url: '/images/avatar-6.jpg', role: 'Growth investor' },
  { id: 7, name: 'Lars Holm', country: 'Sweden', amount: 89400, quote: 'Spreads on majors are honest.', video_url: '/videos/testimonial-7.mp4', avatar_url: '/images/avatar-7.jpg', role: 'Macro trader' },
  { id: 8, name: 'Priya Mehta', country: 'Singapore', amount: 156750, quote: 'The Premium plan did the rest.', video_url: '/videos/testimonial-8.mp4', avatar_url: '/images/avatar-8.jpg', role: 'Quant researcher' },
];

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  ai: Bot,
  analysis: LineChart,
  multi: Landmark,
  risk: Scale,
  support: Headphones,
  deposits: Wallet,
  referral: Users,
  mobile: Smartphone,
  ssl: Lock,
  fees: Sparkles,
  reinvest: RefreshCcw,
  social: Users,
};

function Counter({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const dur = 1600;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);

  let formatted: string;
  if (value >= 1_000_000) {
    formatted = `${prefix}${(n / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M${suffix}`;
  } else if (value >= 1000) {
    formatted = `${prefix}${(n / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K${suffix}`;
  } else {
    formatted = `${prefix}${n.toFixed(2)}${suffix}`;
  }

  return (
    <span ref={ref} className="tabular-nums">
      {formatted}
    </span>
  );
}

const fallbackFeatures: Feature[] = [
  { id: 1, title: 'AI Trading Desk', description: 'Machine-assisted signals and execution routing trained on multi-year market microstructure.', icon: 'ai' },
  { id: 2, title: 'Real-time Analysis', description: 'Streaming books, depth, and volatility surfaces refreshed in milliseconds.', icon: 'analysis' },
  { id: 3, title: 'Multi-asset Access', description: 'Equities, FX, and digital assets from a single margin account.', icon: 'multi' },
  { id: 4, title: 'Risk Management', description: 'Stop-loss, take-profit, and margin safeguards on every ticket.', icon: 'risk' },
  { id: 5, title: '24/7 Support', description: 'Human desk coverage across New York, London, and Singapore sessions.', icon: 'support' },
  { id: 6, title: 'Instant Deposits & Withdrawals', description: 'Card, wire, and stablecoin rails with same-session settlement.', icon: 'deposits' },
  { id: 7, title: 'Referral Program', description: 'Share your code and earn $25 when invited clients fund an account.', icon: 'referral' },
  { id: 8, title: 'Mobile-friendly', description: 'A full terminal experience on any screen, no download required.', icon: 'mobile' },
  { id: 9, title: 'Bank-grade SSL', description: 'TLS 1.3 encryption and hardware-backed session keys.', icon: 'ssl' },
  { id: 10, title: 'Transparent Fees', description: 'Published spreads and commissions. No overnight surprises.', icon: 'fees' },
  { id: 11, title: 'Auto-reinvestment', description: 'Compound matured plan payouts back into the next cycle.', icon: 'reinvest' },
  { id: 12, title: 'Social Trading', description: 'Allocate capital to verified lead traders and copy their book.', icon: 'social' },
];

type BrowserWalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown[]>;
};

export default function Landing() {
  const { user, loading: authLoading } = useAuth();
  const [openSessions, setOpenSessions] = useState<string[]>([]);
  const [features, setFeatures] = useState<Feature[]>(fallbackFeatures);
  const [partners, setPartners] = useState<Partner[]>(fallbackPartners);
  const [stats, setStats] = useState<Stat[]>([]);
  const [plans, setPlans] = useState<Plan[]>(fallbackPlans);
  const [testimonials, setTestimonials] = useState<Testimonial[]>(fallbackTestimonials);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeVid, setActiveVid] = useState<Testimonial | null>(null);

  useEffect(() => {
    const updateOpenSessions = () => {
      const sessions = [
        { type: 'sydney', label: 'SYD' },
        { type: 'tokyo', label: 'TYO' },
        { type: 'nyc', label: 'NY' },
        { type: 'london', label: 'LDN' },
      ];
      setOpenSessions(sessions.filter((session) => isTraderEligible({ session_type: session.type })).map((session) => session.label));
    };

    updateOpenSessions();
    const interval = window.setInterval(updateOpenSessions, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [landRes, mktRes] = await Promise.all([
          fetch('/api/landing').catch(() => null),
          fetch('/api/markets?featured=1&limit=12').catch(() => null),
        ]);

        if (!alive) return;

        // Handle landing data if available
        if (landRes && landRes.ok) {
          try {
            const data = await landRes.json();
            if (!alive) return;
            if (data.features?.length) setFeatures(data.features);
            if (data.partners?.length) setPartners(data.partners);
            setStats(data.stats || []);
            if (data.plans?.length) setPlans(data.plans);
            if (data.testimonials?.length) setTestimonials(data.testimonials);
          } catch (err) {
            console.warn('[landing] failed to parse /api/landing response', err);
          }
        } else if (landRes) {
          // Non-OK response: log and continue using fallbacks
          try {
            const txt = await landRes.text();
            console.warn('[landing] /api/landing failed', landRes.status, txt);
          } catch {
            console.warn('[landing] /api/landing failed', landRes.status);
          }
        } else {
          console.warn('[landing] /api/landing unreachable');
        }

        // Handle markets data if available
        if (mktRes && mktRes.ok) {
          try {
            const mkts = await mktRes.json();
            const items = Array.isArray(mkts) ? mkts : mkts.items;
            if (Array.isArray(items)) setMarkets(items);
          } catch (err) {
            console.warn('[landing] failed to parse /api/markets response', err);
          }
        } else if (mktRes) {
          console.warn('[landing] /api/markets failed', mktRes.status);
        } else {
          console.warn('[landing] /api/markets unreachable');
        }
      } catch (e: unknown) {
        console.warn('[landing] unexpected error', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const partnerLoop = useMemo(() => [...partners, ...partners], [partners]);

  // Supabase uses the configured Site URL when a requested email redirect URL is
  // absent from its allow-list. Confirmation should still end at sign-in rather
  // than silently authenticating the user into their dashboard.
  if (!authLoading && user && isSignupConfirmationCallback) return <Navigate to="/login?confirmed=1" replace />;

  return (
    <div id="top" className="bg-[#05070b] text-stone-100">
      <Navbar />

      <section className="relative min-h-screen overflow-hidden grain">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster=""
          src="/videos/hero-trading-floor.mp4"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#05070b]/55 via-[#05070b]/70 to-[#05070b]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(5,7,11,0.55)_70%)]" />
        <Particles />

        <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-5 pb-28 pt-32 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {openSessions.length > 0 ? `Markets open · ${openSessions.join(' · ')}` : 'Markets closed · SYD · TYO · LDN · NY'}
            </div>
            <h1 className="mt-6 max-w-5xl font-display text-5xl leading-[0.95] sm:text-7xl lg:text-8xl">
              Trade Like a Pro,{' '}
              <span className="gold-text italic">Earn Like a Legend</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-stone-300/90 sm:text-lg">
              A private multi-asset broker for serious capital. Institutional liquidity, cinematic execution, and plans engineered for compounding.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/login?mode=signup"
                className="inline-flex items-center gap-2 rounded-sm bg-amber-400 px-6 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#1a1304] transition hover:bg-amber-300"
              >
                Open live account <ArrowRight size={16} />
              </Link>
              <a
                href="#plans"
                className="inline-flex items-center gap-2 rounded-sm border border-white/20 px-6 py-3 text-sm uppercase tracking-[0.16em] text-stone-100 hover:border-amber-300/50"
              >
                View plans
              </a>
            </div>

            <div className="mt-8 max-w-lg rounded-md border border-amber-300/20 bg-black/30 p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-amber-200">Wallet test</div>
                  <div className="mt-1 text-sm text-stone-300">Connect any injected EVM wallet, including Trust Wallet and other browser wallets.</div>
                </div>
                <button
                  id="walletConnectBtn"
                  type="button"
                  className="inline-flex items-center rounded-sm border border-amber-300/50 bg-amber-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-400/20"
                >
                  Connect wallet
                </button>
              </div>
              <div id="walletStatus" className="mt-3 rounded-sm border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-stone-300">
                No wallet connected yet
              </div>
              <div id="walletAddress" className="mt-2 text-[11px] uppercase tracking-[0.2em] text-stone-500">
                Not connected
              </div>
            </div>
          </motion.div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20">
          <LiveTicker />
        </div>
      </section>

      <section className="border-b border-white/5 bg-[#07090e] py-8">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="mb-5 text-center text-[10px] uppercase tracking-[0.32em] text-stone-500">Infrastructure & market partners</div>
          <div className="overflow-hidden">
            <div className="partner-track flex w-max gap-10">
              {partnerLoop.map((p, i) => (
                <div key={`${p.id}-${i}`} className="flex items-center gap-3 whitespace-nowrap opacity-90">
                  {PARTNER_LOGOS[p.name] ? (
                    <img src={PARTNER_LOGOS[p.name]} alt={p.name} className="h-9 w-auto rounded-sm border border-white/10" />
                  ) : (
                    <span className="grid h-9 w-9 place-items-center rounded-sm border border-white/10 bg-white/5 font-display text-sm text-amber-200">
                      {p.mark}
                    </span>
                  )}
                  <span className="text-sm tracking-wide text-stone-300">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          {(stats.length
            ? stats
            : [
                { id: 1, label: 'Active clients', value: 50000, prefix: '', suffix: '+' },
                { id: 2, label: 'Client deposits', value: 50000000, prefix: '$', suffix: '+' },
                { id: 3, label: 'Daily trades', value: 12500, prefix: '', suffix: '+' },
                { id: 4, label: 'Platform uptime', value: 99.99, prefix: '', suffix: '%' },
              ]
          ).map((s) => (
            <div key={s.id} className="rounded-md border border-white/5 bg-white/[0.02] p-6">
              <div className="font-display text-4xl text-amber-200">
                <Counter value={Number(s.value)} prefix={s.prefix || ''} suffix={s.suffix || ''} />
              </div>
              <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-stone-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="markets" className="border-t border-white/5 py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/80">Live markets</div>
              <h2 className="mt-3 font-display text-4xl sm:text-5xl">Global cash books. One margin account.</h2>
            </div>
            <Link to="/login" className="text-sm text-amber-200">Open the desk →</Link>
          </div>
          <div className="mt-8">
            {/* Equity benchmark cards are shown only in the stock markets section, not on the public landing page. */}
          </div>
          <div className="mt-10 overflow-hidden rounded-md border border-white/8">
            <div className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-3 lg:grid-cols-4">
              {(markets.length ? markets : []).slice(0, 12).map((m) => (
                <div key={m.id} className="bg-[#080b11] p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-sm">{m.symbol}</div>
                    <div className="text-[10px] uppercase tracking-widest text-stone-600">{m.asset_class === 'forex' ? 'Forex' : m.asset_class === 'crypto' ? 'Crypto' : m.asset_class === 'futures' ? 'Futures' : 'Stocks'}</div>
                  </div>
                  <div className="mt-2 font-mono text-lg">{formatPrice(Number(m.price))}</div>
                  <div className={`text-xs ${Number(m.change_24h) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPct(Number(m.change_24h))}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-8 pb-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/80">The desk</div>
            <h2 className="mt-3 font-display text-4xl sm:text-5xl">Twelve reasons the floor never sleeps.</h2>
            <p className="mt-4 text-stone-400">Every tool a prop desk would demand — rebuilt for private clients.</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => {
              const Icon = ICONS[f.icon] || Sparkles;
              return (
                <motion.article
                  key={f.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: (i % 3) * 0.05 }}
                  className="group rounded-md border border-white/5 bg-gradient-to-b from-white/[0.035] to-transparent p-6 transition hover:border-amber-300/25"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-sm bg-amber-400/10 text-amber-300">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-lg text-stone-50">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-400">{f.description}</p>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="plans" className="border-y border-white/5 bg-[#080b11] py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/80">Managed plans</div>
              <h2 className="mt-3 font-display text-4xl sm:text-5xl">Capital, compounded on a schedule.</h2>
            </div>
            <p className="max-w-md text-sm text-stone-400">Cycle-based return. Defined duration. Transparent total return. Withdraw principal plus yield when the cycle closes.</p>
          </div>

          {loading && <div className="mt-10 h-64 animate-pulse rounded-md bg-white/5" />}
          {error && <div className="mt-8 rounded-sm border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}

          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((p) => (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-md border p-6 ${
                  p.featured ? 'border-amber-300/40 bg-amber-400/5 shadow-[0_0_60px_rgba(212,175,55,0.08)]' : 'border-white/8 bg-white/[0.02]'
                }`}
              >
                {p.featured && (
                  <div className="absolute -top-3 right-4 rounded-full bg-amber-400 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#1a1304]">
                    Most selected
                  </div>
                )}
                <div className="font-display text-3xl text-stone-50">{p.name}</div>
                <div className="mt-1 text-sm text-stone-500">{p.tagline}</div>
                <div className="mt-6 font-display text-5xl text-amber-200">{p.total_return}%</div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Total return</div>
                <ul className="mt-6 space-y-2 text-sm text-stone-300">
                  <li className="flex justify-between border-b border-white/5 py-2">
                    <span className="text-stone-500">Range</span>
                    <span>
                      ${Number(p.min_amount).toLocaleString()}
                      {p.max_amount ? ` – $${Number(p.max_amount).toLocaleString()}` : '+'}
                    </span>
                  </li>
                  <li className="flex justify-between border-b border-white/5 py-2">
                    <span className="text-stone-500">Duration</span>
                    <span>{p.duration_days} days</span>
                  </li>
                  <li className="flex justify-between py-2">
                    <span className="text-stone-500">Total return</span>
                    <span className="text-emerald-400">{p.total_return}%</span>
                  </li>
                </ul>
                <Link
                  to="/login?mode=signup"
                  className={`mt-6 block rounded-sm py-2.5 text-center text-xs font-semibold uppercase tracking-[0.18em] ${
                    p.featured ? 'bg-amber-400 text-[#1a1304]' : 'border border-white/15 text-stone-100'
                  }`}
                >
                  Subscribe
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="proof" className="py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/80">Client voices</div>
            <h2 className="mt-3 font-display text-4xl sm:text-5xl">Legends leave receipts.</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {testimonials.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveVid(t)}
                className="group relative overflow-hidden rounded-md border border-white/8 text-left"
              >
                <video
                  className="h-72 w-full object-cover transition duration-700 group-hover:scale-105"
                  muted
                  loop
                  playsInline
                  autoPlay
                  src={t.video_url}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="text-sm text-stone-50">{t.name}</div>
                  <div className="text-[11px] uppercase tracking-widest text-stone-400">{t.country}</div>
                  <div className="mt-2 font-mono text-amber-200">+${Number(t.amount).toLocaleString()}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {activeVid && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4" onClick={() => setActiveVid(null)}>
          <div className="w-full max-w-2xl overflow-hidden rounded-md border border-white/10 bg-[#0c1017]" onClick={(e) => e.stopPropagation()}>
            <video className="aspect-video w-full object-cover" src={activeVid.video_url} controls autoPlay />
            <div className="p-5">
              <div className="font-display text-2xl">{activeVid.name}</div>
              <div className="text-sm text-stone-400">
                {activeVid.role} · {activeVid.country}
              </div>
              <p className="mt-3 text-stone-300">“{activeVid.quote}”</p>
              <div className="mt-3 font-mono text-amber-200">Realized +${Number(activeVid.amount).toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      <section id="trust" className="border-t border-white/5 bg-[#080b11] py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/80">Trust architecture</div>
            <h2 className="mt-3 font-display text-4xl">Built to be audited.</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { icon: Lock, title: '256-bit SSL', copy: 'Every session encrypted end to end.' },
              { icon: ShieldCheck, title: 'GDPR', copy: 'EU data residency & subject rights.' },
              { icon: Fingerprint, title: 'PCI-DSS', copy: 'Card data never touches our vaults.' },
              { icon: Landmark, title: 'Registered company', copy: 'The Prime Markets Ltd · Prime Markets · 11847291' },
              { icon: Clock, title: 'Transparent fees', copy: 'Published pricing with no hidden surprises.' },
            ].map((b) => (
              <div key={b.title} className="rounded-md border border-white/8 bg-white/[0.02] p-5 text-center">
                <b.icon className="mx-auto text-amber-300" size={22} />
                <div className="mt-3 text-sm text-stone-50">{b.title}</div>
                <div className="mt-1 text-xs text-stone-500">{b.copy}</div>
              </div>
            ))}
          </div>

          <div className="mt-16 overflow-hidden rounded-md border border-amber-300/20 bg-gradient-to-r from-amber-400/10 to-transparent p-8 md:p-12">
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <h3 className="font-display text-4xl">Your next session starts now.</h3>
                <p className="mt-2 max-w-lg text-stone-400">Fund from $100. Trade the open. Or let a plan compound while you sleep.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/login?mode=signup" className="rounded-sm bg-amber-400 px-6 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#1a1304]">
                  Create free account
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
