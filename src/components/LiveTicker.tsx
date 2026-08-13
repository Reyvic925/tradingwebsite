import { useEffect, useState } from 'react';
import type { TickerTrade } from '../types';
import { formatPrice } from '../lib/format';

export default function LiveTicker() {
  const [trades, setTrades] = useState<TickerTrade[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/ticker');
        const data = await res.json();
        if (alive && Array.isArray(data)) setTrades(data);
      } catch {
        /* ignore */
      }
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const fallback: TickerTrade[] = [
    { id: 1, trader_name: 'M. Hale', symbol: 'NVDA', side: 'BUY', quantity: 120, price: 131.05, asset_class: 'stock', created_at: '' },
    { id: 2, trader_name: 'E. Voss', symbol: 'EURUSD', side: 'SELL', quantity: 25000, price: 1.0863, asset_class: 'forex', created_at: '' },
    { id: 3, trader_name: 'K. Nakamura', symbol: 'BTCUSD', side: 'BUY', quantity: 0.42, price: 67380, asset_class: 'crypto', created_at: '' },
    { id: 4, trader_name: 'S. Alvarez', symbol: 'XAUUSD', side: 'BUY', quantity: 12, price: 2347.8, asset_class: 'forex', created_at: '' },
    { id: 5, trader_name: 'J. Okafor', symbol: 'AAPL', side: 'BUY', quantity: 80, price: 228.2, asset_class: 'stock', created_at: '' },
    { id: 6, trader_name: 'P. Mehta', symbol: 'ETHUSD', side: 'SELL', quantity: 4.2, price: 3491.1, asset_class: 'crypto', created_at: '' },
  ];
  const source = trades.length ? trades : fallback;
  const row = [...source, ...source];

  return (
    <div className="relative overflow-hidden border-y border-amber-400/15 bg-black/70">
      <div className="absolute left-0 top-0 z-10 flex h-full items-center bg-gradient-to-r from-black via-black/90 to-transparent px-4 pr-10">
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Live tape
        </span>
      </div>
      <div className="ticker-track flex w-max gap-8 py-2.5 pl-36">
        {row.map((t, i) => (
          <div key={`${t.id}-${i}`} className="flex items-center gap-3 whitespace-nowrap font-mono text-xs">
            <span className="text-stone-400">{t.trader_name}</span>
            <span className={t.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>{t.side}</span>
            <span className="text-stone-100">{t.symbol}</span>
            <span className="text-stone-500">{t.quantity}</span>
            <span className="text-amber-200/90">@{formatPrice(Number(t.price))}</span>
          </div>
        ))}
        {!row.length && (
          <div className="px-8 text-xs text-stone-500">Connecting to the global tape…</div>
        )}
      </div>
    </div>
  );
}
