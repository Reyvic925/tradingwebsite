import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import type { Connect, Plugin, ViteDevServer } from 'vite'

// Serves the Vercel-style API functions (api/index.js router) inside the Vite
// dev/preview server so relative /api/* calls work locally without a deployment.
function localApiPlugin(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use('/api', (req: any, res: any, next: any) => {
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

      const handlerPath = path.join(process.cwd(), 'api', 'index.js');
      import(pathToFileURL(handlerPath).href).then((m) => {
        const handler = m?.default || m?.handler || m;
        if (typeof handler !== 'function') {
          res.statusCode = 500;
          return res.end('API handler is not a function');
        }
        Promise.resolve(handler(req, res)).catch((err) => {
          console.error('[api]', err);
          if (!res.writableEnded) { res.statusCode = 500; res.end('Internal Server Error'); }
        });
      }).catch(next);
    });
  };

  return {
    name: 'apex-local-api',
    configResolved() {
      // Expose server-side env vars (.env: Supabase keys, admin secret) to the
      // Node process running the API handlers. Existing process env wins.
      const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
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
  const plugins: Plugin[] = [react(), tailwindcss(), localApiPlugin()];
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
