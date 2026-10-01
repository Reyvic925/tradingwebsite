import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo';

export default function AuthConfirm() {
  const [searchParams] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const token = searchParams.get('token');

  const confirmEmail = () => {
    if (!token || submitting) return;
    setSubmitting(true);
    window.location.assign(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#05070b] px-5 py-12 text-stone-100">
      <div className="absolute inset-0 bg-gradient-to-br from-[#05070b] via-[#05070b]/90 to-amber-950/30" />
      <section className="relative w-full max-w-lg border border-white/10 bg-[#0b0f1a]/90 p-8 shadow-2xl sm:p-10">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="mb-5 flex justify-center text-amber-300"><ShieldCheck size={30} aria-hidden="true" /></div>
        <h1 className="text-center font-display text-3xl">Confirm your email</h1>
        {token ? (
          <>
            <p className="mt-3 text-center text-sm leading-6 text-stone-400">Your email is ready to be verified. Continue to confirm your Prime Markets account.</p>
            <button
              type="button"
              onClick={confirmEmail}
              disabled={submitting}
              className="mt-7 w-full bg-[#d4af37] px-5 py-3 text-sm font-semibold text-[#0b0f1a] transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60"
            >
              {submitting ? 'Opening confirmation…' : 'Confirm Email'}
            </button>
            <p className="mt-5 text-center text-xs leading-5 text-stone-500">If you did not create this account, you can safely ignore this email.</p>
          </>
        ) : (
          <>
            <p role="alert" className="mt-3 text-center text-sm leading-6 text-rose-200">This confirmation link is missing its token. Request a new verification email and try again.</p>
            <Link to="/login" className="mt-7 flex items-center justify-center gap-2 text-sm text-amber-200 hover:text-amber-100">
              <ArrowLeft size={16} aria-hidden="true" /> Return to sign in
            </Link>
          </>
        )}
      </section>
    </main>
  );
}