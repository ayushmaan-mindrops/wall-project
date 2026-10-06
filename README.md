# Mindrops: marble website with the wall visualizer

A catalogue-first marble website (Mindrops is the working company name). The visualizer is the hook on every slab:
**Collection → slab page → See it on your wall → Save / AI finish / Get a quote**.
Visitors can try the visualizer freely, since it runs on their own device and costs nothing.
Registration (SMS OTP through MSG91) is required to save designs, request quotes, and use the AI finish, which is limited per day to cap spend.

| Route | What it is |
|---|---|
| `/` | Hero (slab rack at true scale), collection with tone filter, before/after of the visualizer, trade, showroom |
| `/collection`, `/slab/:id` | Catalogue and slab detail, each with *See it on your wall* (`/visualize?slab=id`) and *Request a quote* |
| `/visualize` | The visualizer, plus sample rooms for visitors without a photo |
| `/designs` | Saved designs: download, get a quote, delete. A gallery, not a dashboard |

**Sign-in** is a side sheet with three steps (number, code, about you: name, city, role, optional email). It opens only at the moment it's needed, so a quote request resumes right after sign-in.
**Leads** arrive with the design image, slab, wall area and slab count. They're written to `data/leads.jsonl`, logged, and POSTed to `LEAD_WEBHOOK_URL` if set.

API (`server/router.ts`, SQLite in `data/`): OTP send/resend/verify, session cookie, profile, designs, leads,
and enhance (signed in, `AI_DAILY_LIMIT` a day). Without `MSG91_AUTHKEY`/`MSG91_TEMPLATE_ID`, dev mode shows the code on screen
(refused in production unless `OTP_TEST_MODE=1`). To reset the demo data, delete the `data/` folder.

Sample rooms in `public/rooms` are AI-generated illustrations (`node scripts/generate_sample_rooms.mjs`).
`bedroom-calacatta.*` is the visualizer's own output (exact render plus AI finish) on the sample bedroom.
Slab textures are AI-generated placeholders too: masters in `assets/slabs-src/`, web sizes from `python scripts/optimize_images.py`.

## Flow

After a photo loads, one progress card covers getting it ready, finding the main wall, tracing its edges, fitting around
furniture, and laying the marble. The visitor lands on **Choose the marble**. *Adjust the wall* (tap and brush) and
*Adjust the fit* (corners) are optional fixes. The **AI finish** also repairs the edges a visitor can't fix by hand:
Gemini is told to replace leftover patches of old paint, and its pixels are kept in a band around the wall plus nearby
wall-coloured gaps (`aiRegion()` in `src/lib/imageOps.ts`). Everything else stays exactly as photographed.

## Running in production

```bash
npm run build      # type-check, client build, SSR build, prerender, server bundle
npm start          # node dist-server/prod.js, on PORT (default 8080)
```

Or with Docker (mount a volume for `data/`, which holds accounts, designs and leads):

```bash
docker build --build-arg SITE_URL=https://www.example.com -t mindrops .
docker run -p 8080:8080 -v mindrops-data:/app/data --env-file .env.production mindrops
```

Host on anything that runs a Node container with a persistent disk (Railway, Render, Fly.io, a VPS), behind HTTPS.
For serverless hosting, move `server/db.ts` to Postgres first.

| Variable | Purpose |
|---|---|
| `SITE_URL` | Public origin, used **at build time** for canonical URLs, the sitemap and share images. Set it before `npm run build` |
| `GEMINI_API_KEY` / `GEMINI_IMAGE_MODEL` or `FAL_KEY` / `FAL_MODEL` | AI finish |
| `AI_DAILY_LIMIT` | AI finishes per account per day (default 3) |
| `MSG91_AUTHKEY`, `MSG91_TEMPLATE_ID` | SMS sign-in codes (needs a DLT-registered template in India) |
| `OTP_TEST_MODE=1` | Show codes on screen on a live server, for a demo without SMS. Never in real production |
| `OTP_DAILY_CAP` | Site-wide SMS codes per day (default 300), against SMS-pumping fraud |
| `TRUST_PROXY=1` | Behind a proxy or load balancer, take the client IP from `X-Forwarded-For` |
| `LEAD_WEBHOOK_URL` | Also POST each quote request here (Slack, Zapier, Make, Google Apps Script) |
| `VITE_GA_ID` | Google Analytics 4. Loads **only** after a visitor accepts analytics cookies |

