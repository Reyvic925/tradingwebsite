import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { startVisibleInterval } from '../lib/visible-interval';
import { formatMoney, formatPrice } from '../lib/format';

type Entry = { id: string; kind: string; trader_name: string; symbol?: string; side?: string; quantity?: number;
  entry_price?: number; exit_price?: number; gross_pnl: number; fees: number; net_pnl: number; trade_pnl?: number | null; value_after: number; reason: string; created_at: string };

export default function CopyActivity({ followId }: { followId?: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setEntries([]);
    setLoading(true);
    const stop = startVisibleInterval(async () => {
      try {
        const data = await apiGet<Entry[]>(`/api/copy-activity${followId ? `?followId=${encodeURIComponent(followId)}` : ''}`);
        if (active) { setEntries(data); setError(''); }
      } catch (error) { if (active) setError(error instanceof Error ? error.message : 'Unable to load activity'); }
      finally { if (active) setLoading(false); }
    }, 30000);
    return () => { active = false; stop(); };
  }, [followId]);
  return <section className="mt-6 rounded-lg border border-white/10 p-4">
    <h2 className="text-lg font-semibold">Copy activity</h2>
    <p className="mt-1 text-xs text-gray-400">Entries, position valuations, exits, execution fees and performance fees. Most recent 200 events.</p>
    {error && <p role="alert" className="mt-3 text-rose-300">{error}</p>}
    {loading && <p className="mt-3 text-gray-400">Loading activity…</p>}
    {!loading && !error && !entries.length && <p className="mt-3 text-gray-400">No copy activity yet.</p>}
    <div className="mt-3 max-h-96 overflow-auto divide-y divide-white/10">
      {entries.map(entry => <article key={entry.id} className="py-3 text-xs">
        <div className="flex flex-wrap justify-between gap-2"><strong>{entry.trader_name} · {entry.kind}</strong><time>{new Date(entry.created_at).toLocaleString()}</time></div>
        {entry.symbol && <p className="mt-2">{entry.side} {Number(entry.quantity).toFixed(6)} {entry.symbol} · Entry {formatPrice(Number(entry.entry_price))} · Mark / exit {formatPrice(Number(entry.exit_price))}</p>}
        <p className="mt-2 text-gray-400">{entry.reason.replaceAll('_', ' ')} · Gross change {formatMoney(entry.gross_pnl)} · Fees {formatMoney(entry.fees)}</p>
        <p className={`mt-1 ${entry.net_pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>Net change {formatMoney(entry.net_pnl)} · Copy value {formatMoney(entry.value_after)}</p>
        {entry.trade_pnl != null && <p className={`mt-1 ${entry.trade_pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>Realized trade P&amp;L after fees: {formatMoney(entry.trade_pnl)}</p>}
      </article>)}
    </div>
  </section>;
}
