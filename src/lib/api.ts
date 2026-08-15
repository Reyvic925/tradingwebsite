import supabase from './supabase';

const REF_KEY = 'apex_ref';

export function persistReferral(code?: string | null) {
  if (code) localStorage.setItem(REF_KEY, code.toUpperCase());
}

export function takeReferral(): string | null {
  const code = localStorage.getItem(REF_KEY);
  return code || null;
}

export function clearReferral() {
  localStorage.removeItem(REF_KEY);
}

export async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const fallback = text.trim();
    if (res.ok) return { error: fallback || 'Invalid server response' };
    return { error: fallback || `Request failed (${res.status})` };
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: await authHeaders() });
  const data = (await readBody(res)) as { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function apiList<T>(path: string): Promise<T[]> {
  try {
    const data = await apiGet<unknown>(path);
    if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
      return (data as { items: T[] }).items;
    }
    return asList<T>(data);
  } catch {
    return [];
  }
}

export type MarketPage<T> = { items: T[]; total: number; limit: number; offset: number };

export async function apiMarkets<T>(params: Record<string, string | number | undefined> = {}): Promise<MarketPage<T>> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== 'all') qs.set(k, String(v));
  });
  const path = `/api/markets${qs.toString() ? `?${qs}` : ''}`;
  try {
    const data = await apiGet<unknown>(path);
    if (Array.isArray(data)) return { items: data as T[], total: data.length, limit: data.length, offset: 0 };
    const page = data as Partial<MarketPage<T>>;
    return {
      items: asList<T>(page.items),
      total: Number(page.total || 0),
      limit: Number(page.limit || 0),
      offset: Number(page.offset || 0),
    };
  } catch {
    return { items: [], total: 0, limit: 0, offset: 0 };
  }
}

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: await authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await readBody(res)) as { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export async function bootstrapProfile(extra: Record<string, unknown> = {}) {
  const referred_by = extra.referred_by ?? takeReferral();
  const data = await apiSend<{ profile: unknown; wallet: unknown }>('/api/profile', 'POST', {
    ...extra,
    referred_by: referred_by || null,
  });
  if (referred_by) clearReferral();
  return data;
}
