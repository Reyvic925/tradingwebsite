import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { resendVerificationEmail, signIn, signUp, verifyEmailCode } from '../lib/auth';
import { apiGet, apiSend, clearReferral, takeReferral } from '../lib/api';
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
  const [resetSent, setResetSent] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');
  const [resendingVerification, setResendingVerification] = useState(false);
  const [error, setError] = useState(params.get('error') || '');
  const [busy, setBusy] = useState(false);
  const mode = params.get('mode') === 'signup' ? 'signup' : params.get('mode') === 'reset' ? 'reset' : 'login';
  const resetToken = params.get('token') || '';
  const emailVerified = params.get('email_verified') === '1';
  const emailVerificationFailed = params.get('email_verified') === '0';

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
    if (mode === 'reset') {
      if (resetComplete) return;
      if (resetToken) {
        if (password.length < 8) return setError('Password must be at least 8 characters.');
        if (password !== confirmPassword) return setError('Passwords do not match.');
      } else if (!email.includes('@')) {
        return setError('Enter a valid email address.');
      }
    } else {
      if (!email.includes('@')) return setError('Enter a valid email address.');
      if (password.length < 8) return setError('Password must be at least 8 characters.');
    }
    if (verificationPending && !/^\d{8}$/.test(verificationCode)) return setError('Enter the 8-digit code from your email.');
    if (mode === 'signup') {
      if (!fullName.trim()) return setError('Enter your full name.');
      if (!phone.trim()) return setError('Enter your phone number.');
      if (!location.trim()) return setError('Enter your location.');
      if (password !== confirmPassword) return setError('Passwords do not match.');
    }
    setBusy(true);
    try {
      if (mode === 'reset' && resetToken) {
        await apiSend('/api/auth/password-reset/confirm', 'POST', { token: resetToken, new_password: password });
        setResetComplete(true);
      } else if (mode === 'reset') {
        await apiSend('/api/auth/password-reset/request', 'POST', { email });
        setResetSent(true);
      } else if (mode === 'signup' && verificationPending) {
        await verifyEmailCode(email, verificationCode);
        setVerificationPending(false);
        setVerificationNotice('Email confirmed. Signing you in…');
        await signIn(email, password);
        await finishAuthentication();
        return;
      } else if (mode === 'signup') {
        const result = await signUp(email, password, {
          full_name: fullName.trim(),
          phone: phone.trim(),
          country: location.trim(),
          referred_by: takeReferral(),
        });
        clearReferral();
        setVerificationPending(true);
        setVerificationNotice(result.throttled
          ? 'A verification email was sent recently. Check your inbox, including spam.'
          : result.email_sent
          ? 'We sent an 8-digit code and a confirmation link. Confirm your email before signing in.'
          : 'Your account is pending email confirmation, but we could not send the email. Use resend to try again.');
        return;
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

  const headerText = mode === 'signup' ? 'Create your account' : mode === 'reset' ? resetToken ? 'Choose a new password' : 'Reset your password' : 'Welcome back';
  const helperText = verificationPending
    ? 'Check your inbox and enter the 8-digit code, or use the confirmation link in the email.'
    : mode === 'reset'
    ? resetComplete ? 'Your password has been updated.' : resetSent ? 'If the address is registered, a reset link is on its way.' : resetToken ? 'Choose a new password for your account.' : 'We will send a password reset link if this address has an account.'
    : 'Institutional rails. Retail-ready onboarding in under a minute.';
  const actionText = verificationPending ? 'Verify email' : mode === 'signup' ? 'Create account' : mode === 'reset' ? resetToken ? 'Reset password' : 'Send reset link' : 'Sign in';

  const resendVerification = async () => {
    setResendingVerification(true);
    setError('');
    try {
      const result = await resendVerificationEmail(email);
      setVerificationNotice(result.throttled
        ? 'A verification email was sent recently. Check your inbox, including spam.'
        : 'If your account is awaiting confirmation, a fresh verification email is on its way.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to resend the verification email.');
    } finally {
      setResendingVerification(false);
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
          <h1 className="mt-2 font-display text-4xl">{headerText}</h1>
          <p className="mt-2 text-sm text-stone-400">{helperText}</p>

          {emailVerified && <div role="status" className="mt-4 border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-sm text-emerald-200">Email verified. Thank you.</div>}
          {emailVerificationFailed && <div role="alert" className="mt-4 border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-sm text-rose-200">That verification link is invalid or expired. Sign in and request another.</div>}
          {verificationNotice && <div role="status" className="mt-4 border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm text-amber-100">{verificationNotice}</div>}
          {resetSent && <div role="status" className="mt-4 border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-sm text-emerald-200">If the address is registered, a password reset link is on its way.</div>}
          {resetComplete && <div role="status" className="mt-4 border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-sm text-emerald-200">Password reset successfully. Sign in with your new password.</div>}

          {!resetComplete && !(mode === 'reset' && resetSent) && <form onSubmit={submit} className="mt-6 space-y-3">
            {!verificationPending && !(mode === 'reset' && resetToken) && <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50"
              />}
            {mode === 'signup' && !verificationPending && (
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
            {verificationPending && <input
              required
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              pattern="[0-9]{8}"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="8-digit verification code"
              aria-label="8-digit verification code"
              className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-amber-400/50"
            />}
            {!verificationPending && (mode !== 'reset' || Boolean(resetToken)) && (
              <input
                required
                type="password"
                autoComplete={mode === 'signup' || mode === 'reset' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Secure Password' : mode === 'reset' ? 'New Password' : 'Password'}
                className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50"
              />
            )}
            {!verificationPending && (mode === 'signup' || (mode === 'reset' && Boolean(resetToken))) && (
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
            {error && <div role="alert" className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
            <button disabled={busy} className="w-full rounded-sm bg-amber-400 py-2.5 text-sm font-semibold uppercase tracking-[0.16em] text-[#1a1304] disabled:opacity-60">
              {busy ? 'Please wait…' : actionText}
            </button>
          </form>}

          {verificationPending && <button
            type="button"
            disabled={resendingVerification}
            onClick={resendVerification}
            className="mt-3 w-full text-center text-xs font-semibold text-amber-200 underline disabled:opacity-50"
          >
            {resendingVerification ? 'Sending…' : 'Resend verification email'}
          </button>}

          <div className="mt-4 text-center text-[11px] text-stone-300">
            {mode === 'reset' ? (
              <button type="button" className="font-semibold text-amber-300 underline" onClick={() => navigate('/login')}>
                Back to sign in
              </button>
            ) : mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button type="button" className="font-semibold text-amber-300 underline" onClick={() => navigate('/login')}>
                  Sign in
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span>Need an account?{' '}
                  <button type="button" className="font-semibold text-amber-300 underline" onClick={() => navigate('/login?mode=signup')}>
                    Create one
                  </button>
                </span>
                <button type="button" className="font-semibold text-stone-400 underline hover:text-amber-200" onClick={() => navigate('/login?mode=reset')}>
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          {mode === 'login' && <p className="mt-4 text-center text-[11px] text-stone-600">Demo: {BRAND.demoEmail} / {BRAND.demoPassword}</p>}
        </div>
      </div>
    </div>
  );
}
