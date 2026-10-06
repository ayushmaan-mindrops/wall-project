/** A wall outline in image pixels, clockwise from top-left: TL, TR, BR, BL. */
export type Quad = [[number, number], [number, number], [number, number], [number, number]];

/** Row-major 3x3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/**
 * Projective map from the unit square to `quad` (Heckbert, 1989).
 * (0,0)->TL, (1,0)->TR, (1,1)->BR, (0,1)->BL.
 */
export function squareToQuad(quad: Quad): Mat3 {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;

  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    return [x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0, 1];
  }
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  return [
    x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
    y1 - y0 + g * y1, y3 - y0 + h * y3, y0,
    g, h, 1,
  ];
}

export function invert(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const s = 1 / det;
  return [
    A * s, -(b * i - c * h) * s, (b * f - c * e) * s,
    B * s, (a * i - c * g) * s, -(a * f - c * d) * s,
    C * s, -(a * h - b * g) * s, (a * e - b * d) * s,
  ];
}

/** Column-major copy for gl.uniformMatrix3fv. */
export function toColumnMajor(m: Mat3): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

/**
 * Rough wall aspect (width / height) from the outline's edge lengths.
 * Good enough for near-frontal photos; the user can override the width.
 */
export function estimateAspect(quad: Quad): number {
  const len = (p: [number, number], q: [number, number]) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const top = len(quad[0], quad[1]), bottom = len(quad[3], quad[2]);
  const left = len(quad[0], quad[3]), right = len(quad[1], quad[2]);
  return (top + bottom) / Math.max(left + right, 1e-6);
}

/** Axis-aligned outline around the set pixels of a mask, or a centred default. */
export function quadFromMask(mask: Uint8Array, w: number, h: number): Quad {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    minX = w * 0.2; maxX = w * 0.8; minY = h * 0.2; maxY = h * 0.8;
  }
  return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
}
