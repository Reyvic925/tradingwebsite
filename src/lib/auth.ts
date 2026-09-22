import supabase from './supabase';

export type WorkerAuthUser = {
  id: string;
  email: string;
  created_at: string;
  user_metadata?: Record<string, unknown>;
};

export type WorkerAuthSession = { user: WorkerAuthUser };
export type AuthProvider = 'supabase' | 'worker';

function configuredProvider(): AuthProvider {
  return String(import.meta.env.VITE_AUTH_PROVIDER || '').trim().toLowerCase() === 'worker'
    ? 'worker'
    : 'supabase';
}

export function getAuthProvider(): AuthProvider {
  if (typeof window !== 'undefined') {
    const localHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (localHost) {
      const override = new URLSearchParams(window.location.search).get('auth')?.toLowerCase();
      if (override === 'worker') return 'worker';
      if (override === 'supabase') return 'supabase';
    }
  }
  return configuredProvider();
}

export function isWorkerAuthEnabled() {
  return getAuthProvider() === 'worker';
}

function workerAuthUrl() {
  return String(import.meta.env.VITE_WORKER_AUTH_URL || '').trim().replace(/\/+$/, '');
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
  if (!isWorkerAuthEnabled()) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return { provider: 'supabase' as const, session: data.session, user: data.session?.user ?? null };
  }
  const data = await workerRequest<{ user: WorkerAuthUser | null }>('/api/auth/session');
  return { provider: 'worker' as const, session: data.user ? { user: data.user } : null, user: data.user };
}

export async function signIn(email: string, password: string) {
  if (!isWorkerAuthEnabled()) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { provider: 'supabase' as const, session: data.session, user: data.user };
  }
  const data = await workerRequest<{ user: WorkerAuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return { provider: 'worker' as const, session: { user: data.user }, user: data.user };
}

export async function signUp(email: string, password: string) {
  if (!isWorkerAuthEnabled()) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return { provider: 'supabase' as const, session: data.session, user: data.user };
  }
  const data = await workerRequest<{ user: WorkerAuthUser }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return { provider: 'worker' as const, session: { user: data.user }, user: data.user };
}

export async function signOut() {
  if (!isWorkerAuthEnabled()) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return;
  }
  await workerRequest('/api/auth/logout', { method: 'POST' });
}