import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { apiList, apiSend, asList } from '../lib/api';
import { formatMoney, formatPct } from '../lib/format';
import type { CopyTrade, Trader } from '../types';

export default function Social() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [copies, setCopies] = useState<CopyTrade[]>([]);
  const [alloc, setAlloc] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [t, c] = await Promise.all([apiList<Trader>('/api/traders'), apiList<CopyTrade>('/api/copy-trades')]);
      setTraders(asList(t));
      setCopies(asList(c));
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const follow = async (t: Trader) => {
    const amt = Number(alloc[t.id] || 250);
    try {
      await apiSend('/api/copy-trades', 'POST', { trader_id: t.id, allocated: amt });
      setMsg(`Now copying ${t.name}`);
      load();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Unable to allocate');
    }
  };

  const stop = async (id: number) => {
    await apiSend('/api/copy-trades', 'DELETE', { id });
    load();
  };

  return (
    <AppShell>
      <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Copy desk</div>
      <h1 className="font-display text-4xl">Social trading</h1>
      <p className="mt-2 max-w-xl text-sm text-stone-400">Allocate capital to lead traders using a risk-managed copy allocation. Strategy metrics are illustrative and never guaranteed; all trading remains subject to market risk.</p>
      {msg && <div className="mt-4 text-sm text-amber-200">{msg}</div>}
      {loading && <div className="mt-8 h-40 animate-pulse rounded-md bg-white/5" />}

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {traders.map((t) => (
          <article key={t.id} className="rounded-md border border-white/8 bg-white/[0.02] p-5">
            <div className="flex items-center gap-3">
              <img src={t.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
              <div>
                <div className="text-stone-50">{t.name}</div>
                <div className="text-[11px] uppercase tracking-widest text-stone-500">{t.country} · {t.specialty}</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-stone-400">{t.bio}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="font-mono text-emerald-400">{formatPct(Number(t.monthly_return))}</div>
                <div className="text-stone-600">30d</div>
              </div>
              <div>
                <div className="font-mono">{t.win_rate}%</div>
                <div className="text-stone-600">Win</div>
              </div>
              <div>
                <div className="font-mono">{t.followers}</div>
                <div className="text-stone-600">Followers</div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <input
                value={alloc[t.id] ?? '250'}
                onChange={(e) => setAlloc((s) => ({ ...s, [t.id]: e.target.value }))}
                className="flex-1 rounded-sm border border-white/10 bg-black/40 px-2 py-2 font-mono text-sm outline-none"
              />
              <button onClick={() => follow(t)} className="rounded-sm bg-amber-400 px-3 text-xs font-semibold uppercase tracking-widest text-[#1a1304]">Copy</button>
            </div>
          </article>
        ))}
      </div>

      <h2 className="mt-12 text-sm uppercase tracking-[0.18em] text-stone-400">Your copies</h2>
      <div className="mt-2 text-xs text-stone-500">Performance and win-rate figures are for reference only and should not be interpreted as a promise of returns.</div>
      <div className="mt-4 divide-y divide-white/5 rounded-md border border-white/5">
        {copies.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
            <div>
              <div>{c.trader_name}</div>
              <div className="text-[11px] text-stone-500">{formatMoney(Number(c.allocated))} allocated · {c.status}</div>
            </div>
            {c.status === 'active' && (
              <button onClick={() => stop(c.id)} className="text-xs text-rose-300">Stop</button>
            )}
          </div>
        ))}
        {!copies.length && <div className="px-5 py-8 text-sm text-stone-500">You are not copying anyone yet.</div>}
      </div>
    </AppShell>
  );
}
