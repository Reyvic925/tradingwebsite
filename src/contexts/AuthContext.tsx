import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getAuthProvider, getAuthSession, isWorkerAuthEnabled, type WorkerAuthSession, type WorkerAuthUser } from '../lib/auth';

type AuthValue = {
  user: User | WorkerAuthUser | null;
  session: Session | WorkerAuthSession | null;
  loading: boolean;
  provider: 'supabase' | 'worker';
};

const AuthContext = createContext<AuthValue>({ user: null, session: null, loading: true, provider: 'supabase' });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | WorkerAuthUser | null>(null);
  const [session, setSession] = useState<Session | WorkerAuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const provider = getAuthProvider();

  useEffect(() => {
    let active = true;
    const syncSession = () => getAuthSession().then(({ session: sessionData, user: userData }) => {
      if (!active) return;
      setSession(sessionData);
      setUser(userData);
      setLoading(false);
    }).catch(() => setLoading(false));

    void syncSession();

    if (isWorkerAuthEnabled()) {
      const onWorkerAuthChange = (event: Event) => {
        const nextUser = (event as CustomEvent<WorkerAuthUser | null>).detail;
        setUser(nextUser);
        setSession(nextUser ? { user: nextUser } : null);
        setLoading(false);
      };
      window.addEventListener('apex-worker-auth-change', onWorkerAuthChange);
      return () => {
        active = false;
        window.removeEventListener('apex-worker-auth-change', onWorkerAuthChange);
      };
    }

    if (!isWorkerAuthEnabled()) {
      let subscription: { unsubscribe: () => void } | undefined;
      import('../lib/supabase').then(({ default: supabase }) => {
        const authState = supabase.auth.onAuthStateChange((_event: string, nextSession: Session | null) => {
          setSession(nextSession);
          setUser(nextSession?.user ?? null);
          setLoading(false);
        });
        subscription = authState.data.subscription;
      });

      return () => {
        active = false;
        subscription?.unsubscribe();
      };
    }

    return () => { active = false; };
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, provider }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
