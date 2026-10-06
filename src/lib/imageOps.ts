/** Load a user photo, downscaled so the long side is at most `maxSide`. */
export async function loadPhoto(file: Blob, maxSide = 1600): Promise<ImageData> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return ctx.getImageData(0, 0, w, h);
}

/** Separable box blur, in place, `passes` times (3 passes ≈ Gaussian). */
function boxBlur(src: Float32Array, w: number, h: number, r: number, passes = 3) {
  const tmp = new Float32Array(src.length);
  const norm = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc * norm;
        acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        src[y * w + x] = acc * norm;
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
}

/** Soften the mask edge by ~`radius` px so the marble doesn't look cut out. */
export function featherMask(mask: Uint8Array, w: number, h: number, radius = 1): Uint8Array {
  const f = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) f[i] = mask[i] ? 1 : 0;
  boxBlur(f, w, h, radius, 2);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.round(f[i] * 255);
  return out;
}

/**
 * Light fixtures on the wall (tube lights, lamps, sconces): blown-out,
 * near-white pixels, grown a little to take in their bright rim. These stay
 * in front of the marble instead of being clad over.
 */
export function lightFixtures(photo: ImageData, grow = 3): Uint8Array {
  const { width: W, height: H, data: px } = photo;
  const f = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    if (Math.min(r, g, b) >= 238 && Math.max(r, g, b) >= 250) f[i] = 1;
  }
  boxBlur(f, W, H, grow, 1);
  const out = new Uint8Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = f[i] > 0.02 ? 1 : 0;
  return out;
}

export interface ShadeMap {
  data: Uint8Array; // shade / 2, so 128 = unchanged
  w: number;
  h: number;
}

const lin = (v: number) => (v / 255) ** 2;
const median = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];

/**
 * Colour guided filter (He et al., 2010), the fast subsampled variant.
 * Smooths `p` while making its edges follow the edges of `photo`: used to
 * snap SAM's slightly conservative, blocky mask edge onto the real boundary
 * between wall and furniture, including thin things like leaves and cables.
 */
function guidedFilter(photo: ImageData, p: Float32Array, r: number, eps: number, sub = 2): Float32Array {
  const { width: W, height: H, data: px } = photo;
  const w = Math.ceil(W / sub), h = Math.ceil(H / sub), n = w * h;
  const rs = Math.max(1, Math.round(r / sub));

  // Downsample guide (RGB in 0..1) and input.
  const I = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const P = new Float32Array(n), cnt = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    const ly = Math.min(h - 1, (y / sub) | 0) * w;
    for (let x = 0; x < W; x++) {
      const j = ly + Math.min(w - 1, (x / sub) | 0), i = y * W + x;
      I[0][j] += px[i * 4] / 255; I[1][j] += px[i * 4 + 1] / 255; I[2][j] += px[i * 4 + 2] / 255;
      P[j] += p[i]; cnt[j]++;
    }
  }
  for (let j = 0; j < n; j++) { I[0][j] /= cnt[j]; I[1][j] /= cnt[j]; I[2][j] /= cnt[j]; P[j] /= cnt[j]; }

  const mean = (src: Float32Array) => { const m = src.slice(); boxBlur(m, w, h, rs, 1); return m; };
  const prod = (a: Float32Array, b: Float32Array) => { const m = new Float32Array(n); for (let j = 0; j < n; j++) m[j] = a[j] * b[j]; return mean(m); };

  const mI = I.map(mean), mP = mean(P);
  const mIP = I.map((c) => prod(c, P));
  const vRR = prod(I[0], I[0]), vRG = prod(I[0], I[1]), vRB = prod(I[0], I[2]);
  const vGG = prod(I[1], I[1]), vGB = prod(I[1], I[2]), vBB = prod(I[2], I[2]);

  const A = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], B = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const r0 = mI[0][j], g0 = mI[1][j], b0 = mI[2][j];
    const cR = mIP[0][j] - r0 * mP[j], cG = mIP[1][j] - g0 * mP[j], cB = mIP[2][j] - b0 * mP[j];
    const rr = vRR[j] - r0 * r0 + eps, rg = vRG[j] - r0 * g0, rb = vRB[j] - r0 * b0;
    const gg = vGG[j] - g0 * g0 + eps, gb = vGB[j] - g0 * b0, bb = vBB[j] - b0 * b0 + eps;
    // Inverse of the symmetric 3x3 covariance, by cofactors.
    const i00 = gg * bb - gb * gb, i01 = gb * rb - rg * bb, i02 = rg * gb - gg * rb;
    const i11 = rr * bb - rb * rb, i12 = rb * rg - rr * gb, i22 = rr * gg - rg * rg;
    const det = rr * i00 + rg * i01 + rb * i02;
    const aR = (i00 * cR + i01 * cG + i02 * cB) / det;
    const aG = (i01 * cR + i11 * cG + i12 * cB) / det;
    const aB = (i02 * cR + i12 * cG + i22 * cB) / det;
    A[0][j] = aR; A[1][j] = aG; A[2][j] = aB;
    B[j] = mP[j] - aR * r0 - aG * g0 - aB * b0;
  }
  const mA = A.map(mean), mB = mean(B);

  // Upsample the coefficients bilinearly and apply them to the full-res guide.
  const q = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) / sub - 0.5));
    const y0 = fy | 0, y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) / sub - 0.5));
      const x0 = fx | 0, x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const k00 = y0 * w + x0, k01 = y0 * w + x1, k10 = y1 * w + x0, k11 = y1 * w + x1;
      const lerp = (m: Float32Array) =>
        (m[k00] * (1 - tx) + m[k01] * tx) * (1 - ty) + (m[k10] * (1 - tx) + m[k11] * tx) * ty;
      const i = y * W + x;
      q[i] = lerp(mA[0]) * (px[i * 4] / 255) + lerp(mA[1]) * (px[i * 4 + 1] / 255) + lerp(mA[2]) * (px[i * 4 + 2] / 255) + lerp(mB);
    }
  }
  return q;
}

