# Marble Wall Visualizer (prototype)

Take or upload a photo of a wall, tap it, and see the client's marble slabs laid on it
at true size, in perspective, with the room's own light and shadows kept.

Everything runs in the browser, with no backend and no GPU server. Photos never leave the device.

```bash
npm install
npm run dev          # http://localhost:5173 (also on your LAN, for testing on a phone)
```

`public/dev/test-room.jpg` is a synthetic room for quick testing. Real phone photos are the real test.

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

1. Put flat, evenly lit, colour-calibrated slab photos in `public/slabs/`. Use landscape images
   cropped to the slab edge, ideally 2400 px or more on the long side.
2. Edit `src/slabs.ts` with the name, quarry, finish and **real slab size in mm**. The size drives scale,
   the slab count and the rack swatch proportions.

The current slabs are procedural placeholders (`npm run slabs` regenerates them).

## Deploying

This is a static build (`npm run build` → `dist/`). For the fast multithreaded WASM path, serve with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

`vercel.json` already sets them for Vercel, and `api/enhance.ts` deploys as the enhance function (set the key in the
project's environment variables). The camera capture input needs HTTPS on phones.

## Next steps

- **Auto corners:** fit the wall plane from Depth Anything V2 (also in transformers.js) instead of dragging corners.
- **More surfaces:** floors and countertops (both are ADE20K classes), each with its own outline.
- **Lead capture:** "Send me this design" with the render, slab and slab count attached.
- **Bigger SAM:** `sam2.1-hiera-small` or `base-plus` for cleaner edges on desktop.
