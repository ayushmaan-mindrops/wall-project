// Generate sample room photos (for visitors without a photo of their own) with
// Gemini image generation. Reads GEMINI_API_KEY from .env.local.
//
//   node scripts/generate_sample_rooms.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
if (!env.GEMINI_API_KEY) throw new Error('Set GEMINI_API_KEY in .env.local');
const model = env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';

const common = 'A realistic, unstaged smartphone photo taken at eye level, natural daylight, slightly imperfect like a real home. '
  + 'One large, plain, matte painted wall faces the camera and fills most of the frame, with its edges and the ceiling line visible. '
  + 'No art, shelves or text on the wall. No people. Photographic, not a render.';

const ROOMS = [
  { id: 'living', prompt: `A modern Indian apartment living room. A low TV unit and a fabric sofa in front of a warm off-white wall, a potted plant at one side. ${common}` },
  { id: 'bedroom', prompt: `A calm Indian apartment bedroom. A double bed with a simple upholstered headboard and two bedside tables in front of a pale grey wall. ${common}` },
  { id: 'dining', prompt: `A compact Indian apartment dining area. A six-seater wooden dining table and chairs in front of a light beige wall, a pendant lamp above. ${common}` },
];

mkdirSync('public/rooms', { recursive: true });
for (const room of ROOMS) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      model,
      input: [{ type: 'text', text: room.prompt }],
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '4:3', image_size: '1K' },
    }),
  });
  const body = await res.json();
  if (!res.ok) { console.error(room.id, res.status, JSON.stringify(body).slice(0, 300)); continue; }
  const find = (n) => {
    if (!n || typeof n !== 'object') return null;
    const inline = n.inlineData ?? n.inline_data;
    if (inline?.data) return inline.data;
    if (typeof n.data === 'string' && n.data.length > 1000) return n.data;
    for (const v of Object.values(n)) { const hit = Array.isArray(v) ? v.map(find).find(Boolean) : find(v); if (hit) return hit; }
    return null;
  };
  const data = find(body);
  if (!data) { console.error(room.id, 'no image in response'); continue; }
  writeFileSync(`public/rooms/${room.id}.jpg`, Buffer.from(data, 'base64'));
  console.log('wrote public/rooms/' + room.id + '.jpg');
}
