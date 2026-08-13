import React, { useEffect, useState } from 'react';
import PositionChart from './PositionChart';
import { formatMoney, formatPrice, timeAgo } from '../lib/format';

type Order = any;

export default function OrderDetailModal({ orderId, onClose, onUpdated }: { orderId: number | null; onClose: () => void; onUpdated?: () => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [chart, setChart] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let mounted = true;
    setLoading(true);
    setError('');
    Promise.all([
      fetch(`/api/user/order/${orderId}`).then((r) => r.ok ? r.json() : Promise.reject(r.statusText)),
      fetch(`/api/user/order/${orderId}/chart`).then((r) => r.ok ? r.json() : Promise.resolve([])),
    ])
      .then(([o, c]) => {
        if (!mounted) return;
        setOrder(o);
        setChart(c || []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [orderId]);

  if (!orderId) return null;

  const closePosition = async () => {
    if (!order) return;
    setActionPending(true);
    try {
      const res = await fetch(`/api/user/order/${order.id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setOrder((prev: any) => ({ ...(prev || {}), position: json }));
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(String(err));
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="pointer-events-auto w-full max-w-3xl bg-[#0b0b0b] rounded-t-lg md:rounded-lg p-4 m-4 md:m-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-stone-400">Order #{orderId}</div>
            <h2 className="font-display text-2xl">{order?.symbol || '—'} <span className="text-sm text-stone-400">{order?.side?.toUpperCase()}</span></h2>
            <div className="mt-1 text-sm text-stone-400">{order?.type} · {order?.status}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg">{formatPrice(Number(order?.filled_price || order?.price || 0))}</div>
            <div className="text-sm text-stone-500">{order?.quantity} qty</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="col-span-2">
            <PositionChart orderId={orderId} />
          </div>
          <div className="space-y-3">
            <div className="bg-white/3 rounded-sm p-3">
              <div className="text-xs text-stone-400">Realised P&L</div>
              <div className={`font-mono text-lg ${Number(order?.realized_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatMoney(Number(order?.realized_pnl || 0))}
              </div>
            </div>
            <div className="bg-white/3 rounded-sm p-3">
              <div className="text-xs text-stone-400">Unrealised P&L</div>
              <div className={`font-mono text-lg ${(order?.position && Number(order.position.pnl) >= 0) ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatMoney(Number(order?.position?.pnl || 0))}
              </div>
            </div>
            <div className="bg-white/3 rounded-sm p-3">
              <div className="text-xs text-stone-400">Margin</div>
              <div className="font-mono text-lg">{formatMoney(Number(order?.position?.margin || 0))}</div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs text-stone-400 mb-2">Events</div>
          <div className="space-y-2 max-h-48 overflow-auto">
            {/* Simple timeline: show the order row itself and any related orders (cancels/fills) */}
            <div className="flex items-center justify-between bg-white/3 p-2 rounded-sm">
              <div className="text-sm">Created</div>
              <div className="text-xs text-stone-400">{order?.created_at ? timeAgo(order.created_at) : '-'}</div>
            </div>
            {order?.status === 'filled' && (
              <div className="flex items-center justify-between bg-white/3 p-2 rounded-sm">
                <div className="text-sm">Filled @ {formatPrice(Number(order.filled_price || order.price || 0))}</div>
                <div className="text-xs text-stone-400">{order?.created_at ? timeAgo(order.created_at) : '-'}</div>
              </div>
            )}
            {order?.status === 'cancelled' && (
              <div className="flex items-center justify-between bg-white/3 p-2 rounded-sm">
                <div className="text-sm">Cancelled</div>
                <div className="text-xs text-stone-400">{order?.updated_at ? timeAgo(order.updated_at) : '-'}</div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-rose-300">{error}</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm px-3 py-2 border border-white/10 rounded-sm">Close</button>
            {order?.position && order.position.status === 'open' && (
              <button onClick={closePosition} disabled={actionPending} className="text-sm px-3 py-2 bg-rose-500 rounded-sm">{actionPending ? 'Closing...' : 'Close Position'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
