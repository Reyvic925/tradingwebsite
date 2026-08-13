import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  console.warn('[apex-prime] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  // Export a placeholder that delays throwing until the app actually tries to use Supabase.
  // This prevents the app from crashing during module import (which caused the blank page)
  // while still giving a clear error if any code attempts to call Supabase methods.
  const placeholder = new Proxy({}, {
    get() {
      return () => {
        throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      };
    }
  });
  export default placeholder as any;
}

const supabase = createClient(url, anon);

export default supabase;
