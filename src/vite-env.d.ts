/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_AUTH_PROXY: string;
  readonly VITE_AUTH_PROVIDER?: 'supabase' | 'worker';
  readonly VITE_WORKER_AUTH_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
