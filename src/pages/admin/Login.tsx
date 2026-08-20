import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import supabase from '../../lib/supabase';
import { apiGet } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminLogin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!user) return;
    let live = true;
    (async () => {
      try {
        setChecking(true);
        const data = await apiGet<{ profile?: { role?: string }; role?: string }>('/api/profile');
        const profile = (data as { profile?: { role?: string } } | undefined)?.profile ?? data;
        const role = String(profile?.role || '').toLowerCase();
        const isAdmin = role === 'admin' || (user.user_metadata as Record<string, unknown> | undefined)?.is_admin === true;
        if (live && isAdmin) navigate('/admin/dashboard', { replace: true });
      } catch {
        // non-admin or profile not ready yet
      } finally {
        if (live) setChecking(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [user, navigate]);

  if (loading || checking) {
    return (
      <div className="min-h-screen bg-[#05070b] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
          <p className="text-sm tracking-[0.2em] uppercase text-stone-400">Preparing admin portal</p>
        </div>
      </div>
    );
  }

  if (user) return <Navigate to="/admin/dashboard" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const data = await apiGet<{ profile?: { role?: string }; role?: string }>('/api/profile');
      const profile = (data as { profile?: { role?: string } } | undefined)?.profile ?? data;
      const role = String(profile?.role || '').toLowerCase();
      if (role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error('This account is not an admin account. Use an admin user or promote the profile to role = admin.');
      }

      navigate('/admin/dashboard', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(/failed to fetch|network|timed out|timeout/i.test(message)
        ? 'Unable to reach the authentication service. Check your internet connection, disable any VPN or ad blocker, and try again.'
        : message || 'Admin login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070b] text-stone-100">
      <div className="absolute inset-0 bg-gradient-to-br from-[#05070b] via-[#05070b]/90 to-amber-950/30" />
      <div className="relative mx-auto flex min-h-screen max-w-md items-center justify-center px-5 py-10">
        <form onSubmit={submit} className="w-full rounded-md border border-white/10 bg-[#0a0f17]/90 p-7 shadow-2xl">
          <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/80">Restricted access</div>
          <h1 className="mt-2 font-display text-4xl">Admin login</h1>
          <p className="mt-2 text-sm text-stone-400">Use a real admin account to access the platform control room.</p>

          <label className="mt-6 block text-[10px] uppercase tracking-[0.2em] text-stone-500">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-amber-400/60"
            placeholder="admin@company.com"
          />

          <label className="mt-4 block text-[10px] uppercase tracking-[0.2em] text-stone-500">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-amber-400/60"
            placeholder="••••••••"
          />

          {error && <div className="mt-4 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

          <button disabled={busy} className="mt-6 w-full rounded-sm bg-amber-400 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1304] disabled:opacity-60">
            {busy ? 'Signing in…' : 'Enter admin portal'}
          </button>

          <div className="mt-5 text-center text-[11px] text-stone-500">
            <a href="/login" className="text-amber-300 hover:text-amber-200">Back to client login</a>
          </div>
        </form>
      </div>
    </div>
  );
}
