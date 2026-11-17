import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// @ts-expect-error The shared Vercel API entry point has no TypeScript declarations.
import apiHandler from './api/index.js'
import type { Connect, Plugin, ViteDevServer } from 'vite'

// Serves the Vercel-style API functions (api/index.js router) inside the Vite
// dev/preview server so relative /api/* calls work locally without a deployment.
function localApiPlugin(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use((req: any, res: any, next: any) => {
      if (!String(req.url || '').startsWith('/api/')) return next();

      if (typeof res.status !== 'function') {
        res.status = (code: number) => { res.statusCode = code; return res; };
      }
      if (typeof res.json !== 'function') {
        res.json = (payload: unknown) => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(payload));
          return res;
        };
      }

      Promise.resolve().then(() => apiHandler(req, res)).catch((err) => {
        console.error('[api]', err);
        if (!res.writableEnded) { res.statusCode = 500; res.end('Internal Server Error'); }
      });
    });
  };

  return {
    name: 'apex-local-api',
    configResolved() {
      // Only expose the Worker endpoint required by the API proxy.
      const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), 'WORKER_API_URL');
      if (process.env.WORKER_API_URL === undefined && env.WORKER_API_URL) {
        process.env.WORKER_API_URL = env.WORKER_API_URL;
      }
    },
    configureServer(server: ViteDevServer) {
      attach(server.middlewares);
    },
    configurePreviewServer(server: any) {
      attach(server.middlewares);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react(), tailwindcss(), localApiPlugin()];
  try {
    // @ts-ignore
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch {}

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
  }
})
