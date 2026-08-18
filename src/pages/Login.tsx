import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import supabase, { isSignupConfirmationCallback } from '../lib/supabase';
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
  const [error, setError] = useState(params.get('error') || '');
  const [busy, setBusy] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [otp, setOtp] = useState('');
  const [confirmationNote, setConfirmationNote] = useState('');
  // Use canonical domain instead of window.location.origin to avoid www/non-www inconsistencies
  // This ensures all confirmation emails link to the same canonical URL
  const confirmationRedirectUrl = typeof window !== 'undefined' && window.location.hostname.includes('localhost')
    ? `${window.location.origin}`
    : 'https://theprimemarkets.com';
  const confirmedSignup = params.get('confirmed') === '1' || isSignupConfirmationCallback;

  useEffect(() => {
    const ref = params.get('ref');
    if (ref) persistReferral(ref);
  }, [params]);

  useEffect(() => {
    if (!confirmedSignup) return;

    // A confirmation link gives Supabase a temporary browser session. The
    // product flow requires an explicit password sign-in after confirmation.
    setIsSignUp(false);
    setAwaitingConfirmation(false);
    setConfirmationNote('Email confirmed. Sign in with your email and password to continue.');
    if (user) void supabase.auth.signOut({ scope: 'local' });
  }, [confirmedSignup, user]);

  if (!loading && user && !awaitingConfirmation && !confirmedSignup) return <Navigate to="/app" replace />;

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
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setBusy(true);
    try {
      if (isSignUp) {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: confirmationRedirectUrl },
        });
        if (err) throw err;
        if (data.session) {
          await supabase.auth.signOut({ scope: 'local' });
        }
        setAwaitingConfirmation(true);
        setConfirmationNote(`We sent an 8-digit code and a confirmation link to ${email}.`);
        return;
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        await finishAuthentication();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const token = otp.replace(/\s/g, '');
    // Supabase sends 8-digit OTP tokens
    if (!/^\d{8}$/.test(token)) return setError('Enter the 8-digit code from your email.');
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (err) throw err;
      await finishAuthentication(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not verify that code.';
      if (/expired|invalid/i.test(message)) {
        setError('That verification code is expired or was already used. Resend the confirmation email for a new code and link.');
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const resendConfirmation = async () => {
    setError('');
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: confirmationRedirectUrl } });
      if (err) throw err;
      setOtp('');
      setConfirmationNote(`A new verification code and confirmation link were sent to ${email}. Previous codes and links no longer work.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend the code.');
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
          <h1 className="mt-2 font-display text-4xl">{awaitingConfirmation ? 'Verify your email' : isSignUp ? 'Open an account' : 'Welcome back'}</h1>
          <p className="mt-2 text-sm text-stone-400">{awaitingConfirmation ? `Enter the 8-digit code sent to ${email}, or click the confirmation link in that email.` : 'Institutional rails. Retail-ready onboarding in under a minute.'}</p>

          {awaitingConfirmation ? (
            <form onSubmit={verifyOtp} className="mt-6 space-y-3">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="8-digit code"
                className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-center font-mono text-lg tracking-[0.45em] outline-none focus:border-amber-400/50"
              />
              {confirmationNote && <div className="text-center text-xs text-stone-400">{confirmationNote}</div>}
              {error && <div className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
              <button disabled={busy} className="w-full rounded-sm bg-amber-400 py-2.5 text-sm font-semibold uppercase tracking-[0.16em] text-[#1a1304] disabled:opacity-60">
                {busy ? 'Please wait…' : 'Verify email'}
              </button>
              <button type="button" disabled={busy} onClick={resendConfirmation} className="w-full text-center text-sm text-amber-300 disabled:opacity-60">Resend code</button>
              <button type="button" disabled={busy} onClick={() => { setAwaitingConfirmation(false); setOtp(''); setError(''); }} className="w-full text-center text-sm text-stone-400 disabled:opacity-60">Use a different email</button>
            </form>
          ) : (
          <>
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
          </>
          )}
        </div>
      </div>
    </div>
  );
}
