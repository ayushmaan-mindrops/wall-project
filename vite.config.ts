import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, enhance, enhanceAvailable, type EnhanceEnv } from './server/enhance';

const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

/** Serves /api/enhance from the dev and preview servers, with keys from .env.local. */
function enhanceApi(env: EnhanceEnv): Plugin {
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = req.url?.split('?')[0];
    if (path === '/api/enhance/status' && req.method === 'GET') return send(res, 200, { available: enhanceAvailable(env) });
    if (path !== '/api/enhance' || req.method !== 'POST') return next();
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      send(res, 200, await enhance(JSON.parse(raw), env));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      send(res, status, { error: e instanceof Error ? e.message : String(e) });
    }
  };
  return {
    name: 'enhance-api',
    configureServer: (s) => { s.middlewares.use(handler); },
    configurePreviewServer: (s) => { s.middlewares.use(handler); },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') as EnhanceEnv;
  return {
    plugins: [react(), enhanceApi(env)],
    // transformers.js ships its own WASM/ONNX runtime; don't let Vite pre-bundle it.
    optimizeDeps: { exclude: ['@huggingface/transformers'] },
    worker: { format: 'es' },
    // Cross-origin isolation lets ONNX Runtime use multithreaded WASM, which makes
    // the wall finder several times faster on phones without WebGPU.
    server: { host: true, headers: isolation },
    preview: { headers: isolation },
  };
});
