import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  console.warn('[apex-prime] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

// Create the Supabase client if both env vars are present, otherwise provide a lazy-throwing proxy.
const supabase = (url && anon)
  ? createClient(url, anon)
  : new Proxy({}, {
      get() {
        return () => {
          throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        };
      }
    });

export default supabase as any;
