import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { signIn, signUp } from '../lib/auth';
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
  const [error, setError] = useState(params.get('error') || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ref = params.get('ref');
    if (ref) persistReferral(ref);
  }, [params]);

  if (!loading && user) return <Navigate to="/app" replace />;

  const finishAuthentication = async (isNewAccount = false) => {
    await bootstrapProfile(isNewAccount ? { full_name: fullName, referred_by: referral || null } : undefined);
    const data = await apiGet<{ profile?: { role?: string }; role?: string }>('/api/profile');
    const profile = (data as { profile?: { role?: string } } | undefined)?.profile ?? data;
    const role = String(profile?.role || '').toLowerCase();
    navigate(role === 'admin' ? '/admin/dashboard' : '/app');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.includes('@')) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        await finishAuthentication(true);
        return;
      } else {
        await signIn(email, password);
        await finishAuthentication();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(/failed to fetch|network|timed out|timeout/i.test(message)
        ? 'Unable to reach the authentication service. Check your internet connection, disable any VPN or ad blocker, and try again.'
        : message || 'Authentication failed');
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

          <button onClick={() => setIsSignUp((v) => !v)} className="mt-5 w-full text-center text-sm text-stone-400">
            {isSignUp ? 'Already have an account? Sign in' : `New to ${BRAND.name}? Create an account`}
          </button>
          <p className="mt-4 text-center text-[11px] text-stone-600">Demo: {BRAND.demoEmail} / {BRAND.demoPassword}</p>
        </div>
      </div>
    </div>
  );
}
