import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiGet } from '../lib/api';

export default function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;

    async function checkAdmin() {
      if (!user) {
        setIsAdmin(false);
        return;
      }

      try {
        const data = await apiGet<{ profile?: { role?: string }; role?: string }>('/api/profile');
        const profile = (data as { profile?: { role?: string } } | undefined)?.profile ?? data;
        const role = String(profile?.role || '').toLowerCase();
        const admin = role === 'admin' || (user.user_metadata as Record<string, unknown> | undefined)?.is_admin === true;
        if (alive) setIsAdmin(admin);
      } catch {
        if (alive) setIsAdmin(false);
      }
    }

    if (!loading) {
      checkAdmin();
    }

    return () => {
      alive = false;
    };
  }, [loading, user]);

  if (loading || isAdmin === null) {
    return (
      <div className="min-h-screen bg-[#05070b] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
          <p className="text-sm tracking-[0.2em] uppercase text-stone-400">Checking admin access</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  if (!isAdmin) return <Navigate to="/admin/login" replace state={{ from: location.pathname, reason: 'admin-required' }} />;

  return <>{children}</>;
}
