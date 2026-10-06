/**
 * Production server: the API, the built site with prerendered pages, gzip/brotli,
 * long-lived caching for hashed assets, security headers and proper 404s.
 * No dependencies beyond Node 22+.
 *
 *   npm run build && npm start        (PORT, default 8080)
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { brotliCompressSync, gzipSync, constants as zc } from 'node:zlib';
import { handleApi, type ApiEnv } from './router';
import { securityHeaders } from './security';

for (const file of ['.env.production', '.env.local', '.env']) {
  if (existsSync(file)) { process.loadEnvFile(file); break; }
}
process.env.NODE_ENV ??= 'production';
const env = process.env as ApiEnv & { PORT?: string; SITE_URL?: string; VITE_GA_ID?: string };

const DIST = join(process.cwd(), 'dist');
const PORT = Number(env.PORT ?? 8080);
const HEADERS = securityHeaders({ https: (env.SITE_URL ?? '').startsWith('https://'), analytics: Boolean(env.VITE_GA_ID) });

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.wasm', '.txt', '.xml']);

// Files are immutable once built, so compress each one once.
const cache = new Map<string, { raw: Buffer; br?: Buffer; gz?: Buffer; mtime: number }>();
function load(file: string) {
  const mtime = statSync(file).mtimeMs;
  let entry = cache.get(file);
  if (!entry || entry.mtime !== mtime) {
    const raw = readFileSync(file);
    entry = { raw, mtime };
    if (COMPRESSIBLE.has(extname(file)) && raw.length > 1024) {
      entry.br = brotliCompressSync(raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 9 } });
      entry.gz = gzipSync(raw, { level: 9 });
    }
    cache.set(file, entry);
  }
  return entry;
}

function resolveStatic(urlPath: string): string | null {
  const file = normalize(join(DIST, decodeURIComponent(urlPath)));
  if (!file.startsWith(DIST + sep)) return null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

function pageFile(urlPath: string): string | null {
  const clean = urlPath.replace(/\/+$/, '');
  const candidate = join(DIST, clean, 'index.html');
  if (normalize(candidate).startsWith(DIST) && existsSync(candidate)) return candidate;
  return null;
}

const server = createServer(async (req, res) => {
  for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);
  try {
    if (await handleApi(req, res, env)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://local');
    let file = resolveStatic(url.pathname);
    let status = 200;
    if (!file || file.endsWith('.html')) {
      file = pageFile(url.pathname) ?? file;
      if (!file) { file = join(DIST, '404.html'); status = 404; }
    }
    const ext = extname(file);
    const entry = load(file);
    res.statusCode = status;
    res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
    res.setHeader('Cache-Control',
      url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable'
        : ext === '.html' ? 'no-cache'
          : /^\/(slabs|rooms|fonts|icons|ort)\//.test(url.pathname) ? 'public, max-age=2592000, stale-while-revalidate=86400'
            : 'public, max-age=86400');
    res.setHeader('Vary', 'Accept-Encoding');
    const accept = String(req.headers['accept-encoding'] ?? '');
    let body = entry.raw;
    if (entry.br && /\bbr\b/.test(accept)) { body = entry.br; res.setHeader('Content-Encoding', 'br'); }
    else if (entry.gz && /\bgzip\b/.test(accept)) { body = entry.gz; res.setHeader('Content-Encoding', 'gzip'); }
    res.setHeader('Content-Length', body.length);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  }
});

server.listen(PORT, () => console.log(`Mindrops running on http://localhost:${PORT}`));
