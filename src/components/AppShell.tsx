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
  { to: '/app/gains-losses', label: 'Gains/Losses', icon: LineChart },
  { to: '/app/admin/crypto-keys', label: 'Admin Crypto Keys', icon: Wallet },
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
    const id = setInterval(load, 12000);
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
    load();
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
              <button onClick={() => setShowNotes((v) => !v)} className="relative grid h-9 w-9 place-items-center rounded-sm border border-white/10">
                <Bell size={16} />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-[#1a1304]">
                    {unread}
                  </span>
                )}
              </button>
              {showNotes && (
                <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-md border border-white/10 bg-[#0c1017] shadow-2xl">
                  <div className="flex items-center justify-between border-b border-white/5 px-3 py-2 text-[11px] uppercase tracking-widest text-stone-500">
                    Alerts
                    <button onClick={markAll} className="text-amber-300">Mark read</button>
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {notes.length === 0 && <div className="p-4 text-sm text-stone-500">No alerts yet.</div>}
                    {notes.map((n) => (
                      <div key={n.id} className={`border-b border-white/5 px-3 py-3 ${n.read ? 'opacity-60' : ''}`}>
                        <div className="text-sm text-stone-100">{n.title}</div>
                        <div className="mt-1 text-xs text-stone-500">{n.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
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
