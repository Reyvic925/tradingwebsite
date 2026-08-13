import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { apiGet, apiList, apiSend, asList } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { Txn, Wallet as WalletT } from '../types';

export default function Wallet() {
  const [wallet, setWallet] = useState<WalletT | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [type, setType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [amount, setAmount] = useState('500');
  const [method, setMethod] = useState('card');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [w, t] = await Promise.all([
        apiGet<WalletT>('/api/wallet').catch(() => null),
        apiList<Txn>('/api/transactions'),
      ]);
      if (w) setWallet(w);
      setTxns(asList(t));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!(amt > 0)) return setError('Enter a valid amount');
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await apiSend('/api/transactions', 'POST', { type, amount: amt, method });
      setMsg(`${type === 'deposit' ? 'Deposit' : 'Withdrawal'} of ${formatMoney(amt)} completed.`);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Treasury</div>
      <h1 className="font-display text-4xl">Wallet</h1>

      {loading && <div className="mt-8 h-32 animate-pulse rounded-md bg-white/5" />}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          { l: 'Available', v: formatMoney(Number(wallet?.available || 0)) },
          { l: 'Reserved / margin', v: formatMoney(Number(wallet?.reserved || 0)) },
          { l: 'Equity', v: formatMoney(Number(wallet?.equity ?? 0)) },
        ].map((c) => (
          <div key={c.l} className="rounded-md border border-white/5 p-5">
            <div className="text-[10px] uppercase tracking-widest text-stone-500">{c.l}</div>
            <div className="mt-2 font-display text-3xl">{c.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <form onSubmit={submit} className="rounded-md border border-white/5 p-5">
          <div className="grid grid-cols-2 gap-1 rounded-sm bg-black/40 p-1">
            <button type="button" onClick={() => { setType('deposit'); setMethod('card'); }} className={`py-2 text-xs uppercase tracking-widest ${type === 'deposit' ? 'bg-amber-400 text-[#1a1304]' : 'text-stone-500'}`}>Deposit</button>
            <button type="button" onClick={() => { setType('withdrawal'); setMethod('bank'); }} className={`py-2 text-xs uppercase tracking-widest ${type === 'withdrawal' ? 'bg-amber-400 text-[#1a1304]' : 'text-stone-500'}`}>Withdraw</button>
          </div>
          <label className="mt-4 block text-[10px] uppercase tracking-widest text-stone-500">Amount USD</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 font-mono outline-none" />
          <label className="mt-4 block text-[10px] uppercase tracking-widest text-stone-500">Rail</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none">
            {type === 'deposit' ? (
              <>
                <option value="card">Visa / Mastercard</option>
                <option value="wire">Bank wire</option>
                <option value="crypto">USDC / USDT</option>
              </>
            ) : (
              <>
                <option value="bank">Bank transfer</option>
                <option value="crypto">Stablecoin wallet</option>
              </>
            )}
          </select>
          {error && <div className="mt-3 text-sm text-rose-300">{error}</div>}
          {msg && <div className="mt-3 text-sm text-emerald-300">{msg}</div>}
          <button disabled={busy} className="mt-5 w-full rounded-sm bg-amber-400 py-2.5 text-xs font-semibold uppercase tracking-widest text-[#1a1304]">
            {busy ? 'Processing…' : type === 'deposit' ? 'Fund account' : 'Request payout'}
          </button>
          <p className="mt-3 text-[11px] text-stone-600">Instant simulation for this demo desk. Minimum deposit $10 · withdrawal $20.</p>
        </form>

        <div className="rounded-md border border-white/5">
          <div className="border-b border-white/5 px-5 py-3 text-xs uppercase tracking-[0.18em] text-stone-500">Cash movements</div>
          <div className="max-h-[420px] divide-y divide-white/5 overflow-auto">
            {txns.filter((t) => t.type === 'deposit' || t.type === 'withdrawal').map((t) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <div className="capitalize">{t.type} · {t.method}</div>
                  <div className="text-[11px] text-stone-500">{t.reference}</div>
                </div>
                <div className={`font-mono ${t.type === 'deposit' ? 'text-emerald-400' : 'text-rose-300'}`}>
                  {t.type === 'deposit' ? '+' : '−'}{formatMoney(Number(t.amount))}
                </div>
              </div>
            ))}
            {!txns.some((t) => t.type === 'deposit' || t.type === 'withdrawal') && (
              <div className="px-5 py-8 text-sm text-stone-500">No cash activity.</div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
