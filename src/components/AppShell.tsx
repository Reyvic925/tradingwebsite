import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Bell,
  CandlestickChart,
  LineChart,
  PiggyBank,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Share2,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Logo from './Logo';
import supabase from '../lib/supabase';
import { apiGet, apiSend, bootstrapProfile } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { Notice, Wallet as WalletT } from '../types';

const nav = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/trade', label: 'Trade', icon: CandlestickChart },
  { to: '/app/markets', label: 'Markets', icon: LineChart },
  { to: '/app/invest', label: 'Invest', icon: PiggyBank },
  { to: '/app/wallet', label: 'Wallet', icon: Wallet },
  { to: '/app/social', label: 'Social', icon: Users },
  { to: '/app/referrals', label: 'Referrals', icon: Share2 },
  { to: '/app/history', label: 'History', icon: History },
  { to: '/app/kyc', label: 'KYC', icon: ShieldCheck },
  { to: '/app/profile', label: 'Profile', icon: UserRound },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletT | null>(null);
  const [notes, setNotes] = useState<Notice[]>([]);
  const [showNotes, setShowNotes] = useState(false);

  const load = async () => {
    try {
      const [w, n] = await Promise.all([
        apiGet<WalletT>('/api/wallet').catch(() => null),
        apiGet<Notice[]>('/api/notifications').catch(() => []),
      ]);
      if (w) setWallet(w);
      setNotes(Array.isArray(n) ? n : []);
    } catch {
      /* session may still be warming */
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await bootstrapProfile();
        try {
          await apiGet('/api/user/crypto-addresses');
        } catch {
          /* assignment happens in profile bootstrap; fail-open */
        }
      } catch {
        /* first-login bootstrap */
      }
      if (alive) load();
    })();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const unread = notes.filter((n) => !n.read).length;

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const markAll = async () => {
    await apiSend('/api/notifications', 'PUT', { all: true });
    setNotes((current) => current.map((note) => ({ ...note, read: true })));
  };

  const markRead = async (id: number) => {
    const target = notes.find((note) => note.id === id);
    if (!target || target.read) return;
    await apiSend('/api/notifications', 'PUT', { id });
    setNotes((current) => current.map((note) => note.id === id ? { ...note, read: true } : note));
  };

  return (
    <div className="min-h-screen bg-[#05070b] text-stone-100">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-white/5 bg-[#080b11] transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center justify-between px-5">
          <Logo to="/" compact />
          <button className="lg:hidden" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav className="mt-4 flex max-h-[calc(100vh-10rem)] flex-col gap-0.5 overflow-y-auto px-3 pb-4">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-sm px-3 py-2.5 text-[13px] tracking-wide transition ${
                  isActive ? 'bg-amber-400/10 text-amber-200' : 'text-stone-400 hover:bg-white/3 hover:text-stone-100'
                }`
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-white/5 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Available</div>
          <div className="mt-1 font-mono text-lg text-amber-200">{formatMoney(Number(wallet?.available || 0))}</div>
          <button onClick={signOut} className="mt-3 flex items-center gap-2 text-xs text-stone-500 hover:text-rose-300">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/5 bg-[#05070b]/85 px-4 backdrop-blur">
          <button className="lg:hidden" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <div className="hidden text-xs uppercase tracking-[0.22em] text-stone-500 sm:block">
            Private client terminal
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <div className="text-[10px] uppercase tracking-widest text-stone-500">Equity</div>
              <div className="font-mono text-sm text-stone-100">{formatMoney(Number(wallet?.equity ?? wallet?.available ?? 0))}</div>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotes((v) => !v)}
                aria-expanded={showNotes}
                aria-controls="account-alerts"
                aria-label={unread > 0 ? `Open alerts, ${unread} unread` : 'Open alerts'}
                className="relative grid h-9 w-9 place-items-center rounded-sm border border-white/10 transition hover:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/60"
              >
                <Bell size={16} />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-[#1a1304]">
                    {unread}
                  </span>
                )}
              </button>
              {showNotes && (
                <>
                  <button
                    type="button"
                    aria-label="Close alerts"
                    onClick={() => setShowNotes(false)}
                    className="fixed inset-0 z-40 bg-black/50 sm:hidden"
                  />
                  <section
                    id="account-alerts"
                    aria-label="Account alerts"
                    className="fixed inset-x-3 top-20 z-50 max-h-[calc(100dvh-6rem)] overflow-hidden rounded-md border border-white/10 bg-[#0c1017] shadow-2xl sm:absolute sm:right-0 sm:left-auto sm:top-auto sm:z-50 sm:mt-2 sm:max-h-none sm:w-80"
                  >
                  <div className="flex items-center justify-between border-b border-white/5 px-3 py-3 text-[11px] uppercase tracking-widest text-stone-500">
                    <span>Alerts</span>
                    <div className="flex items-center gap-3">
                      {unread > 0 && <button type="button" onClick={markAll} className="text-amber-300 hover:text-amber-200">Mark all read</button>}
                      <button type="button" onClick={() => setShowNotes(false)} className="text-stone-400 hover:text-stone-100" aria-label="Close alerts"><X size={16} /></button>
                    </div>
                  </div>
                  <div className="max-h-[calc(100dvh-9.5rem)] overflow-auto sm:max-h-80">
                    {notes.length === 0 && <div className="p-4 text-sm text-stone-500">No alerts yet.</div>}
                    {notes.map((n) => (
                      <button
                        type="button"
                        key={n.id}
                        onClick={() => markRead(n.id)}
                        className={`block w-full border-b border-white/5 px-3 py-3 text-left transition hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-amber-300/60 ${n.read ? 'opacity-60' : ''}`}
                        aria-label={n.read ? n.title : `Mark alert as read: ${n.title}`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.read && <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />}
                          <div className={n.read ? '' : 'min-w-0'}>
                            <div className="text-sm text-stone-100">{n.title}</div>
                            <div className="mt-1 text-xs leading-5 text-stone-500">{n.body}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  </section>
                </>
              )}
            </div>
            <Link to="/app/profile" className="flex items-center gap-2 text-sm text-stone-300">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-400/15 text-amber-200">
                {(user?.email || 'A')[0].toUpperCase()}
              </span>
              <span className="hidden md:block max-w-[140px] truncate">{user?.email}</span>
            </Link>
          </div>
        </header>
        <main className="p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
