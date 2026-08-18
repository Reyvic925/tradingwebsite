import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import supabase from '../lib/supabase';
import Logo from '../components/Logo';

/**
 * AuthConfirm handles email verification links from Supabase.
 * 
 * IMPORTANT: This page does NOT call verifyOtp() on initial load.
 * This prevents email security scanners from consuming the verification token
 * by simply prefetching/following the link.
 * 
 * Verification only happens when the user explicitly clicks the confirm button.
 * The URL contains the token_hash, but it's never sent to Supabase unless the
 * user takes action.
 */
export default function AuthConfirm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');

  const token_hash = params.get('token_hash');
  const type = params.get('type') || 'email';

  if (!token_hash) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#05070b]">
        <video className="absolute inset-0 h-full w-full object-cover opacity-30" autoPlay muted loop playsInline src="/videos/hero-trading-floor.mp4" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#05070b] via-[#05070b]/85 to-amber-950/30" />
        <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
          <div className="mb-8 flex justify-center"><Logo /></div>
          <div className="glass rounded-md p-7">
            <h1 className="font-display text-4xl text-rose-200">Invalid link</h1>
            <p className="mt-2 text-sm text-stone-400">This confirmation link is missing required information. Please use the code from your email instead.</p>
            <button
              onClick={() => navigate('/login?mode=signup', { replace: true })}
              className="mt-6 w-full rounded-sm bg-amber-400 py-2.5 text-sm font-semibold uppercase tracking-[0.16em] text-[#1a1304]"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleConfirmation = async () => {
    setError('');
    setIsVerifying(true);

    try {
      // This is where the verification actually happens—only after user clicks.
      const { data, error: err } = await supabase.auth.verifyOtp({
        token_hash,
        type: type as 'email' | 'recovery' | 'email_change' | 'phone_change',
      });

      if (err) throw err;
      if (!data?.session) throw new Error('Verification did not create a session.');

      // Session created. Redirect to post-confirmation page.
      navigate('/login?confirmed=1', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      console.error('[AuthConfirm] Error:', message);
      setError(message);
      setIsVerifying(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070b]">
      <video className="absolute inset-0 h-full w-full object-cover opacity-30" autoPlay muted loop playsInline src="/videos/hero-trading-floor.mp4" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#05070b] via-[#05070b]/85 to-amber-950/30" />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="glass rounded-md p-7">
          <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/80">Confirm your email</div>
          <h1 className="mt-2 font-display text-4xl">Ready to proceed?</h1>
          <p className="mt-2 text-sm text-stone-400">
            Click the button below to confirm your email address and complete your registration.
          </p>

          {error && (
            <div className="mt-4 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <button
              onClick={handleConfirmation}
              disabled={isVerifying}
              className="w-full rounded-sm bg-amber-400 py-2.5 text-sm font-semibold uppercase tracking-[0.16em] text-[#1a1304] disabled:opacity-60"
            >
              {isVerifying ? 'Confirming…' : 'Confirm email'}
            </button>
            <button
              onClick={() => navigate('/login?mode=signup', { replace: true })}
              disabled={isVerifying}
              className="w-full text-center text-sm text-stone-400 disabled:opacity-60"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
