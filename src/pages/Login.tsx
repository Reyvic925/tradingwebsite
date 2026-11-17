import { useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, LockKeyhole } from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { resendVerificationEmail, signIn, signUp, verifyEmailCode } from '../lib/auth';
import { apiSend, clearReferral, takeReferral } from '../lib/api';
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
  const [showPassword, setShowPassword] = useState(false);
  const mode = params.get('mode') === 'signup' ? 'signup' : params.get('mode') === 'reset' ? 'reset' : 'login';
  const resetToken = params.get('token') || '';
  const emailVerified = params.get('email_verified') === '1';
  const emailVerificationFailed = params.get('email_verified') === '0';

  if (!loading && user) return <Navigate to="/app" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
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
        return;
      } else if (mode === 'reset') {
        await apiSend('/api/auth/password-reset/request', 'POST', { email });
        setResetSent(true);
        return;
      } else if (mode === 'signup' && verificationPending) {
        await verifyEmailCode(email, verificationCode);
        setVerificationPending(false);
        setVerificationNotice('Email confirmed. Signing you in…');
        await signIn(email, password);
        window.location.href = '/app';
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
      window.location.href = '/app';
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

  const headerText = verificationPending ? 'Check your email' : mode === 'signup' ? 'Create your account' : mode === 'reset' ? resetToken ? 'Choose a new password' : 'Reset your password' : 'Welcome back';
  const helperText = verificationPending
    ? 'Check your inbox and enter the 8-digit code, or use the confirmation link in the email.'
    : mode === 'reset'
    ? resetComplete ? 'Your password has been updated.' : resetSent ? 'If the address is registered, a reset link is on its way.' : resetToken ? 'Choose a new password for your account.' : 'We will send a password reset link if this address has an account.'
    : mode === 'signup' ? 'Your next chapter starts here. Set up your trading account.' : 'Sign in to access your account and portfolio.';
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
    <div className="relative min-h-screen overflow-hidden bg-[#07090e] text-stone-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.09),transparent_60%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-7 flex justify-center"><Logo /></div>
        <div className="rounded-2xl border border-white/10 bg-[#101319]/95 p-5 shadow-2xl shadow-black/30 sm:p-9">
          <div className="mb-5 flex items-center gap-2 text-xs font-medium text-amber-200"><LockKeyhole size={14} aria-hidden="true" />{verificationPending ? 'Confirm your email' : mode === 'signup' ? 'Get started with Apex Prime' : 'Your Apex Prime account'}</div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{headerText}</h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-400">{helperText}</p>

          {emailVerified && <div role="status" className="mt-4 border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-sm text-emerald-200">Email verified. Thank you.</div>}
          {emailVerificationFailed && <div role="alert" className="mt-4 border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-sm text-rose-200">That verification link is invalid or expired. Sign in and request another.</div>}
          {verificationNotice && <div role="status" className="mt-4 border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm text-amber-100">{verificationNotice}</div>}
          {resetSent && <div role="status" className="mt-4 border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-sm text-emerald-200">If the address is registered, a password reset link is on its way.</div>}
          {resetComplete && <div role="status" className="mt-4 border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-sm text-emerald-200">Password reset successfully. Sign in with your new password.</div>}

          {!resetComplete && !(mode === 'reset' && resetSent) && <form onSubmit={submit} className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2" aria-busy={busy}>
            {!verificationPending && !(mode === 'reset' && resetToken) && <label className="block text-xs font-medium text-stone-300 sm:col-span-2">Email address
<input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                className="mt-2 min-h-12 w-full rounded-lg border border-white/15 bg-[#090c11] px-3.5 py-3 text-sm text-stone-100 outline-none transition placeholder:text-stone-600 hover:border-white/25 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/10"
              />
</label>}
            {mode === 'signup' && !verificationPending && (
              <>
                <label className="block text-xs font-medium text-stone-300 sm:col-span-2">Full name
<input
                  required
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full Name"
                  className="mt-2 min-h-12 w-full rounded-lg border border-white/15 bg-[#090c11] px-3.5 py-3 text-sm text-stone-100 outline-none transition placeholder:text-stone-600 hover:border-white/25 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/10"
                />
</label>
                <label className="block text-xs font-medium text-stone-300 ">Phone number
<input
                  required
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 000 0000"
                  className="mt-2 min-h-12 w-full rounded-lg border border-white/15 bg-[#090c11] px-3.5 py-3 text-sm text-stone-100 outline-none transition placeholder:text-stone-600 hover:border-white/25 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/10"
                />
</label>
                <label className="block text-xs font-medium text-stone-300 ">Country of residence
<input
                  required
                  type="text"
                  autoComplete="country-name"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. United States"
                  className="mt-2 min-h-12 w-full rounded-lg border border-white/15 bg-[#090c11] px-3.5 py-3 text-sm text-stone-100 outline-none transition placeholder:text-stone-600 hover:border-white/25 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/10"
                />
</label>
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
              className="sm:col-span-2 w-full rounded-lg border border-white/15 bg-[#090c11] px-3 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-amber-400/50"
            />}
            {!verificationPending && (mode !== 'reset' || Boolean(resetToken)) && (
              <div className={mode === 'login' ? 'sm:col-span-2' : ''}>
                <label htmlFor="account-password" className="block text-xs font-medium text-stone-300">Password</label>
                  <div className="relative"><input
                id="account-password"
                required
                minLength={8}
                aria-describedby={mode === 'signup' || mode === 'reset' ? 'password-guidance' : undefined}
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signup' || mode === 'reset' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Secure Password' : mode === 'reset' ? 'New Password' : 'Password'}
                className="mt-2 min-h-12 w-full rounded-lg border border-white/15 bg-[#090c11] pl-3.5 pr-12 py-3 text-sm text-stone-100 outline-none transition placeholder:text-stone-600 hover:border-white/25 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/10"
              />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute inset-y-0 right-0 mt-2 flex w-12 items-center justify-center rounded-lg text-stone-400 transition hover:text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-300">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                {mode !== 'login' && <p id="password-guidance" className={`mt-2 flex items-center gap-1.5 text-xs ${password.length >= 8 ? 'text-emerald-300' : 'text-stone-400'}`}>
                  {password.length >= 8 && <Check size={13} aria-hidden="true" />}At least 8 characters
                </p>}
              </div>
            )}
            {!verificationPending && (mode === 'signup' || (mode === 'reset' && Boolean(resetToken))) && (
              <label className="block text-xs font-medium text-stone-300 ">Confirm password
<input
                required
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm Password"
                className="mt-2 min-h-12 w-full rounded-lg border border-white/15 bg-[#090c11] px-3.5 py-3 text-sm text-stone-100 outline-none transition placeholder:text-stone-600 hover:border-white/25 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/10"
              />
</label>
            )}
            {error && <div role="alert" className="sm:col-span-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
            <button disabled={busy} className="sm:col-span-2 mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 py-3 text-sm font-semibold text-[#1a1304] transition hover:bg-amber-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300 disabled:cursor-wait disabled:opacity-60">
              {busy && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}
              {busy ? 'Please wait...' : actionText}
              {!busy && <ArrowRight size={17} aria-hidden="true" />}
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

          <div className="mt-6 border-t border-white/10 pt-5 text-center text-sm text-stone-400">
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

        </div>
      </div>
    </div>
  );
}
