/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKER_AUTH_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
