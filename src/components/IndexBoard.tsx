import { useEffect, useState } from 'react';
import { formatPct } from '../lib/format';

export type MarketIndex = {
  id?: number;
  code: string;
  name: string;
  country: string;
  region: string;
  ytd_low: number;
  ytd_high: number;
  note?: string;
};

const FALLBACK: MarketIndex[] = [
  { code: 'NKY', name: 'Nikkei 225', country: 'Japan', region: 'jp', ytd_low: 28, ytd_high: 33 },
  { code: 'SPX', name: 'S&P 500', country: 'United States', region: 'us', ytd_low: 9.4, ytd_high: 13.3 },
  { code: 'TSX', name: 'S&P/TSX Composite', country: 'Canada', region: 'ca', ytd_low: 15, ytd_high: 15 },
  { code: 'UKX', name: 'FTSE 100', country: 'United Kingdom', region: 'uk', ytd_low: 9.4, ytd_high: 9.4 },
  { code: 'SXXP', name: 'STOXX Europe 600', country: 'Europe', region: 'eu', ytd_low: 9.5, ytd_high: 9.5 },
  { code: 'DAX', name: 'DAX', country: 'Germany', region: 'de', ytd_low: 20, ytd_high: 20 },
  { code: 'CAC', name: 'CAC 40', country: 'France', region: 'fr', ytd_low: 3.86, ytd_high: 3.86 },
  { code: 'NIFTY', name: 'Nifty 50', country: 'India', region: 'in', ytd_low: -6.7, ytd_high: -6.7 },
];

function ytdLabel(i: MarketIndex) {
  const lo = Number(i.ytd_low);
  const hi = Number(i.ytd_high);
  if (Math.abs(lo - hi) < 0.05) return formatPct(hi, hi % 1 === 0 ? 0 : 1);
  return `${formatPct(lo, 1)} ~ ${formatPct(hi, 1)}`;
}

export default function IndexBoard({
  onSelect,
  compact = false,
}: {
  onSelect?: (region: string) => void;
  compact?: boolean;
}) {
  const [rows, setRows] = useState<MarketIndex[]>(FALLBACK);

  useEffect(() => {
    let alive = true;
    fetch('/api/indices')
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d) && d.length) setRows(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className={`grid gap-3 ${compact ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
      {rows.map((i) => {
        const up = Number(i.ytd_high) >= 0;
        const body = (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{i.country}</div>
                <div className="mt-1 font-display text-xl text-stone-50">{i.name}</div>
              </div>
              <span className="font-mono text-[10px] text-stone-600">{i.code}</span>
            </div>
            <div className={`mt-3 font-mono text-lg ${up ? 'text-emerald-400' : 'text-rose-400'}`}>{ytdLabel(i)}</div>
            <div className="text-[10px] uppercase tracking-widest text-stone-600">YTD</div>
          </>
        );
        if (onSelect) {
          return (
            <button
              key={i.code}
              type="button"
              onClick={() => onSelect(i.region)}
              className="rounded-md border border-white/8 bg-white/[0.02] p-4 text-left transition hover:border-amber-300/30"
            >
              {body}
            </button>
          );
        }
        return (
          <div key={i.code} className="rounded-md border border-white/8 bg-white/[0.02] p-4">
            {body}
          </div>
        );
      })}
    </div>
  );
}
