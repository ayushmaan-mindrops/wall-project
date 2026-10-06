// After `vite build` and the SSR build of src/entry-server.tsx: write every
// route's HTML with its content and <head> filled in (search engines and link
// previews see real pages; visitors see content before the JS arrives), plus
// a 404 page, sitemap.xml and robots.txt.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

for (const file of ['.env.production', '.env.local', '.env']) {
  if (existsSync(file)) { process.loadEnvFile(file); break; }
}
const site = (process.env.SITE_URL || 'http://localhost:8080').replace(/\/+$/, '');
if (!process.env.SITE_URL) console.warn('SITE_URL is not set; canonical URLs and the sitemap point at http://localhost:8080.');

const { render, allPages, notFoundMeta } = await import(pathToFileURL(join(process.cwd(), 'dist-ssr', 'entry-server.js')).href);
const dist = join(process.cwd(), 'dist');
// Inline the site stylesheet (about 5 KB compressed): one less render-blocking request.
const template = readFileSync(join(dist, 'index.html'), 'utf8').replace(
  /<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>/,
  (_, href) => `<style>${readFileSync(join(dist, href), 'utf8')}</style>`,
);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function head(p) {
  const url = site + (p.path === '/404' ? '' : p.path);
  const image = site + (p.image ?? '/og.jpg');
  return [
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}" />`,
    `<meta name="robots" content="${p.noindex ? 'noindex, nofollow' : 'index, follow'}" />`,
    ...(p.noindex ? [] : [`<link rel="canonical" href="${url}" />`]),
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Mindrops" />',
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    '<meta property="og:locale" content="en_IN" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    ...(p.jsonLd ?? []).map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`),
  ].join('\n    ');
}

// App pages (the visualizer, your designs) are interactive and per-visitor:
// prerender their <head> only and let the browser render the body.
const APP_ROUTES = new Set(['/visualize', '/designs']);

function page(meta, url) {
  const html = template.replace(/<!--page-meta-->[\s\S]*<!--\/page-meta-->/, head(meta));
  return APP_ROUTES.has(url) ? html : html.replace('<div id="root"></div>', `<div id="root">${render(url)}</div>`);
}

const pages = allPages(site);
for (const p of pages) {
  const file = p.path === '/' ? join(dist, 'index.html') : join(dist, p.path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page(p, p.path));
}
writeFileSync(join(dist, '404.html'), page(notFoundMeta, '/404-not-found'));

const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(dist, 'sitemap.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...pages.filter((p) => !p.noindex).map((p) => `  <url><loc>${site}${p.path}</loc><lastmod>${today}</lastmod></url>`),
  '</urlset>',
].join('\n'));
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /designs\n\nSitemap: ${site}/sitemap.xml\n`);
console.log(`prerendered ${pages.length} pages (+404) for ${site}`);