/**
 * SAM stops a few px short where the wall falls into shadow behind furniture,
 * leaving a rim of the old paint. Grow into neighbouring pixels of the wall's
 * hue and saturation, however dark. The guided filter that
 * follows smooths the stepped front this leaves.
 */
export interface WallColor {
  /** True if pixel i looks like bare wall (same hue and saturation, any brightness). */
  test: (i: number) => boolean;
  /** False for near-grey walls, where hue says little and growth is unsafe. */
  hasHue: boolean;
}

/** A colour model of the wall, learned from the pixels currently selected. */
export function wallColor(photo: ImageData, mask: Uint8Array): WallColor | null {
  const px = photo.data, N = photo.width * photo.height;
  const sr: number[] = [], sg: number[] = [];
  for (let i = 0; i < N; i += 7) {
    if (!mask[i]) continue;
    const sum = px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] + 1;
    sr.push(px[i * 4] / sum);
    sg.push(px[i * 4 + 1] / sum);
  }
  if (sr.length < 50) return null;
  const wr = median(sr) - 1 / 3, wg = median(sg) - 1 / 3;
  const wLen = Math.hypot(wr, wg);
  const chroma = (i: number) => {
    const sum = px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] + 1;
    return [px[i * 4] / sum - 1 / 3, px[i * 4 + 1] / sum - 1 / 3];
  };
  if (wLen < 0.03) {
    return { hasHue: false, test: (i) => { const [vr, vg] = chroma(i); return Math.hypot(vr - wr, vg - wg) < 0.025; } };
  }
  const cosMax = Math.cos((15 * Math.PI) / 180);
  return {
    hasHue: true,
    test: (i) => {
      const [vr, vg] = chroma(i);
      const len = Math.hypot(vr, vg);
      // Similar hue, and similar saturation: varnished wood or a lamp-lit room
      // beyond a doorway can share a cream wall's hue but are far more saturated.
      return len > 0.6 * wLen && len < 1.6 * wLen && (vr * wr + vg * wg) / (len * wLen) > cosMax;
    },
  };
}

function growIntoShadowedWall(photo: ImageData, out: Uint8Array, blocked: Uint8Array | null, steps: number) {
  const W = photo.width, H = photo.height;
  const model = wallColor(photo, out);
  if (!model?.hasHue) return; // a near-grey wall has no hue to follow
  const isWall = model.test;  let frontier: number[] = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!out[i] && (out[i - 1] || out[i + 1] || out[i - W] || out[i + W])) frontier.push(i);
    }
  }
  for (let s = 0; s < steps && frontier.length; s++) {
    const next: number[] = [];
    for (const i of frontier) {
      if (out[i] || (blocked && blocked[i]) || !isWall(i)) continue;
      out[i] = 1;
      const x = i % W, y = (i / W) | 0;
      if (x > 0 && !out[i - 1]) next.push(i - 1);
      if (x < W - 1 && !out[i + 1]) next.push(i + 1);
      if (y > 0 && !out[i - W]) next.push(i - W);
      if (y < H - 1 && !out[i + W]) next.push(i + W);
    }
    frontier = next;
  }
}

