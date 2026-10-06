import { type Quad, invert, squareToQuad, toColumnMajor } from './homography';
import type { ShadeMap } from './imageOps';

export interface RenderParams {
  quad: Quad;
  wallM: [number, number]; // wall width, height in metres
  slabM: [number, number]; // slab width, height in metres (landscape)
  vertical: boolean; // stand slabs on their short edge
  bookmatch: boolean;
  jointMm: number;
  light: number; // 0..1, exponent on the room's lighting (0 = flat, 1 = as photographed)
  gloss: number; // 0..1
  tint: boolean; // show the selection tint instead of marble
  split: number; // 0..1, original shown right of this x; 1 = all marble
}

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_photo, u_mask, u_shade, u_slab;
uniform mat3 u_hinv;
uniform vec2 u_size, u_wall, u_cell;
uniform bool u_vertical, u_bookmatch, u_tint;
uniform float u_joint, u_light, u_gloss, u_split;

vec3 toLin(vec3 c) { return c * c; }
vec3 toSrgb(vec3 c) { return sqrt(max(c, 0.0)); }
// Soft shoulder so lit white stone rolls off like a photo instead of clipping.
vec3 shoulder(vec3 c) {
  const float k = 0.75;
  return mix(c, k + (1.0 - k) * (1.0 - exp(-(c - k) / (1.0 - k))), step(k, c));
}

void main() {
  vec4 photo = texture(u_photo, v_uv);
  float m = texture(u_mask, v_uv).r;
  if (m < 0.004 || v_uv.x > u_split) { o = photo; return; }

  if (u_tint) {
    // Selection: a brass wash plus a crisp outline along the soft edge.
    vec3 c = mix(photo.rgb, vec3(0.66, 0.52, 0.31), 0.42 * m);
    float edge = 1.0 - abs(m * 2.0 - 1.0);
    c = mix(c, vec3(0.99, 0.88, 0.62), smoothstep(0.45, 0.85, edge));
    o = vec4(c, 1.0);
    return;
  }

  vec3 q = u_hinv * vec3(v_uv * u_size, 1.0);
  vec2 metres = (q.xy / q.z) * u_wall;
  vec2 cell = metres / u_cell;          // continuous slab coordinates
  vec2 idx = floor(cell);
  vec2 f = cell - idx;

  vec2 st = f;
  if (u_bookmatch) {
    if (mod(idx.x, 2.0) > 0.5) st.x = 1.0 - st.x;
    if (mod(idx.y, 2.0) > 0.5) st.y = 1.0 - st.y;
  }
  // Mip selection comes from the continuous coordinate so tile seams stay clean.
  vec2 dx = dFdx(cell), dy = dFdy(cell);
  vec2 tc = st, tdx = dx, tdy = dy;
  if (u_vertical) {
    tc = vec2(st.y, 1.0 - st.x);
    tdx = vec2(dx.y, -dx.x);
    tdy = vec2(dy.y, -dy.x);
  }
  vec3 stone = toLin(textureGrad(u_slab, tc, tdx, tdy).rgb);

  // Room lighting, compressed: marble is far less matte than paint, and a
  // hard multiply turns dark stone muddy and light stone chalky.
  float shade = max(texture(u_shade, v_uv).r * 2.0, 0.02);
  float s = clamp(pow(shade, u_light), 0.35, 1.45);
  stone *= s;
  // Polished stone: a faint sheen of the light colour where the wall is lit,
  // scaled by the stone's own brightness so dark stone doesn't go grey.
  float lum = dot(stone, vec3(0.2126, 0.7152, 0.0722));
  stone += u_gloss * 0.05 * smoothstep(1.05, 1.45, s) * (0.3 + lum);

  // Joints between slabs, antialiased.
  vec2 jw = vec2(u_joint) / u_cell * 0.5;
  vec2 edge = min(f, 1.0 - f);
  vec2 fw = fwidth(cell);
  vec2 j2 = 1.0 - smoothstep(jw - fw * 0.5, jw + fw * 0.5, edge);
  float joint = max(j2.x, j2.y) * step(0.00001, u_joint);
  stone = mix(stone, stone * 0.55, joint);

  o = vec4(mix(photo.rgb, toSrgb(shoulder(stone)), m), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
  return s;
}

export class WallRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: Record<'photo' | 'mask' | 'shade' | 'slab', WebGLTexture>;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private size: [number, number] = [1, 1];

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error('This browser does not support WebGL2.');
    this.gl = gl;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    for (const name of ['u_hinv', 'u_size', 'u_wall', 'u_cell', 'u_vertical', 'u_bookmatch', 'u_tint',
      'u_joint', 'u_light', 'u_gloss', 'u_split', 'u_photo', 'u_mask', 'u_shade', 'u_slab']) {
      this.loc[name] = gl.getUniformLocation(prog, name);
    }
    const mk = (unit: number, sampler: string) => {
      const t = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(this.loc[sampler], unit);
      return t;
    };
    this.tex = { photo: mk(0, 'u_photo'), mask: mk(1, 'u_mask'), shade: mk(2, 'u_shade'), slab: mk(3, 'u_slab') };
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.setMask(new Uint8Array([0]), 1, 1);
    this.setShade({ data: new Uint8Array([128]), w: 1, h: 1 });
  }

  private bind(name: keyof WallRenderer['tex']) {
    const unit = { photo: 0, mask: 1, shade: 2, slab: 3 }[name];
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.tex[name]);
  }

  setPhoto(img: ImageData) {
    const gl = this.gl;
    this.size = [img.width, img.height];
    this.canvas.width = img.width;
    this.canvas.height = img.height;
    gl.viewport(0, 0, img.width, img.height);
    this.bind('photo');
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }

  setMask(mask: Uint8Array, w: number, h: number) {
    const gl = this.gl;
    this.bind('mask');
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, mask);
  }

  setShade(s: ShadeMap) {
    const gl = this.gl;
    this.bind('shade');
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, s.w, s.h, 0, gl.RED, gl.UNSIGNED_BYTE, s.data);
  }

  setSlab(img: HTMLImageElement) {
    const gl = this.gl;
    this.bind('slab');
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  }

  render(p: RenderParams) {
    const gl = this.gl, l = this.loc;
    gl.useProgram(this.prog);
    gl.uniformMatrix3fv(l.u_hinv, false, toColumnMajor(invert(squareToQuad(p.quad))));
    gl.uniform2f(l.u_size, this.size[0], this.size[1]);
    gl.uniform2f(l.u_wall, p.wallM[0], p.wallM[1]);
    const cell = p.vertical ? [p.slabM[1], p.slabM[0]] : p.slabM;
    gl.uniform2f(l.u_cell, cell[0], cell[1]);
    gl.uniform1i(l.u_vertical, p.vertical ? 1 : 0);
    gl.uniform1i(l.u_bookmatch, p.bookmatch ? 1 : 0);
    gl.uniform1i(l.u_tint, p.tint ? 1 : 0);
    gl.uniform1f(l.u_joint, p.jointMm / 1000);
    gl.uniform1f(l.u_light, p.light);
    gl.uniform1f(l.u_gloss, p.gloss);
    gl.uniform1f(l.u_split, p.split);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
