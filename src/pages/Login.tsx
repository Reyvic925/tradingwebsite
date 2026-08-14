import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import { apiGet, bootstrapProfile, persistReferral } from '../lib/api';
import { BRAND } from '../lib/brand';
import Logo from '../components/Logo';

export default function Login() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(params.get('mode') === 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [referral, setReferral] = useState(params.get('ref') || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ref = params.get('ref');
    if (ref) persistReferral(ref);
  }, [params]);

  if (!loading && user) return <Navigate to="/app" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.includes('@')) return setError('Enter a valid email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setBusy(true);
    try {
      if (isSignUp) {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        const { error: sErr } = await supabase.auth.signInWithPassword({ email, password });
        if (sErr) throw sErr;
        await bootstrapProfile({ full_name: fullName, referred_by: referral || null });
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        await bootstrapProfile();
      }

      const data = await apiGet<{ profile?: { role?: string }; role?: string }>('/api/profile');
      const profile = (data as { profile?: { role?: string } } | undefined)?.profile ?? data;
      const role = String(profile?.role || '').toLowerCase();
      navigate(role === 'admin' ? '/admin/dashboard' : '/app');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070b]">
      <video className="absolute inset-0 h-full w-full object-cover opacity-30" autoPlay muted loop playsInline src="/videos/hero-trading-floor.mp4" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#05070b] via-[#05070b]/85 to-amber-950/30" />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="glass rounded-md p-7">
          <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/80">Private access</div>
          <h1 className="mt-2 font-display text-4xl">{isSignUp ? 'Open an account' : 'Welcome back'}</h1>
          <p className="mt-2 text-sm text-stone-400">Institutional rails. Retail-ready onboarding in under a minute.</p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            {isSignUp && (
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50"
            />
            {isSignUp && (
              <input
                value={referral}
                onChange={(e) => setReferral(e.target.value.toUpperCase())}
                placeholder="Referral code (optional)"
                className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50"
              />
            )}
            {error && <div className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
            <button disabled={busy} className="w-full rounded-sm bg-amber-400 py-2.5 text-sm font-semibold uppercase tracking-[0.16em] text-[#1a1304] disabled:opacity-60">
              {busy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <div className="my-5 text-center text-xs uppercase tracking-[0.24em] text-stone-500">or</div>
          <button
            onClick={() => signInWithGoogle(BRAND.name)}
            className="flex w-full items-center justify-center gap-2 rounded-sm border border-white/15 py-2.5 text-sm text-stone-100 hover:border-amber-300/40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4">
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.1 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" />
            </svg>
            Continue with Google
          </button>

          <button onClick={() => setIsSignUp((v) => !v)} className="mt-5 w-full text-center text-sm text-stone-400">
            {isSignUp ? 'Already have an account? Sign in' : `New to ${BRAND.name}? Create an account`}
          </button>
          <p className="mt-4 text-center text-[11px] text-stone-600">Demo: {BRAND.demoEmail} / {BRAND.demoPassword}</p>
        </div>
      </div>
    </div>
  );
}