export interface RefinedMask {
  mask: Uint8Array; // 0/1, for estimates and outlines
  alpha: Uint8Array; // 0..255 soft edge, for compositing
}

/**
 * Tidy SAM's mask before cladding:
 *  - snap its edge to the photo's real edges (guided filter), so no rim of
 *    the old paint shows around furniture and leaves get a clean outline
 *  - fill pinholes such as screw holes and specks
 *  - keep `blocked` pixels out (light fixtures, anything the user removed)
 */
export function refineMask(photo: ImageData, mask: Uint8Array, blocked: Uint8Array | null): RefinedMask {
  const { width: W, height: H } = photo;
  const N = W * H;
  const grown = mask.slice();
  if (blocked) for (let i = 0; i < N; i++) if (blocked[i]) grown[i] = 0;
  growIntoShadowedWall(photo, grown, blocked, Math.round(Math.max(W, H) / 100));
  const p = new Float32Array(N);
  for (let i = 0; i < N; i++) p[i] = grown[i];

  const soft = guidedFilter(photo, p, Math.max(4, Math.round(Math.max(W, H) / 160)), 1e-3);
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = soft[i] > 0.5 && !(blocked && blocked[i]) ? 1 : 0;
  const fixtures = blocked;
  // Fill enclosed gaps: specks and screw holes (tiny), or small gaps that are
  // themselves bare wall. A bulb or a sticker the selection surrounds stays.
  const maxHole = Math.max(16, Math.round(N * 0.0005));
  const tinyHole = Math.max(8, Math.round(N * 0.00004));
  const model = wallColor(photo, out);
  const seen = new Uint8Array(N);
  const stack: number[] = [];
  const region: number[] = [];
  for (let s = 0; s < N; s++) {
    if (out[s] || seen[s]) continue;
    region.length = 0;
    let touchesEdge = false, isFixture = false;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      region.push(i);
      const x = i % W, y = (i / W) | 0;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchesEdge = true;
      if (fixtures && fixtures[i]) isFixture = true;
      if (x > 0 && !out[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < W - 1 && !out[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && !out[i - W] && !seen[i - W]) { seen[i - W] = 1; stack.push(i - W); }
      if (y < H - 1 && !out[i + W] && !seen[i + W]) { seen[i + W] = 1; stack.push(i + W); }
    }
    if (touchesEdge || isFixture || region.length > maxHole) continue;
    let fill = region.length <= tinyHole;
    if (!fill && model) {
      let wall = 0;
      for (const i of region) if (model.test(i)) wall++;
      fill = wall / region.length > 0.6;
    }
    if (fill) for (const i of region) out[i] = 1;
  }

  // Soft edge: the guided filter's own transition, clipped to the binary mask
  // grown by a pixel, so filled holes are solid and blocked pixels stay out.
  const alpha = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (blocked && blocked[i]) continue;
    const a = out[i] ? (soft[i] < 0.5 ? 1 : soft[i]) : soft[i]; // filled holes are solid
    alpha[i] = Math.round(Math.min(1, Math.max(0, (a - 0.25) * 2)) * 255);
  }
  return { mask: out, alpha };
}

/**
 * The wall's lighting relative to its typical brightness: falloff from
 * windows and lamps, shadows behind furniture. Multiplying it onto the marble
 * keeps the room's light, which is what makes the stone look installed.
 *
 * Brightness alone can't tell light from paint: a white stencil on a pink wall
 * would read as a hotspot. So only pixels that look like the bare wall vote:
 *  1. pixels close to the wall's dominant colour (stencils, frames, stickers drop out)
 *  2. pixels close to the local lighting estimate (whatever is left of the pattern drops out)
 */
