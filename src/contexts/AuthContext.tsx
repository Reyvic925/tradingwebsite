import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getAuthProvider, getAuthSession, type WorkerAuthSession, type WorkerAuthUser } from '../lib/auth';

type AuthValue = {
  user: WorkerAuthUser | null;
  session: WorkerAuthSession | null;
  loading: boolean;
  error: string | null;
  retrySession: () => void;
  provider: 'worker';
};

const AuthContext = createContext<AuthValue>({
  user: null,
  session: null,
  loading: true,
  error: null,
  retrySession: () => {},
  provider: 'worker',
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<WorkerAuthUser | null>(null);
  const [session, setSession] = useState<WorkerAuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const provider = getAuthProvider();

  useEffect(() => {
    let active = true;
    let authChangeRevision = 0;
    const loadingTimeout = window.setTimeout(() => {
      if (!active || authChangeRevision !== 0) return;
      setError('Session verification is taking too long. Check your connection and retry.');
      setLoading(false);
    }, 18_000);

    const syncSession = async () => {
      const revision = authChangeRevision;
      try {
        const { session: sessionData, user: userData } = await getAuthSession();
        if (!active || revision !== authChangeRevision) return;
        setSession(sessionData);
        setUser(userData);
        setError(null);
      } catch {
        if (active && revision === authChangeRevision) {
          setError('Unable to verify your session. Check your connection and retry.');
        }
      } finally {
        if (active && revision === authChangeRevision) setLoading(false);
        window.clearTimeout(loadingTimeout);
      }
    };

    const onWorkerAuthChange = (event: Event) => {
      authChangeRevision += 1;
      window.clearTimeout(loadingTimeout);
      const nextUser = (event as CustomEvent<WorkerAuthUser | null>).detail;
      setUser(nextUser);
      setSession(nextUser ? { user: nextUser } : null);
      setError(null);
      setLoading(false);
    };
    window.addEventListener('apex-worker-auth-change', onWorkerAuthChange);
    void syncSession();

    return () => {
      active = false;
      window.clearTimeout(loadingTimeout);
      window.removeEventListener('apex-worker-auth-change', onWorkerAuthChange);
    };
  }, [sessionAttempt]);

  const retrySession = useCallback(() => {
    setError(null);
    setLoading(true);
    setSessionAttempt((attempt) => attempt + 1);
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, error, retrySession, provider }}>
      {children}
    </AuthContext.Provider>
  );
}

// The provider and its hook intentionally share one context module.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