### What's covered

- **SEO:** every page is prerendered with its content (`scripts/prerender.mjs`), with its own title, description,
  canonical URL, Open Graph and Twitter tags, and share image. Structured data: Store and WebSite on home, Product and
  BreadcrumbList on slab pages. Also `sitemap.xml`, `robots.txt` (blocks `/api` and `/designs`), noindex on private
  pages, real 404 status, `lang="en-IN"`, and a noscript fallback.
- **Privacy:** a cookie banner with *Accept all*, *Necessary only* and *Choose*, plus a footer link to change the choice
  later. Analytics is consent-gated (Consent Mode defaults to denied). Only two necessary cookies: `sid` (HttpOnly,
  SameSite=Lax, Secure in production) and the consent record. Privacy, terms and cookie pages are templates shaped
  around India's DPDP Act 2023; the AI finish and the sign-in screen disclose what is sent where.
- **Security:** a strict Content Security Policy, HSTS (on HTTPS), `X-Frame-Options: DENY`, `nosniff`,
  Referrer-Policy and Permissions-Policy, all in `server/security.ts`. Cross-origin isolation is on. ONNX Runtime is
  self-hosted, so no third-party scripts load. Request size limits, input validation, OTP throttles (per number, per IP,
  daily cap) and the AI quota protect the paid APIs. API keys never reach the browser.
- **Performance:** content prerendered, site CSS inlined, fonts self-hosted, preloaded and latin-only, the visualizer
  code-split and loaded only on `/visualize`. WebP images in three sizes, lazy-loaded below the fold, with explicit
  dimensions so nothing shifts. Brotli/gzip, immutable caching for hashed assets, 30-day caching for images.
- **PWA basics:** web manifest, SVG favicon and app icons (including maskable), theme colour.

Lighthouse on the production server (local, Lighthouse 12):

| Page | Mobile (Perf / A11y / Best / SEO) | Desktop |
|---|---|---|
| Home | 92 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Collection | 96 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Slab page | 97 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Visualizer | 89 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |

### Before launch

1. Real slab scans in `assets/slabs-src/`, then `python scripts/optimize_images.py`, and real sizes in `src/slabs.ts`.
2. Brand, showroom address and phone in `src/site/brand.ts`, and a real installation photo for the homepage.
3. Counsel reviews `src/site/Legal.tsx` (privacy, terms, cookies) and names a grievance officer.
4. MSG91 account with a DLT-approved OTP template. Remove `OTP_TEST_MODE`.
5. `SITE_URL` set, HTTPS on, domain verified in Google Search Console, then submit `sitemap.xml`.
6. Backups for the `data/` volume, or move to Postgres.

---

# The wall visualizer

Take or upload a photo of a wall, tap it, and see the client's marble slabs laid on it
at true size, in perspective, with the room's own light and shadows kept.

Wall finding and rendering run in the browser, with no GPU server. Photos leave the device only when the visitor saves a design or uses the AI finish.

```bash
npm install
npm run dev          # http://localhost:5173 (also on your LAN, for testing on a phone)
```

Use the sample rooms, or better, real phone photos, for testing.

## How it works

```
photo ─► 1. wall mask ─► 2. wall outline ─► 3. slab layout ─► 4. room lighting ─► composite
         SAM 2.1 (tap)    4 draggable        true-size slabs,   shading map from
         SegFormer (auto) corners →          bookmatch, joints  the original wall
                          homography
```

