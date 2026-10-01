import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { signIn, signUp } from '../lib/auth';
import { apiGet, bootstrapProfile } from '../lib/api';
import { BRAND } from '../lib/brand';
import Logo from '../components/Logo';

export default function Login() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(params.get('error') || '');
  const [busy, setBusy] = useState(false);
  const mode = params.get('mode') === 'signup' ? 'signup' : 'login';

  if (!loading && user) return <Navigate to="/app" replace />;

  const finishAuthentication = async () => {
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
    if (mode === 'signup') {
      if (!fullName.trim()) return setError('Enter your full name.');
      if (!phone.trim()) return setError('Enter your phone number.');
      if (!location.trim()) return setError('Enter your location.');
      if (password !== confirmPassword) return setError('Passwords do not match.');
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password);
        await bootstrapProfile({
          full_name: fullName.trim(),
          phone: phone.trim(),
          country: location.trim(),
        });
      } else {
        await signIn(email, password);
      }
      await finishAuthentication();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      const networkIssue = /failed to fetch|network|timed out|timeout/i.test(message);
      setError(networkIssue
        ? 'Unable to reach the authentication service. Check your internet connection, disable any VPN or ad blocker, and try again.'
        : message || (mode === 'signup' ? 'Unable to create this account.' : 'Authentication failed'));
    } finally {
      setBusy(false);
    }
  };

  const headerText = mode === 'signup' ? 'Create your account' : 'Welcome back';
  const helperText = mode === 'signup'
    ? 'Institutional rails. Retail-ready onboarding in under a minute.'
    : 'Institutional rails. Retail-ready onboarding in under a minute.';
  const actionText = mode === 'signup' ? 'Create account' : 'Sign in';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070b]">
      <video className="absolute inset-0 h-full w-full object-cover opacity-30" autoPlay muted loop playsInline src="/videos/hero-trading-floor.mp4" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#05070b] via-[#05070b]/85 to-amber-950/30" />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="glass rounded-md p-7">
          <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/80">Private access</div>
          <h1 className="mt-2 font-display text-4xl">{headerText}</h1>
          <p className="mt-2 text-sm text-stone-400">{helperText}</p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email Address"
              className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50"
            />
            {mode === 'signup' && (
              <>
                <input
                  required
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50"
                />
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Comms (Phone)"
                  className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50"
                />
                <input
                  required
                  type="text"
                  autoComplete="country-name"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location"
                  className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50"
                />
              </>
            )}
            <input
              required
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'Secure Password' : 'Password'}
              className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50"
            />
            {mode === 'signup' && (
              <input
                required
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm Password"
                className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50"
              />
            )}
            {error && <div className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
            <button disabled={busy} className="w-full rounded-sm bg-amber-400 py-2.5 text-sm font-semibold uppercase tracking-[0.16em] text-[#1a1304] disabled:opacity-60">
              {busy ? 'Please wait…' : actionText}
            </button>
          </form>

          <div className="mt-4 text-center text-[11px] text-stone-300">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button type="button" className="font-semibold text-amber-300 underline" onClick={() => navigate('/login')}>
                  Sign in
                </button>
              </>
            ) : (
              <>
                Need an account?{' '}
                <button type="button" className="font-semibold text-amber-300 underline" onClick={() => navigate('/login?mode=signup')}>
                  Create one
                </button>
              </>
            )}
          </div>

          <p className="mt-4 text-center text-[11px] text-stone-600">Demo: {BRAND.demoEmail} / {BRAND.demoPassword}</p>
        </div>
      </div>
    </div>
  );
}
