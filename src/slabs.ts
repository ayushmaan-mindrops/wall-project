export interface Slab {
  id: string;
  name: string;
  origin: string;
  finish: 'Polished' | 'Honed' | 'Leathered';
  /** Slab size in mm, long side first. */
  sizeMm: [number, number];
  image: string;
}

// Placeholder catalogue: swap the images for the client's flat, colour-calibrated
// slab scans and the sizes for their actual stock.
export const SLABS: Slab[] = [
  { id: 'calacatta-oro', name: 'Calacatta Oro', origin: 'Carrara, Italy', finish: 'Polished', sizeMm: [3200, 1650], image: '/slabs/calacatta-oro.jpg' },
  { id: 'statuario', name: 'Statuario', origin: 'Carrara, Italy', finish: 'Polished', sizeMm: [3000, 1800], image: '/slabs/statuario.jpg' },
  { id: 'carrara', name: 'Bianco Carrara', origin: 'Carrara, Italy', finish: 'Honed', sizeMm: [2900, 1700], image: '/slabs/carrara.jpg' },
  { id: 'nero-marquina', name: 'Nero Marquina', origin: 'Markina, Spain', finish: 'Polished', sizeMm: [2800, 1600], image: '/slabs/nero-marquina.jpg' },
  { id: 'emperador', name: 'Emperador Dark', origin: 'Murcia, Spain', finish: 'Leathered', sizeMm: [2700, 1500], image: '/slabs/emperador.jpg' },
  { id: 'verde-alpi', name: 'Verde Alpi', origin: 'Aosta Valley, Italy', finish: 'Polished', sizeMm: [2600, 1500], image: '/slabs/verde-alpi.jpg' },
];

export const GLOSS: Record<Slab['finish'], number> = { Polished: 1, Honed: 0.25, Leathered: 0.1 };
