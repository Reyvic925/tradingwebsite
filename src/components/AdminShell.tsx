import { NavLink, useNavigate } from 'react-router-dom';
import { Activity, LayoutDashboard, LogOut, ShieldCheck, Wallet, Users, FileCheck2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import supabase from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const nav = [
  { to: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/health', label: 'Health', icon: Activity },
  { to: '/app/admin/users', label: 'All Users', icon: Users },
  { to: '/app/admin/crypto-keys', label: 'Crypto Keys', icon: Wallet },
  { to: '/app/admin/kyc', label: 'KYC', icon: FileCheck2 },
  { to: '/app/admin/deposits', label: 'Deposits', icon: ArrowUpRight },
  { to: '/app/admin/withdrawals', label: 'Withdrawals', icon: ArrowDownLeft },
];

export default function AdminShell({ children, title }: { children: React.ReactNode; title: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-[#05070b] text-stone-100">
      <div className="mx-auto flex min-h-screen max-w-7xl px-4 py-6 lg:px-8">
        <aside className="hidden w-72 shrink-0 rounded-md border border-white/10 bg-[#0a0f17] p-4 lg:block">
          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-amber-400/15 text-amber-300">
              <ShieldCheck size={18} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-amber-300/80">The Prime Markets</div>
              <div className="font-display text-xl">Admin</div>
            </div>
          </div>

          <nav className="mt-5 space-y-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm ${isActive ? 'bg-amber-400/10 text-amber-200' : 'text-stone-400 hover:bg-white/5 hover:text-stone-100'}`
                }
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-8 rounded-md border border-amber-400/20 bg-amber-400/5 p-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">Signed in</div>
            <div className="mt-2 truncate text-sm text-stone-200">{user?.email || 'admin'}</div>
          </div>

          <button onClick={signOut} className="mt-6 flex w-full items-center justify-center gap-2 rounded-sm border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-stone-300">
            <LogOut size={14} /> Sign out
          </button>
        </aside>

        <div className="flex-1">
          <header className="mb-6 flex items-center justify-between rounded-md border border-white/10 bg-[#0a0f17] px-4 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Control room</div>
              <h1 className="mt-1 font-display text-3xl">{title}</h1>
            </div>
            <button onClick={signOut} className="inline-flex items-center gap-2 rounded-sm border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-stone-300 lg:hidden">
              <LogOut size={14} /> Sign out
            </button>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}
