import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Capture this before the Supabase client consumes the URL fragment. It lets the
// UI distinguish an email-confirmation callback from an ordinary signed-in visit.
export const isSignupConfirmationCallback = typeof window !== 'undefined'
  && new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type') === 'signup';

const missingMsg = 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';

let supabase: any;

if (url && anon) {
  supabase = createClient(url, anon);
} else {
  console.warn('[apex-prime] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — running in local demo mode with an in-memory backend.');

  // Local demo mode: no Supabase project configured. Provides a persistent guest
  // session so the app is fully explorable against the local in-memory API.
  // The user id / token must match the constants in api-handlers/dev-db.js.
  const DEMO_KEY = 'apex_demo_session';
  const demoUser = {
    id: 'demo-local-user',
    email: 'demo@apex.local',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'demo' },
    user_metadata: { full_name: 'Local Demo Trader', is_admin: true },
    created_at: new Date().toISOString(),
  };
  const newDemoSession = () => ({
    access_token: 'local-demo-token',
    refresh_token: 'local-demo-refresh',
    token_type: 'bearer' as const,
    expires_in: 365 * 86400,
    expires_at: Math.floor(Date.now() / 1000) + 365 * 86400,
    user: demoUser,
  });

  const listeners: Array<(event: string, session: unknown | null) => void> = [];
  const notify = (event: string, session: unknown | null) => {
    listeners.forEach((cb) => cb(event, session));
  };

  const readDemoSession = () => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DEMO_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.access_token ? parsed : null;
    } catch {
      return null;
    }
  };

  const writeDemoSession = (session: unknown | null) => {
    try {
      if (session) localStorage.setItem(DEMO_KEY, JSON.stringify(session));
      else localStorage.removeItem(DEMO_KEY);
    } catch { /* storage unavailable — session stays in-memory */ }
  };

  let memorySession: unknown | null = readDemoSession();
  let pendingDemoSignup = false;

  const placeholder = {
    auth: {
      async getSession() {
        return { data: { session: memorySession }, error: null };
      },
      onAuthStateChange(callback: (event: string, session: unknown | null) => void) {
        listeners.push(callback);
        return { data: { subscription: { unsubscribe() { const i = listeners.indexOf(callback); if (i >= 0) listeners.splice(i, 1); } } } };
      },
      async signInWithPassword(_creds: unknown) {
        memorySession = newDemoSession();
        writeDemoSession(memorySession);
        notify('SIGNED_IN', memorySession);
        return { data: { session: memorySession, user: demoUser }, error: null };
      },
      async signUp(_creds: unknown) {
        // Match Supabase when its Confirm email setting is enabled: registration
        // creates the user but grants no session until its email is verified.
        pendingDemoSignup = true;
        return { data: { session: null, user: demoUser }, error: null };
      },
      async verifyOtp({ token, token_hash, type, email }: { token?: string; token_hash?: string; type?: string; email?: string }) {
        // Support both direct OTP (token) and email link verification (token_hash)
        const verificationCode = token_hash || token;
        
        if (!pendingDemoSignup || type !== 'email' || !verificationCode) {
          return { data: { session: null, user: null }, error: new Error('Invalid or expired verification code.') };
        }
        
        // In demo mode, accept 12345678 (8 digits per current Supabase docs)
        if (verificationCode !== '12345678') {
          return { data: { session: null, user: null }, error: new Error('Invalid or expired verification code.') };
        }
        
        pendingDemoSignup = false;
        memorySession = newDemoSession();
        writeDemoSession(memorySession);
        notify('SIGNED_IN', memorySession);
        return { data: { session: memorySession, user: demoUser }, error: null };
      },
      async resend({ type }: { type?: string }) {
        if (type !== 'signup' || !pendingDemoSignup) return { error: new Error('No pending email confirmation.') };
        return { error: null };
      },
      async signInWithIdToken(_opts: unknown) {
        memorySession = newDemoSession();
        writeDemoSession(memorySession);
        notify('SIGNED_IN', memorySession);
        return { data: { session: memorySession, user: demoUser }, error: null };
      },
      async setSession(session: unknown) {
        memorySession = session;
        writeDemoSession(session);
        notify('SIGNED_IN', session);
        return { data: { session }, error: null };
      },
      async signOut() {
        memorySession = null;
        writeDemoSession(null);
        notify('SIGNED_OUT', null);
        return { error: null };
      },
    },
  } as any;

  supabase = new Proxy(placeholder, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      // For any other property access, return a function that throws with a clear message
      return () => {
        throw new Error(missingMsg);
      };
    }
  });
}

export default supabase as any;
