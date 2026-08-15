import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { apiMarkets } from '../lib/api';
import { formatPct, formatPrice } from '../lib/format';
import type { Market } from '../types';
import IndexBoard from '../components/IndexBoard';

const DEFAULT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'usa', label: 'USA' },
  { id: 'japan', label: 'Japan' },
  { id: 'canada', label: 'Canada' },
  { id: 'uk', label: 'UK' },
  { id: 'europe', label: 'Europe' },
  { id: 'germany', label: 'Germany' },
  { id: 'france', label: 'France' },
  { id: 'india', label: 'India' },
  { id: 'etf', label: 'US ETFs' },
  { id: 'forex', label: 'FX' },
  { id: 'crypto', label: 'Crypto' },
];

const DEFAULT_REGION_FROM: Record<string, string> = {
  us: 'usa',
  jp: 'japan',
  ca: 'canada',
  uk: 'uk',
  eu: 'europe',
  de: 'germany',
  fr: 'france',
  in: 'india',
};

const STOCK_FILTERS = new Set(['all', 'usa', 'japan', 'canada', 'uk', 'europe', 'germany', 'france', 'india', 'etf']);

const QUICK_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'forex', label: 'FX' },
  { id: 'etf', label: 'Stocks' },
];

interface CachedMarketData {
  items: Market[];
  total: number;
  timestamp: number;
}

export default function Markets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [regionMapping, setRegionMapping] = useState(DEFAULT_REGION_FROM);
  const pageSize = 50;
  const cacheRef = useRef<Record<string, CachedMarketData>>({});
  const CACHE_TTL = 30000;

  useEffect(() => {
    Promise.all([
      fetch('/api/app-config?key=market_filters').then(r => r.json()).catch(() => null),
      fetch('/api/app-config?key=region_mapping').then(r => r.json()).catch(() => null),
    ]).then(([filtersConfig, regionConfig]) => {
      const rawFilters = Array.isArray(filtersConfig?.value)
        ? filtersConfig.value
        : Array.isArray(filtersConfig)
          ? filtersConfig
          : DEFAULT_FILTERS;

      const nextFilters = (rawFilters || []).filter((entry: any) => entry && typeof entry === 'object' && String(entry?.id || '').trim() && String(entry?.label || entry?.id || '').trim()).length
        ? (rawFilters || []).filter((entry: any) => entry && typeof entry === 'object' && String(entry?.id || '').trim() && String(entry?.label || entry?.id || '').trim())
        : DEFAULT_FILTERS;
      setFilters(nextFilters);

      if (regionConfig?.value && typeof regionConfig.value === 'object') {
        setRegionMapping(regionConfig.value);
      }
    }).catch(() => {
      setFilters(DEFAULT_FILTERS);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 280);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(0);
  }, [filter, debounced]);

  useEffect(() => {
    let alive = true;
    const cacheKey = `${filter}:${debounced}:${page}`;
    const cached = cacheRef.current[cacheKey];
    const now = Date.now();
    const isCacheValid = cached && (now - cached.timestamp) < CACHE_TTL;

    if (isCacheValid && cached) {
      setMarkets(cached.items);
      setTotal(cached.total);
      setError('');
      setLoading(false);
    } else {
      setLoading(true);
    }

    const load = async (tick = false) => {
      try {
        const data = await apiMarkets<Market>({
          class: filter,
          q: debounced || undefined,
          limit: pageSize,
          offset: page * pageSize,
          tick: tick ? 1 : undefined,
        });
        if (!alive) return;
        setMarkets(data.items);
        setTotal(data.total);
        setError('');
        cacheRef.current[cacheKey] = {
          items: data.items,
          total: data.total,
          timestamp: Date.now(),
        };
      } catch (e: unknown) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load(false);
    const id = setInterval(() => load(true), 12000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [filter, debounced, page]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const showIndices = STOCK_FILTERS.has(filter) && !['crypto', 'forex'].includes(filter);

  return (
    <AppShell>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Universe</div>
          <h1 className="font-display text-4xl">Global markets</h1>
          <p className="mt-1 text-sm text-stone-500">{total.toLocaleString()} listed names · USA · Japan · Canada · UK · Europe · India</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-sm px-3 py-1.5 text-[11px] uppercase tracking-widest ${filter === f.id ? 'bg-amber-400 text-[#1a1304]' : 'border border-white/10 text-stone-400'}`}
            >
              {f.label}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search ticker or name"
            className="min-w-[180px] rounded-sm border border-white/10 bg-black/40 px-3 py-1.5 text-sm outline-none"
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {filters.map((f: any) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-sm px-3 py-1.5 text-[11px] uppercase tracking-widest ${filter === f.id ? 'bg-amber-400 text-[#1a1304]' : 'border border-white/10 text-stone-400'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {showIndices && (
        <div className="mt-6">
          <IndexBoard onSelect={(region) => setFilter(regionMapping[region] || region)} compact />
        </div>
      )}
      {loading && <div className="mt-8 h-40 animate-pulse rounded-md bg-white/5" />}
      {error && <div className="mt-4 text-sm text-rose-300">{error}</div>}
      <div className="mt-6 overflow-hidden rounded-md border border-white/5">
        <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-white/[0.02] text-[10px] uppercase tracking-widest text-stone-500">
            <tr>
              <th className="w-[12%] px-5 py-3">Symbol</th>
              <th className="w-[30%] px-3 py-3">Name</th>
              <th className="w-[12%] px-3 py-3">Class</th>
              <th className="w-[12%] px-3 py-3">Last</th>
              <th className="w-[12%] px-3 py-3">24h</th>
              <th className="w-[18%] px-3 py-3">High / Low</th>
              <th className="w-[6%] px-5 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {markets.map((m) => (
              <tr key={m.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                <td className="overflow-hidden px-5 py-3 font-mono text-ellipsis whitespace-nowrap">{m.symbol}</td>
                <td className="overflow-hidden px-3 py-3 text-stone-400 break-words text-ellipsis">{m.name}</td>
                <td className="overflow-hidden px-3 py-3 uppercase text-[11px] text-stone-500 break-words text-ellipsis">{m.asset_class === 'forex' ? 'Forex' : m.asset_class === 'crypto' ? 'Crypto' : m.asset_class === 'etf' ? 'Stocks' : 'Stocks'}</td>
                <td className="overflow-hidden px-3 py-3 font-mono whitespace-nowrap">{formatPrice(Number(m.price))}</td>
                <td className={`overflow-hidden px-3 py-3 font-mono whitespace-nowrap ${Number(m.change_24h) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPct(Number(m.change_24h))}</td>
                <td className="overflow-hidden px-3 py-3 font-mono text-xs text-stone-500 whitespace-nowrap">{formatPrice(Number(m.high_24h))} / {formatPrice(Number(m.low_24h))}</td>
                <td className="px-5 py-3 text-right">
                  <Link to={`/app/trade/${encodeURIComponent(m.symbol)}`} className="inline-flex shrink-0 items-center justify-center rounded-sm border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-400/15">Trade</Link>
                </td>
              </tr>
            ))}
            {!loading && !markets.length && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-stone-500">No matches in this sleeve.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-stone-500">
        <span>
          Showing {total === 0 ? 0 : page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total.toLocaleString()}
        </span>
        <div className="flex gap-2">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-sm border border-white/10 px-3 py-1 disabled:opacity-30">
            Prev
          </button>
          <span className="px-2 py-1">{page + 1} / {pages}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-sm border border-white/10 px-3 py-1 disabled:opacity-30">
            Next
          </button>
        </div>
      </div>
    </AppShell>
  );
}
