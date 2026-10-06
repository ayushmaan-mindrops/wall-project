// Generate photorealistic placeholder slab textures with Gemini, replacing the
// procedural ones. Still placeholders: swap for the client's real slab scans.
//
//   node scripts/generate_slab_textures.mjs [id ...]   then: python scripts/optimize_images.py
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const model = env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';

const shot = 'Straight-on orthographic studio scan of a single polished natural stone slab surface, filling the entire frame edge to edge, '
  + 'evenly lit, no shadows, no reflections, no background, no border, no text, no perspective. Photographic texture reference, ultra detailed, true colours.';
const SLABS = {
  'calacatta-oro': 'Calacatta Oro marble: warm creamy white background with bold, flowing grey veins and fine threads of gold, irregular and natural.',
  'statuario': 'Statuario marble: bright white background with dramatic soft grey and charcoal veining in broad diagonal sweeps, natural and irregular.',
  'carrara': 'Bianco Carrara marble, honed: soft grey-white background with fine feathery light grey veins and subtle cloudy texture.',
  'nero-marquina': 'Nero Marquina marble: deep black background with crisp, thin, branching white calcite veins.',
  'emperador': 'Emperador Dark marble: rich chocolate brown with a dense web of cream and amber veins and darker brown fragments.',
  'verde-alpi': 'Verde Alpi marble: deep forest green with a web of pale green and white veins and darker green breccia patches.',
};

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SLABS);
const find = (n) => {
  if (!n || typeof n !== 'object') return null;
  const inline = n.inlineData ?? n.inline_data;
  if (inline?.data) return inline.data;
  if (typeof n.data === 'string' && n.data.length > 1000) return n.data;
  for (const v of Object.values(n)) { const hit = Array.isArray(v) ? v.map(find).find(Boolean) : find(v); if (hit) return hit; }
  return null;
};
await Promise.all(ids.map(async (id) => {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      model,
      input: [{ type: 'text', text: `${SLABS[id]} ${shot}` }],
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '2K' },
    }),
  });
  const body = await res.json();
  const data = res.ok && find(body);
  if (!data) { console.error(id, res.status, JSON.stringify(body).slice(0, 200)); return; }
  writeFileSync(`assets/slabs-src/${id}.jpg`, Buffer.from(data, 'base64'));
  console.log('wrote', id);
}));
