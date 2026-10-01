export type WorkerAuthUser = {
  id: string;
  email: string;
  created_at: string;
  user_metadata?: Record<string, unknown>;
};

export type WorkerAuthSession = { user: WorkerAuthUser };
export type AuthProvider = 'worker';

export function getAuthProvider(): AuthProvider {
  return 'worker';
}

export function isWorkerAuthEnabled() {
  return true;
}

function workerAuthUrl() {
  return String(import.meta.env.VITE_WORKER_AUTH_URL || '').trim().replace(/\/+$/, '');
}

function emitWorkerAuthChange(user: WorkerAuthUser | null) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('apex-worker-auth-change', { detail: user }));
  }
}

async function workerRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${workerAuthUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  let data: unknown = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data
      ? String((data as { error?: unknown }).error || '')
      : '';
    throw new Error(message || `Authentication request failed (${response.status})`);
  }
  return data as T;
}

export async function getAuthSession() {
  const data = await workerRequest<{ user: WorkerAuthUser | null }>('/api/auth/session');
  return { provider: 'worker' as const, session: data.user ? { user: data.user } : null, user: data.user };
}

export async function signIn(email: string, password: string) {
  const data = await workerRequest<{ user: WorkerAuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  emitWorkerAuthChange(data.user);
  return { provider: 'worker' as const, session: { user: data.user }, user: data.user };
}

export async function signUp(email: string, password: string) {
  const data = await workerRequest<{ user: WorkerAuthUser }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  emitWorkerAuthChange(data.user);
  return { provider: 'worker' as const, session: { user: data.user }, user: data.user };
}

export async function signOut() {
  await workerRequest('/api/auth/logout', { method: 'POST' });
  emitWorkerAuthChange(null);
}