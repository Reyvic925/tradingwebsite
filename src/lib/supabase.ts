import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const missingMsg = 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';

let supabase: any;

if (url && anon) {
  supabase = createClient(url, anon);
} else {
  console.warn('[apex-prime] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');

  // Provide a minimal placeholder that implements the auth methods the app uses
  // so code like `supabase.auth.getSession()` and `supabase.auth.onAuthStateChange(...)` do not throw
  // during module import. Other Supabase methods will throw a clear error when invoked.
  const placeholder = {
    auth: {
      async getSession() {
        // Return a session-shaped value so callers can handle unauthenticated state gracefully
        return { data: { session: null } };
      },
      onAuthStateChange(_callback: any) {
        // Return an object with a subscription that has an unsubscribe method
        return { data: { subscription: { unsubscribe() {} } } };
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
