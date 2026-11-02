import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, error, retrySession } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#05070b] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
          <p className="text-sm tracking-[0.2em] uppercase text-stone-400">Securing session</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070b] px-5 text-stone-100">
        <section role="alert" className="max-w-md rounded-md border border-white/10 bg-white/[0.03] p-8 text-center">
          <h1 className="font-display text-3xl">Session check failed</h1>
          <p className="mt-3 text-sm text-stone-400">{error}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={retrySession}
              className="rounded-sm bg-amber-400 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#1a1304]"
            >
              Retry
            </button>
            <Link
              to="/login"
              className="rounded-sm border border-white/15 px-4 py-2 text-xs uppercase tracking-widest"
            >
              Sign in
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
