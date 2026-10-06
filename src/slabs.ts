export type Tone = 'White' | 'Black' | 'Warm' | 'Green';

export interface Slab {
  id: string;
  name: string;
  origin: string;
  finish: 'Polished' | 'Honed' | 'Leathered';
  /** Slab size in mm, long side first. */
  sizeMm: [number, number];
  thicknessMm: number[];
  tone: Tone;
  description: string;
  image: string; // full texture (2400 px), for the visualizer
  large: string; // 1400 px, for the slab page
  thumb: string; // small WebP, for cards and swatches
}

// Placeholder catalogue: swap the images for the client's flat, colour-calibrated
// slab scans, and the sizes and copy for their actual stock.
export const SLABS: Slab[] = [
  {
    id: 'calacatta-oro', name: 'Calacatta Oro', origin: 'Carrara, Italy', finish: 'Polished',
    sizeMm: [3200, 1650], thicknessMm: [18, 20, 30], tone: 'White',
    description: 'A warm white ground crossed by bold grey veins with threads of gold. Made for feature walls and bookmatched panels.',
    image: '/slabs/calacatta-oro.webp', large: '/slabs/large/calacatta-oro.webp', thumb: '/slabs/thumb/calacatta-oro.webp',
  },
  {
    id: 'statuario', name: 'Statuario', origin: 'Carrara, Italy', finish: 'Polished',
    sizeMm: [3000, 1800], thicknessMm: [18, 20], tone: 'White',
    description: 'Bright, almost luminous white with dramatic charcoal veining. The classic choice for a statement wall behind a bed or a TV.',
    image: '/slabs/statuario.webp', large: '/slabs/large/statuario.webp', thumb: '/slabs/thumb/statuario.webp',
  },
  {
    id: 'carrara', name: 'Bianco Carrara', origin: 'Carrara, Italy', finish: 'Honed',
    sizeMm: [2900, 1700], thicknessMm: [18, 20, 30], tone: 'White',
    description: 'Soft grey-white with fine, feathery veins. Quiet enough for large areas, and honed to a gentle satin.',
    image: '/slabs/carrara.webp', large: '/slabs/large/carrara.webp', thumb: '/slabs/thumb/carrara.webp',
  },
  {
    id: 'nero-marquina', name: 'Nero Marquina', origin: 'Markina, Spain', finish: 'Polished',
    sizeMm: [2800, 1600], thicknessMm: [18, 20], tone: 'Black',
    description: 'Deep black with crisp white veins. Polished to a mirror depth that turns a wall into the centre of the room.',
    image: '/slabs/nero-marquina.webp', large: '/slabs/large/nero-marquina.webp', thumb: '/slabs/thumb/nero-marquina.webp',
  },
  {
    id: 'emperador', name: 'Emperador Dark', origin: 'Murcia, Spain', finish: 'Leathered',
    sizeMm: [2700, 1500], thicknessMm: [18, 20], tone: 'Warm',
    description: 'Chocolate brown laced with cream and amber veins. The leathered finish brings out its texture under the hand.',
    image: '/slabs/emperador.webp', large: '/slabs/large/emperador.webp', thumb: '/slabs/thumb/emperador.webp',
  },
  {
    id: 'verde-alpi', name: 'Verde Alpi', origin: 'Aosta Valley, Italy', finish: 'Polished',
    sizeMm: [2600, 1500], thicknessMm: [18, 20], tone: 'Green',
    description: 'Forest green with a web of pale veins. Rich in a bathroom or a study, and unexpected anywhere else.',
    image: '/slabs/verde-alpi.webp', large: '/slabs/large/verde-alpi.webp', thumb: '/slabs/thumb/verde-alpi.webp',
  },
];

export const slabById = (id: string | null | undefined) => SLABS.find((s) => s.id === id);

export const GLOSS: Record<Slab['finish'], number> = { Polished: 1, Honed: 0.25, Leathered: 0.1 };
