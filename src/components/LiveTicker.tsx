import { useEffect, useState } from 'react';
import type { Market } from '../types';
import { formatPrice } from '../lib/format';

export default function LiveTicker() {
  const [trades, setTrades] = useState<Market[]>([]);

  useEffect(() => {
    let alive = true;
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch('/api/ticker');
        if (!res.ok) {
          // Stop polling on non-OK responses to avoid repeated 404s in the network tab
          console.warn('[ticker] /api/ticker returned', res.status);
          stopped = true;
          return;
        }
        const data = await res.json();
        if (alive && Array.isArray(data)) setTrades(data);
      } catch (err) {
        // On network errors, stop polling after the first failure to avoid spam
        console.warn('[ticker] fetch failed', err);
        stopped = true;
      }
    };
    load();
    const id = setInterval(() => {
      if (stopped) return;
      load();
    }, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const source = trades;
  const row = [...source, ...source];

  return (
    <div className="relative overflow-hidden border-y border-amber-400/15 bg-black/70">
      <div className="absolute left-0 top-0 z-10 flex h-full items-center bg-gradient-to-r from-black via-black/90 to-transparent px-4 pr-10">
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Market quotes
        </span>
      </div>
      <div className="ticker-track flex w-max gap-8 py-2.5 pl-36">
        {row.map((t, i) => (
          <div key={`${t.id}-${i}`} className="flex items-center gap-3 whitespace-nowrap font-mono text-xs">
            <span className="text-stone-100">{t.symbol}</span>
            <span className="text-amber-200/90">{t.price == null ? 'Unavailable' : formatPrice(Number(t.price))}</span>
            <span className="text-stone-500">{t.price_source}{t.quote_stale ? ' ? stale' : ''}{t.quote_updated_at ? ` ? ${new Date(t.quote_updated_at).toLocaleTimeString()}` : ''}</span>
          </div>
        ))}
        {!row.length && (
          <div className="px-8 text-xs text-stone-500">Connecting to the global tape…</div>
        )}
      </div>
    </div>
  );
}