| Step | Where | Notes |
|---|---|---|
| Wall mask | `src/workers/segmentation.worker.ts` | **SAM 2.1 Hiera-tiny** (`onnx-community/sam2.1-hiera-tiny-ONNX`) via transformers.js. The photo is encoded once, and each tap only re-runs the small decoder (fast). **SegFormer-B2 ADE20K** handles "Find all walls for me" (ADE20K has a `wall` class). Uses WebGPU when available, otherwise multithreaded WASM. |
| Perspective | `src/lib/homography.ts` | Unit-square → quad projective map. The width is estimated from the outline and the user's wall height. |
| Rendering | `src/lib/renderer.ts` | One WebGL2 fragment shader: inverse homography → metres → slab cell → mirrored UVs for bookmatch → `textureGrad` (no mip seams) → joints → lighting. Switching slabs is instant. |
| Lighting | `src/lib/imageOps.ts` | Estimated only from pixels that look like bare wall (wall colour, or washed-out wall near a light), with local outliers like stencils, stickers and screw holes rejected, then normalised by the wall's geometric mean. Compressed in the shader, so falloff and shadows carry over without bleaching the stone. Light fixtures and anything the user removes stay in front of the marble. |

## Picking the wall

- **Find the wall for me:** SegFormer proposes every wall, the largest region wins, SAM is prompted at its deepest
  interior point, and the SAM reading that best matches the proposal becomes the selection.
- **Tap:** Add or Remove. An Add tap that lands on a leaf, cable or bulb snaps to the nearest bare wall. When the tap is
  on bare wall, only pixels that look like that wall are added, so SAM can't lump the plant in. A tap on a different
  surface (say, another wall colour) adds that surface as-is. Remove picks the object-sized reading.
- **Brush:** paints Add or Remove. Add strokes keep only bare-wall pixels, so you can scrub over a plant to fill the gaps
  between its leaves.
- Right-click does the opposite mode, and Ctrl/Cmd+Z undoes. The selection is an ordered list of edits (`App.tsx`),
  so undo just recomposes.
- Every result is cleaned up by `refineMask()`: grow into shadowed wall of the same hue, snap to real edges with a
  colour guided filter, and fill only specks or wall-coloured gaps.

Longer jobs (preparing the photo, finding the wall, AI finish) show a progress card (`useStepper`). Steps advance on
real events, are held on screen for a minimum time so they read clearly, and the AI wait is narrated on a typical
timeline.

## Photoreal finish (AI enhance)

Optional. Once the design is set, **Enhance with AI** sends the exact render to an image-edit model, which adds
polished-stone reflections, contact shadows and softer edges. The browser then keeps the AI pixels **only inside
the wall**, so the room stays exactly as photographed. If the model moved things around, it falls back to showing
the whole AI image and says so. Users can switch between **Exact slab** (true veining) and **AI finish** (impression).

1. `cp .env.example .env.local` and set **one** of:
   - `GEMINI_API_KEY`: Google Gemini image editing (default `gemini-3.1-flash-image`; `gemini-3-pro-image` for higher quality)
   - `FAL_KEY`: fal.ai open models (default `fal-ai/flux-pro/kontext`; `fal-ai/qwen-image-edit` also works)
2. Restart `npm run dev`. The button only appears when a key is configured.

Keys stay on the server: `server/enhance.ts` runs in the Vite dev server and as the Vercel function `api/enhance.ts`.
The prompt lives in `enhancePrompt()`. Tune it there, since it's the main lever on how faithful the result is.
`ENHANCE_MOCK=1` echoes the render back, for testing the flow without a key.

Models download from Hugging Face on first use (~70 MB for SAM, ~30 MB for SegFormer), then
come from the browser cache.

## Swapping in the client's slabs

1. Put flat, evenly lit, colour-calibrated slab photos in `assets/slabs-src/<id>.jpg`. Use landscape images
   cropped to the slab edge, ideally 2400 px or more on the long side.
2. Run `python scripts/optimize_images.py` to write the WebP sizes into `public/slabs/`.
3. Edit `src/slabs.ts` with the name, quarry, finish and **real slab size in mm**. The size drives scale,
   the slab count and the swatch proportions.

The current slabs are AI-generated placeholders (`npm run slabs` regenerates them with Gemini).

## Deploying

See **Running in production** above. The production server sends the cross-origin isolation headers the
multithreaded WASM path needs, along with the rest of the security headers. The camera capture input needs HTTPS on phones.

## Next steps

- **Auto corners:** fit the wall plane from Depth Anything V2 (also in transformers.js) instead of dragging corners.
- **More surfaces:** floors and countertops (both are ADE20K classes), each with its own outline.
- **Bigger SAM:** `sam2.1-hiera-small` or `base-plus` for cleaner edges on desktop.
