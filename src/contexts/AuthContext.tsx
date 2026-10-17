import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getAuthProvider, getAuthSession, type WorkerAuthSession, type WorkerAuthUser } from '../lib/auth';

type AuthValue = {
  user: WorkerAuthUser | null;
  session: WorkerAuthSession | null;
  loading: boolean;
  provider: 'worker';
};

const AuthContext = createContext<AuthValue>({ user: null, session: null, loading: true, provider: 'worker' });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<WorkerAuthUser | null>(null);
  const [session, setSession] = useState<WorkerAuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const provider = getAuthProvider();

  useEffect(() => {
    let active = true;
    let authChangeRevision = 0;
    const syncSession = async () => {
      const revision = authChangeRevision;
      try {
        const { session: sessionData, user: userData } = await getAuthSession();
        if (!active || revision !== authChangeRevision) return;
        setSession(sessionData);
        setUser(userData);
        setLoading(false);
      } catch {
        if (active && revision === authChangeRevision) setLoading(false);
      }
    };

    void syncSession();

    const onWorkerAuthChange = (event: Event) => {
      authChangeRevision += 1;
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
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, provider }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
