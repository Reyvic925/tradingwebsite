import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Star } from 'lucide-react';
import AppShell from '../components/AppShell';
import PriceChart from '../components/PriceChart';
import { apiGet, apiList, apiMarkets, apiSend, asList } from '../lib/api';
import { formatMoney, formatPct, formatPrice } from '../lib/format';
import type { Market, Order, Position, Wallet } from '../types';

export default function Trade() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [watch, setWatch] = useState<{ id: number; market_id: number; symbol: string }[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [filter, setFilter] = useState<'all' | 'stock' | 'forex' | 'crypto' | 'futures'>('all');
  const [search, setSearch] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [otype, setOtype] = useState<'market' | 'limit'>('market');
  const [qty, setQty] = useState('1');
  const [limit, setLimit] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const selected = useMemo(() => {
    if (!markets.length) return null;
    return markets.find((m) => m.symbol === symbol) || markets[0];
  }, [markets, symbol]);

  const load = async () => {
    try {
      const [m, p, o, w, wl, focused] = await Promise.all([
        apiMarkets<Market>({ class: filter, q: search || undefined, limit: 80, tick: 1 }),
        apiList<Position>('/api/positions'),
        apiList<Order>('/api/orders'),
        apiGet<Wallet>('/api/wallet').catch(() => null),
        apiList<{ id: number; market_id: number; symbol: string }>('/api/watchlist'),
        symbol ? apiMarkets<Market>({ symbol, limit: 1 }) : Promise.resolve({ items: [] as Market[] }),
      ]);
      const merged = [...m.items];
      focused.items.forEach((row) => {
        if (!merged.some((x) => x.id === row.id)) merged.unshift(row);
      });
      setMarkets(merged);
      setPositions(asList(p));
      setOrders(asList(o));
      if (w) setWallet(w);
      setWatch(asList(wl));
      setErr('');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Desk unavailable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [filter, search, symbol]);

  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'stock', label: 'Stocks' },
    { id: 'forex', label: 'Forex' },
    { id: 'crypto', label: 'Crypto' },
    { id: 'futures', label: 'Futures' },
  ] as const;

  const list = markets;
  const watched = (id: number) => watch.some((w) => w.market_id === id);

  const toggleWatch = async (m: Market) => {
    if (watched(m.id)) await apiSend('/api/watchlist', 'DELETE', { market_id: m.id });
    else await apiSend('/api/watchlist', 'POST', { market_id: m.id, symbol: m.symbol });
    load();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const q = Number(qty);
    if (!(q > 0)) return setMsg('Enter a valid quantity');
    setBusy(true);
    setMsg('');
    try {
      await apiSend('/api/orders', 'POST', {
        market_id: selected.id,
        side,
        type: otype,
        quantity: q,
        price: otype === 'limit' ? Number(limit) : undefined,
        stop_loss: sl ? Number(sl) : null,
        take_profit: tp ? Number(tp) : null,
      });
      setMsg(`${side.toUpperCase()} ${selected.symbol} accepted`);
      setQty('1');
      load();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Order rejected');
    } finally {
      setBusy(false);
    }
  };

  const closePos = async (id: number) => {
    await apiSend('/api/positions', 'DELETE', { id });
    load();
  };

  const updateRisk = async (id: number, stop_loss: string, take_profit: string) => {
    await apiSend('/api/positions', 'PUT', { id, stop_loss, take_profit });
    load();
  };

  const cancelOrder = async (id: number) => {
    await apiSend('/api/orders', 'DELETE', { id });
    load();
  };

  const book = useMemo(() => {
    if (!selected) return { bids: [], asks: [] };
    const mid = Number(selected.price);
    const asks = Array.from({ length: 8 }, (_, i) => {
      const p = mid * (1 + (i + 1) * 0.00035);
      return { p, q: Math.round((80 - i * 7) * (1 + (i % 3) * 0.4)) };
    });
    const bids = Array.from({ length: 8 }, (_, i) => {
      const p = mid * (1 - (i + 1) * 0.00035);
      return { p, q: Math.round((76 - i * 6) * (1 + (i % 4) * 0.35)) };
    });
    return { bids, asks };
  }, [selected]);

  return (
    <AppShell>
      <div className="grid gap-4 xl:grid-cols-[260px_1fr_320px]">
        <aside className="rounded-md border border-white/5 bg-[#080b11]">
          <div className="flex gap-1 overflow-x-auto border-b border-white/5 p-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`shrink-0 rounded-sm px-2 py-1.5 text-[10px] uppercase tracking-widest ${filter === f.id ? 'bg-amber-400/15 text-amber-200' : 'text-stone-500'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="border-b border-white/5 p-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find AAPL, SPY…"
              className="w-full rounded-sm border border-white/10 bg-black/40 px-2 py-1.5 text-xs outline-none"
            />
          </div>
          <div className="max-h-[72vh] overflow-auto">
            {loading && <div className="p-4 text-sm text-stone-500">Loading books…</div>}
            {list.map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(`/app/trade/${encodeURIComponent(m.symbol)}`)}
                className={`flex w-full items-center justify-between border-b border-white/5 px-3 py-2.5 text-left hover:bg-white/[0.03] ${selected?.id === m.id ? 'bg-amber-400/8' : ''}`}
              >
                <div>
                  <div className="flex items-center gap-1.5 font-mono text-sm">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWatch(m);
                      }}
                      className={watched(m.id) ? 'text-amber-300' : 'text-stone-600'}
                    >
                      <Star size={12} fill={watched(m.id) ? 'currentColor' : 'none'} />
                    </span>
                    {m.symbol}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-stone-600">{m.asset_class === 'forex' ? 'Forex' : m.asset_class === 'crypto' ? 'Crypto' : m.asset_class === 'futures' ? 'Futures' : m.asset_class === 'jp' || m.asset_class === 'jp-etf' || m.asset_class === 'ca' || m.asset_class === 'ca-etf' || m.asset_class === 'uk' || m.asset_class === 'uk-etf' || m.asset_class === 'eu' || m.asset_class === 'eu-etf' || m.asset_class === 'de' || m.asset_class === 'de-etf' || m.asset_class === 'fr' || m.asset_class === 'fr-etf' || m.asset_class === 'in' || m.asset_class === 'in-etf' ? 'Stocks' : 'Stocks'}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs">{formatPrice(Number(m.price))}</div>
                  <div className={`text-[10px] ${Number(m.change_24h) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPct(Number(m.change_24h))}</div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-4">
          {err && <div className="rounded-sm border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{err}</div>}
          {selected && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{selected.name}</div>
                  <div className="font-display text-4xl">{selected.symbol}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-3xl">{formatPrice(Number(selected.price))}</div>
                  <div className={Number(selected.change_24h) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatPct(Number(selected.change_24h))} 24h</div>
                </div>
              </div>
              <div className="h-72 rounded-md border border-white/5 bg-[#080b11] p-2 md:h-96">
                <PriceChart symbol={selected.symbol} price={Number(selected.price)} change={Number(selected.change_24h)} />
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-sm border border-white/5 p-3">
                  <div className="text-stone-500">24h high</div>
                  <div className="mt-1 font-mono">{formatPrice(Number(selected.high_24h))}</div>
                </div>
                <div className="rounded-sm border border-white/5 p-3">
                  <div className="text-stone-500">24h low</div>
                  <div className="mt-1 font-mono">{formatPrice(Number(selected.low_24h))}</div>
                </div>
                <div className="rounded-sm border border-white/5 p-3">
                  <div className="text-stone-500">Volume</div>
                  <div className="mt-1 font-mono">{Number(selected.volume).toLocaleString()}</div>
                </div>
              </div>
            </>
          )}

          <div className="rounded-md border border-white/5">
            <div className="border-b border-white/5 px-4 py-3 text-xs uppercase tracking-[0.18em] text-stone-500">Positions</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-stone-500">
                  <tr>
                    <th className="px-4 py-2">Symbol</th>
                    <th className="px-3 py-2">Side</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">P&L</th>
                    <th className="px-3 py-2">SL / TP</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id} className="border-t border-white/5">
                      <td className="px-4 py-2 font-mono">{p.symbol}</td>
                      <td className={`px-3 py-2 uppercase ${p.side === 'long' || p.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>{p.side}</td>
                      <td className="px-3 py-2 font-mono">{p.quantity}</td>
                      <td className={`px-3 py-2 font-mono ${Number(p.pnl) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatMoney(Number(p.pnl))}</td>
                      <td className="px-3 py-2">
                        <RiskInline pos={p} onSave={updateRisk} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => closePos(p.id)} className="text-xs text-rose-300 hover:text-rose-200">Close</button>
                      </td>
                    </tr>
                  ))}
                  {!positions.length && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-stone-500">Flat book.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <form onSubmit={submit} className="rounded-md border border-white/5 bg-[#080b11] p-4">
            <div className="grid grid-cols-2 gap-1 rounded-sm bg-black/40 p-1">
              <button type="button" onClick={() => setSide('buy')} className={`py-2 text-xs uppercase tracking-widest ${side === 'buy' ? 'bg-emerald-500 text-black' : 'text-stone-400'}`}>Buy / Long</button>
              <button type="button" onClick={() => setSide('sell')} className={`py-2 text-xs uppercase tracking-widest ${side === 'sell' ? 'bg-rose-500 text-black' : 'text-stone-400'}`}>Sell / Short</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 text-[11px]">
              <button type="button" onClick={() => setOtype('market')} className={`rounded-sm border px-2 py-1 ${otype === 'market' ? 'border-amber-300/40 text-amber-200' : 'border-white/10 text-stone-500'}`}>Market</button>
              <button type="button" onClick={() => setOtype('limit')} className={`rounded-sm border px-2 py-1 ${otype === 'limit' ? 'border-amber-300/40 text-amber-200' : 'border-white/10 text-stone-500'}`}>Limit</button>
            </div>
            <label className="mt-4 block text-[10px] uppercase tracking-widest text-stone-500">Quantity</label>
            <input value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1 w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm outline-none" />
            {otype === 'limit' && (
              <>
                <label className="mt-3 block text-[10px] uppercase tracking-widest text-stone-500">Limit price</label>
                <input value={limit} onChange={(e) => setLimit(e.target.value)} className="mt-1 w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm outline-none" />
              </>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-stone-500">Stop loss</label>
                <input value={sl} onChange={(e) => setSl(e.target.value)} className="mt-1 w-full rounded-sm border border-white/10 bg-black/40 px-2 py-2 font-mono text-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-stone-500">Take profit</label>
                <input value={tp} onChange={(e) => setTp(e.target.value)} className="mt-1 w-full rounded-sm border border-white/10 bg-black/40 px-2 py-2 font-mono text-sm outline-none" />
              </div>
            </div>
            <div className="mt-3 text-[11px] text-stone-500">
              Buying power {formatMoney(Number(wallet?.available || 0))} · 10× leverage · 10% margin
            </div>
            {msg && <div className="mt-2 text-xs text-amber-200">{msg}</div>}
            <button disabled={busy} className={`mt-4 w-full rounded-sm py-2.5 text-xs font-semibold uppercase tracking-[0.18em] ${side === 'buy' ? 'bg-emerald-500 text-black' : 'bg-rose-500 text-black'}`}>
              {busy ? 'Routing…' : `${side} ${selected?.symbol || ''}`}
            </button>
          </form>

          <div className="rounded-md border border-white/5 bg-[#080b11] p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Order book</div>
            <div className="mt-3 space-y-1 font-mono text-[11px]">
              {[...book.asks].reverse().map((r) => (
                <div key={'a' + r.p} className="grid grid-cols-2 text-rose-300">
                  <span>{formatPrice(r.p)}</span>
                  <span className="text-right text-stone-400">{r.q}</span>
                </div>
              ))}
              <div className="py-1 text-center text-sm text-amber-200">{selected ? formatPrice(Number(selected.price)) : '—'}</div>
              {book.bids.map((r) => (
                <div key={'b' + r.p} className="grid grid-cols-2 text-emerald-300">
                  <span>{formatPrice(r.p)}</span>
                  <span className="text-right text-stone-400">{r.q}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-white/5 bg-[#080b11] p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Working orders</div>
            <div className="mt-2 space-y-2">
              {orders.filter((o) => o.status === 'pending').map((o) => (
                <div key={o.id} className="flex items-center justify-between text-xs">
                  <span className="font-mono">{o.side.toUpperCase()} {o.symbol} @ {formatPrice(Number(o.price))}</span>
                  <button onClick={() => cancelOrder(o.id)} className="text-rose-300">Cancel</button>
                </div>
              ))}
              {!orders.some((o) => o.status === 'pending') && <div className="text-xs text-stone-600">No resting tickets.</div>}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function RiskInline({ pos, onSave }: { pos: Position; onSave: (id: number, sl: string, tp: string) => void }) {
  const [sl, setSl] = useState(pos.stop_loss != null ? String(pos.stop_loss) : '');
  const [tp, setTp] = useState(pos.take_profit != null ? String(pos.take_profit) : '');
  return (
    <div className="flex items-center gap-1">
      <input value={sl} onChange={(e) => setSl(e.target.value)} className="w-16 rounded-sm border border-white/10 bg-black/40 px-1 py-0.5 font-mono text-[11px]" placeholder="SL" />
      <input value={tp} onChange={(e) => setTp(e.target.value)} className="w-16 rounded-sm border border-white/10 bg-black/40 px-1 py-0.5 font-mono text-[11px]" placeholder="TP" />
      <button type="button" onClick={() => onSave(pos.id, sl, tp)} className="text-[10px] text-amber-300">Set</button>
    </div>
  );
}
