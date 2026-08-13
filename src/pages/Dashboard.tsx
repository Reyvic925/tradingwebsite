import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { apiGet, apiList, asList, bootstrapProfile } from '../lib/api';
import { formatMoney, formatPct, formatPrice } from '../lib/format';
import type { Investment, Market, Position, Profile, Txn, Wallet } from '../types';

export default function Dashboard() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (bootstrap = false) => {
    try {
      if (bootstrap) {
        const prof = await bootstrapProfile();
        if (prof.profile) setProfile(prof.profile as Profile);
        if (prof.wallet) setWallet(prof.wallet as Wallet);
      }
      const [w, pos, mkt, tx, inv] = await Promise.all([
        apiGet<Wallet>('/api/wallet').catch(() => null),
        apiList<Position>('/api/positions'),
        apiList<Market>('/api/markets?featured=1&limit=12&tick=1'),
        apiList<Txn>('/api/transactions'),
        apiList<Investment>('/api/investments'),
      ]);
      if (w && !('error' in (w as object))) setWallet(w);
      setPositions(asList(pos));
      setMarkets(asList(mkt));
      setTxns(asList<Txn>(tx).slice(0, 6));
      setInvestments(asList(inv));
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load desk');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(false), 10000);
    return () => clearInterval(id);
  }, []);

  const pnl = positions.reduce((s, p) => s + Number(p.pnl || 0), 0);

  return (
    <AppShell>
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Overview</div>
          <h1 className="font-display text-4xl">Good session, {profile?.full_name || 'trader'}.</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/app/trade" className="rounded-sm bg-amber-400 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#1a1304]">
            Trade now
          </Link>
          <Link to="/app/wallet" className="rounded-sm border border-white/15 px-4 py-2 text-xs uppercase tracking-widest">
            Deposit
          </Link>
        </div>
      </div>

      {loading && (
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-md bg-white/5" />
          ))}
        </div>
      )}
      {error && <div className="mt-6 rounded-sm border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Equity', value: formatMoney(Number(wallet?.equity ?? wallet?.available ?? 0)) },
          { label: 'Available', value: formatMoney(Number(wallet?.available || 0)) },
          { label: 'Open P&L', value: formatMoney(pnl), tone: pnl >= 0 ? 'text-emerald-400' : 'text-rose-400' },
          { label: 'Active plans', value: String(investments.filter((i) => i.status === 'active').length) },
        ].map((c) => (
          <div key={c.label} className="rounded-md border border-white/5 bg-white/[0.02] p-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{c.label}</div>
            <div className={`mt-2 font-display text-3xl ${c.tone || 'text-stone-50'}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-md border border-white/5">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <h2 className="text-sm uppercase tracking-[0.16em] text-stone-400">Open positions</h2>
            <Link to="/app/trade" className="text-xs text-amber-300">Desk →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-stone-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Symbol</th>
                  <th className="px-3 py-2 font-medium">Side</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Entry</th>
                  <th className="px-3 py-2 font-medium">Mark</th>
                  <th className="px-5 py-2 font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-stone-500">No open risk. Open a ticket on the desk.</td>
                  </tr>
                )}
                {positions.map((p) => (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="px-5 py-3 font-mono">{p.symbol}</td>
                    <td className={`px-3 py-3 uppercase ${p.side === 'long' || p.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>{p.side}</td>
                    <td className="px-3 py-3 font-mono">{p.quantity}</td>
                    <td className="px-3 py-3 font-mono">{formatPrice(Number(p.entry_price))}</td>
                    <td className="px-3 py-3 font-mono">{formatPrice(Number(p.current_price))}</td>
                    <td className={`px-5 py-3 font-mono ${Number(p.pnl) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatMoney(Number(p.pnl))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-md border border-white/5">
          <div className="border-b border-white/5 px-5 py-3 text-sm uppercase tracking-[0.16em] text-stone-400">Tape movers</div>
          <div className="divide-y divide-white/5">
            {markets.slice(0, 7).map((m) => (
              <Link key={m.id} to={`/app/trade/${encodeURIComponent(m.symbol)}`} className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.03]">
                <div>
                  <div className="font-mono text-sm">{m.symbol}</div>
                  <div className="text-[11px] text-stone-500">{m.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">{formatPrice(Number(m.price))}</div>
                  <div className={`text-[11px] ${Number(m.change_24h) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPct(Number(m.change_24h))}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-white/5">
        <div className="border-b border-white/5 px-5 py-3 text-sm uppercase tracking-[0.16em] text-stone-400">Recent ledger</div>
        <div className="divide-y divide-white/5">
          {txns.length === 0 && <div className="px-5 py-6 text-sm text-stone-500">No movements yet.</div>}
          {txns.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <div className="capitalize">{t.type.replace('_', ' ')}</div>
                <div className="text-[11px] text-stone-500">{t.reference} · {t.method}</div>
              </div>
              <div className={`font-mono ${t.type === 'withdrawal' || t.type === 'investment' ? 'text-rose-300' : 'text-emerald-300'}`}>
                {t.type === 'withdrawal' || t.type === 'investment' ? '−' : '+'}{formatMoney(Number(t.amount))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
