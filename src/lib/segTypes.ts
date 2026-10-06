export interface TapPoint {
  x: number; // image px
  y: number;
  label: 0 | 1; // 1 = part of the wall, 0 = not
}

export type SegRequest =
  | { type: 'warmup' }
  | { type: 'setImage'; pixels: ArrayBuffer; width: number; height: number }
  | { type: 'decode'; id: number; point: TapPoint }
  | { type: 'auto'; id: number };

export type SegResponse =
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'progress'; model: string; file: string; loaded: number; total: number }
  | { type: 'status'; status: 'encoding' | 'encoded' | 'auto' }
  | { type: 'mask'; id: number; mask: Uint8Array; w: number; h: number; score: number }
  | { type: 'candidates'; id: number; masks: Uint8Array; scores: number[]; w: number; h: number }
  | { type: 'error'; message: string; request: SegRequest['type'] };
