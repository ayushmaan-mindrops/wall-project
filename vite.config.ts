import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { handleApi, type ApiEnv } from './server/router.ts';
import { securityHeaders } from './server/security.ts';

// Serves /api/* from the dev and preview servers, with keys from .env.local.
function api(env: ApiEnv): Plugin {
  const mount = (s: { middlewares: Connect.Server }) => {
    s.middlewares.use(async (req, res, next) => { if (!(await handleApi(req, res, env))) next(); });
  };
  return { name: 'site-api', configureServer: mount, configurePreviewServer: mount };
}

/**
 * Self-host ONNX Runtime's WebAssembly runtime under /ort/ instead of letting it
 * load from the jsDelivr CDN: no third-party script at runtime, a tighter CSP,
 * and no outage if the CDN is blocked.
 */
function ortRuntime(): Plugin {
  const src = join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist');
  const files = () => readdirSync(src).filter((f) => /^ort-wasm-simd-threaded.*\.(mjs|wasm)$/.test(f));
  return {
    name: 'ort-runtime',
    configureServer(s) {
      s.middlewares.use((req, res, next) => {
        const m = /^\/ort\/([\w.-]+)$/.exec(req.url?.split('?')[0] ?? '');
        if (!m || !existsSync(join(src, m[1]))) return next();
        res.setHeader('Content-Type', m[1].endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        // ONNX Runtime starts its threads from these files; in a cross-origin-isolated
        // page a worker script without these headers is blocked, silently.
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        res.end(readFileSync(join(src, m[1])));
      });
    },
    closeBundle() {
      const out = join(process.cwd(), 'dist', 'ort');
      mkdirSync(out, { recursive: true });
      for (const f of files()) copyFileSync(join(src, f), join(out, f));
    },
  };
}

export default defineConfig(({ mode, isSsrBuild }) => {
  const env = loadEnv(mode, process.cwd(), '') as ApiEnv & { VITE_GA_ID?: string };
  const headers = securityHeaders({ https: false, analytics: Boolean(env.VITE_GA_ID) });
  return {
    plugins: [react(), api(env), ...(isSsrBuild ? [] : [ortRuntime()])],
    // transformers.js ships its own WASM/ONNX runtime; don't let Vite pre-bundle it.
    optimizeDeps: { exclude: ['@huggingface/transformers'] },
    worker: { format: 'es' },
    build: { chunkSizeWarningLimit: 1200 },
    // Dev keeps only cross-origin isolation (a strict CSP would block Vite's HMR);
    // preview serves the full production header set.
    server: { host: true, headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' } },
    preview: { headers },
  };
});