export function shadingMap(photo: ImageData, mask: Uint8Array, fixtures: Uint8Array | null = null, target = 384): ShadeMap {
  const { width: W, height: H, data: px } = photo;
  const s = Math.max(1, Math.max(W, H) / target);
  const w = Math.max(1, Math.round(W / s));
  const h = Math.max(1, Math.round(H / s));
  const N = W * H;

  // Per-pixel luminance and chromaticity.
  const L = new Float32Array(N);
  const cr = new Float32Array(N);
  const cg = new Float32Array(N);
  const sampR: number[] = [], sampG: number[] = [], sampL: number[] = [];
  for (let i = 0; i < N; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    L[i] = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const sum = r + g + b + 1;
    cr[i] = r / sum;
    cg[i] = g / sum;
    if (mask[i] && (i & 7) === 0) { sampR.push(cr[i]); sampG.push(cg[i]); sampL.push(L[i]); }
  }
  if (sampR.length === 0) return { data: new Uint8Array([128]), w: 1, h: 1 };
  const wallR = median(sampR), wallG = median(sampG), wallL = median(sampL);
  // Over-exposure pushes the wall's colour towards white, so a pixel on the
  // line from the wall colour to neutral may just be brightly lit wall.
  const nR = 1 / 3 - wallR, nG = 1 / 3 - wallG;
  const nLen2 = nR * nR + nG * nG || 1e-6;

  const lowIndex = new Int32Array(N);
  for (let y = 0; y < H; y++) {
    const ly = Math.min(h - 1, Math.floor(y / s)) * w;
    for (let x = 0; x < W; x++) lowIndex[y * W + x] = ly + Math.min(w - 1, Math.floor(x / s));
  }

  // How close each spot is to a light fixture. Only there can a washed-out,
  // near-white pixel be trusted as brightly lit wall rather than white paint.
  const near = new Float32Array(w * h);
  if (fixtures) {
    for (let i = 0; i < N; i++) if (fixtures[i]) near[lowIndex[i]] += 1 / (s * s);
    boxBlur(near, w, h, Math.max(2, Math.round(Math.max(w, h) * 0.08)));
    let peak = 0;
    for (let j = 0; j < w * h; j++) peak = Math.max(peak, near[j]);
    for (let j = 0; j < w * h; j++) near[j] = peak > 0 ? Math.min(1, near[j] / (0.25 * peak)) : 0;
  }

  // Weight of each pixel in the lighting estimate.
  const weight = new Float32Array(N);
  const sigmaC = 0.025;
  for (let i = 0; i < N; i++) {
    if (!mask[i] || L[i] > 0.93 || L[i] < 0.002) continue;
    const vr = cr[i] - wallR, vg = cg[i] - wallG;
    // Washed out only counts as lit if it's also brighter than the wall
    // (a dark TV bracket near the light is grey too, but it isn't light).
    const allow = L[i] > wallL ? near[lowIndex[i]] : 0;
    const t = Math.min(allow, Math.max(0, (vr * nR + vg * nG) / nLen2));
    const dr = vr - t * nR, dg = vg - t * nG;
    // Light also tints the wall (a cool tube turns pink lavender), so near a
    // fixture the colour tolerance widens; the brightness pass below still
    // rejects real objects there.
    const sig = sigmaC + 0.06 * allow;
    weight[i] = Math.exp(-(dr * dr + dg * dg) / (2 * sig * sig)) * (1 - 0.6 * t);
  }
  const base = weight.slice();

  const r = Math.max(2, Math.round(Math.max(w, h) / 110));
  const estimate = (wt: Float32Array) => {
    const A = new Float32Array(w * h), B = new Float32Array(w * h);
    let logSum = 0, wSum = 0;
    for (let i = 0; i < N; i++) {
      const k = wt[i];
      if (k <= 0) continue;
      const j = lowIndex[i];
      A[j] += k * L[i];
      B[j] += k;
      logSum += k * Math.log(L[i]);
      wSum += k;
    }
    // Typical wall brightness: geometric mean, so one hotspot doesn't set it.
    const typical = wSum > 0 ? Math.exp(logSum / wSum) : 0.25;
    const cell = s * s;
    for (let j = 0; j < w * h; j++) { A[j] /= cell; B[j] /= cell; }
    // Where nothing voted (a TV bracket, a poster), borrow the light from the
    // nearest scale that has votes: r, then 2r, 4r, 8r, then "no change".
    const eps = 0.03;
    let S = new Float32Array(w * h).fill(typical);
    for (const k of [8, 4, 2, 1]) {
      const a = A.slice(), b = B.slice();
      boxBlur(a, w, h, r * k);
      boxBlur(b, w, h, r * k);
      const next = new Float32Array(w * h);
      for (let j = 0; j < w * h; j++) next[j] = (a[j] + eps * S[j]) / (b[j] + eps);
      S = next;
    }
    return { S, typical };
  };

  // Iteratively reweighted: pixels far from the local lighting estimate
  // (stencils, screw holes, the odd sticker) lose their vote. Smooth glow
  // survives because its neighbours agree with it.
  const sigmaL = 0.3; // in log brightness: about ±35%
  let est = estimate(weight);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) {
      if (base[i] <= 0) continue;
      const d = Math.log(L[i] / est.S[lowIndex[i]]);
      weight[i] = base[i] * Math.exp(-(d * d) / (2 * sigmaL * sigmaL));
    }
    est = estimate(weight);
  }
  const { S, typical } = est;

  const data = new Uint8Array(w * h);
  for (let j = 0; j < w * h; j++) {
    data[j] = Math.round(Math.min(2, Math.max(0, S[j] / typical)) * 127.5);
  }
  return { data, w, h };
}

