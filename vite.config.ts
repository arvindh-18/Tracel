import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/** Serves POST /api/trace in development, reading GEMINI_API_KEY from .env (server side only). */
function aiTraceApi(env: Record<string, string>): Plugin {
  return {
    name: 'tracel-ai-trace-api',
    configureServer(server) {
      server.middlewares.use('/api/trace', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return send(405, { error: { code: 'bad_request', message: 'Use POST.' } });
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 200_000) return send(413, { error: { code: 'bad_request', message: 'Request too large.' } });
        }
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return send(400, { error: { code: 'bad_request', message: 'Body must be JSON.' } });
        }
        // Loaded through Vite so the TypeScript handler and its imports work in dev.
        const { handleTraceRequest, clientIp } = (await server.ssrLoadModule('/src/server/traceHandler.ts')) as typeof import('./src/server/traceHandler');
        const out = await handleTraceRequest(body, {
          apiKey: env.GEMINI_API_KEY,
          model: env.GEMINI_MODEL,
          ip: clientIp(req.headers, req.socket.remoteAddress),
        });
        send(out.status, out.body);
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), aiTraceApi(loadEnv(mode, process.cwd(), ''))],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  optimizeDeps: {
    exclude: ['web-tree-sitter'],
  },
}));
