import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import OrderDetailModal from '../components/OrderDetailModal';
import { apiList, asList } from '../lib/api';
import { formatMoney, formatPrice, timeAgo } from '../lib/format';
import type { Order, Position, Txn } from '../types';

export default function History() {
  const [tab, setTab] = useState<'ledger' | 'orders' | 'closed'>('ledger');
  const [txns, setTxns] = useState<Txn[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [closed, setClosed] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);

  const reload = () => {
    setLoading(true);
    setError('');
    Promise.all([
      apiList<Txn>('/api/transactions'),
      apiList<Order>('/api/orders'),
      apiList<Position>('/api/positions?status=all'),
    ])
      .then(([t, o, p]) => {
        setTxns(asList(t));
        setOrders(asList(o));
        setClosed(asList<Position>(p).filter((x) => x.status === 'closed'));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load history'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  return (
    <AppShell>
      <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Audit</div>
      <h1 className="font-display text-4xl">History</h1>
      <div className="mt-6 flex gap-2">
        {(['ledger', 'orders', 'closed'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-sm px-3 py-1.5 text-[11px] uppercase tracking-widest ${tab === t ? 'bg-amber-400 text-[#1a1304]' : 'border border-white/10 text-stone-400'}`}>{t}</button>
        ))}
      </div>
      {loading && <div className="mt-8 h-40 animate-pulse rounded-md bg-white/5" />}
      {error && <div className="mt-4 text-sm text-rose-300">{error}</div>}

      {tab === 'ledger' && (
        <div className="mt-6 overflow-hidden rounded-md border border-white/5">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-stone-500">
              <tr>
                <th className="px-5 py-3">Type</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-3 py-3">Method</th>
                <th className="px-3 py-3">Ref</th>
                <th className="px-5 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} className="border-t border-white/5">
                  <td className="px-5 py-3 capitalize">{t.type.replace('_', ' ')}</td>
                  <td className="px-3 py-3 font-mono">{formatMoney(Number(t.amount))}</td>
                  <td className="px-3 py-3 text-stone-400">{t.method}</td>
                  <td className="px-3 py-3 font-mono text-xs text-stone-500">{t.reference}</td>
                  <td className="px-5 py-3 text-stone-500">{t.created_at ? timeAgo(t.created_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'orders' && (
        <div className="mt-6 overflow-hidden rounded-md border border-white/5">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-stone-500">
              <tr>
                <th className="px-5 py-3">Symbol</th>
                <th className="px-3 py-3">Side</th>
                <th className="px-3 py-3">Qty</th>
                <th className="px-3 py-3">Price</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-white/5 hover:bg-white/2 cursor-pointer" onClick={() => setSelectedOrder(o.id)}>
                  <td className="px-5 py-3 font-mono">{o.symbol}</td>
                  <td className="px-3 py-3 uppercase">{o.side}</td>
                  <td className="px-3 py-3 font-mono">{o.quantity}</td>
                  <td className="px-3 py-3 font-mono">{formatPrice(Number(o.filled_price || o.price))}</td>
                  <td className="px-5 py-3 capitalize">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'closed' && (
        <div className="mt-6 overflow-hidden rounded-md border border-white/5">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-stone-500">
              <tr>
                <th className="px-5 py-3">Symbol</th>
                <th className="px-3 py-3">Side</th>
                <th className="px-3 py-3">Entry / Exit</th>
                <th className="px-5 py-3">P&L</th>
              </tr>
            </thead>
            <tbody>
              {closed.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="px-5 py-3 font-mono">{p.symbol}</td>
                  <td className="px-3 py-3 uppercase">{p.side}</td>
                  <td className="px-3 py-3 font-mono text-xs">{formatPrice(Number(p.entry_price))} → {formatPrice(Number(p.current_price))}</td>
                  <td className={`px-5 py-3 font-mono ${Number(p.pnl) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatMoney(Number(p.pnl))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedOrder && (
        <OrderDetailModal orderId={selectedOrder} onClose={() => setSelectedOrder(null)} onUpdated={() => reload()} />
      )}
    </AppShell>
  );
}