/** Rasterise a brush stroke (image px) into a photo-sized 0/1 mask. */
export function rasterStroke(points: [number, number][], radius: number, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H);
  const stamp = (cx: number, cy: number) => {
    const r2 = radius * radius;
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(H - 1, Math.ceil(cy + radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(W - 1, Math.ceil(cx + radius)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) out[y * W + x] = 1;
      }
    }
  };
  if (points.length === 1) stamp(points[0][0], points[0][1]);
  for (let k = 1; k < points.length; k++) {
    const [x0, y0] = points[k - 1], [x1, y1] = points[k];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(1, radius / 3)));
    for (let t = 0; t <= n; t++) stamp(x0 + ((x1 - x0) * t) / n, y0 + ((y1 - y0) * t) / n);
  }
  return out;
}

/** Keep only the pixels of `region` that look like bare wall; null if too few do. */
export function keepWallPixels(region: Uint8Array, model: WallColor, minShare = 0.03): Uint8Array | null {
  let total = 0, kept = 0;
  const out = new Uint8Array(region.length);
  for (let i = 0; i < region.length; i++) {
    if (!region[i]) continue;
    total++;
    if (model.test(i)) { out[i] = 1; kept++; }
  }
  return total > 0 && kept / total >= minShare ? out : null;
}

/** Share of `region`'s pixels outside `exclude` that look like bare wall (sampled). */
export function wallShare(region: Uint8Array, exclude: Uint8Array | null, model: WallColor): number {
  let total = 0, wall = 0;
  for (let i = 0; i < region.length; i += 3) {
    if (!region[i] || (exclude && exclude[i])) continue;
    total++;
    if (model.test(i)) wall++;
  }
  return total ? wall / total : 0;
}

/** Nearest unselected bare-wall pixel to (x, y) within `radius`, or null. */
export function snapToWall(x: number, y: number, radius: number, W: number, H: number, selected: Uint8Array, model: WallColor): [number, number] | null {
  let best: [number, number] | null = null, bestD = Infinity;
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy;
      if (d > radius * radius || d >= bestD) continue;
      const px = Math.round(x + dx), py = Math.round(y + dy);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = py * W + px;
      if (!selected[i] && model.test(i)) { best = [px, py]; bestD = d; }
    }
  }
  return best;
}

/**
 * The main wall in a semantic "wall" mask: its largest connected region, and
 * the point deepest inside it (the safest place to prompt SAM).
 */
export function mainWall(mask: Uint8Array, W: number, H: number, step = 4) {
  const w = Math.ceil(W / step), h = Math.ceil(H / step), n = w * h;
  const low = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) low[y * w + x] = mask[Math.min(H - 1, y * step) * W + Math.min(W - 1, x * step)];

  const label = new Int32Array(n).fill(-1);
  let bestLabel = -1, bestSize = 0, next = 0;
  const stack: number[] = [];
  for (let s = 0; s < n; s++) {
    if (!low[s] || label[s] >= 0) continue;
    let size = 0;
    label[s] = next; stack.push(s);
    while (stack.length) {
      const i = stack.pop()!; size++;
      const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && low[j] && label[j] < 0) { label[j] = next; stack.push(j); }
      }
    }
    if (size > bestSize) { bestSize = size; bestLabel = next; }
    next++;
  }
  if (bestLabel < 0 || bestSize < n * 0.02) return null;

  // Chamfer distance to the region's edge; the maximum is its deepest point.
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) dist[i] = label[i] === bestLabel ? 1e9 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!dist[i]) continue;
    dist[i] = Math.min(dist[i], x > 0 ? dist[i - 1] + 1 : 1, y > 0 ? dist[i - w] + 1 : 1);
  }
  let peak = 0, at = 0;
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!dist[i]) continue;
    dist[i] = Math.min(dist[i], x < w - 1 ? dist[i + 1] + 1 : 1, y < h - 1 ? dist[i + w] + 1 : 1);
    if (dist[i] > peak) { peak = dist[i]; at = i; }
  }
  const region = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (label[Math.min(h - 1, (y / step) | 0) * w + Math.min(w - 1, (x / step) | 0)] === bestLabel) region[y * W + x] = 1;
  }
  return { region, point: [(at % w) * step + step / 2, ((at / w) | 0) * step + step / 2] as [number, number] };
}

/** Intersection over union of two 0/1 masks (sampled). */
export function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (a[i] || b[i]) { union++; if (a[i] && b[i]) inter++; }
  }
  return union ? inter / union : 0;
}