import { createSeededRng } from '../../sim/rng.ts';
import { TILE_PX } from './look.ts';

/** RGBA pixels, bottom row first (GL order). */
export interface PixelImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export type TileKind = 'grass' | 'dirt' | 'wood' | 'crowd';
export type SceneryKind = 'tree' | 'bush' | 'flag';

export const PALETTES: Readonly<Record<TileKind, readonly string[]>> = {
  grass: ['#3d7a3a', '#356b33', '#4a8a43', '#5c9e4c'],
  dirt: ['#b98a5a', '#a97b4e', '#c79a68', '#8f6740'],
  wood: ['#7a5a3a', '#6a4c30', '#8c6a46', '#4e3824'],
  // seats, two skin tones, then shirts
  crowd: ['#4e4e5e', '#e0b48a', '#8d5a3b', '#e53935', '#1e88e5', '#fdd835', '#43a047', '#ffffff'],
};

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

function image(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  /** (x, y) with y from the TOP, so drawing code reads naturally; stored bottom row first. */
  const set = (x: number, y: number, hex: string) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = ((height - 1 - y) * width + x) * 4;
    const [r, g, b] = rgb(hex);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };
  const img: PixelImage = { width, height, data };
  return { img, set };
}

/** Pick an index with integer weights that sum to 100. */
function weighted(roll: number, weights: readonly number[]): number {
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]!;
    if (roll < acc) return i;
  }
  return weights.length - 1;
}

/** A tiling pixel-art texture. */
export function pixelTexture(
  kind: TileKind,
  seed: number,
  width: number = TILE_PX,
  height: number = TILE_PX,
): PixelImage {
  const rng = createSeededRng(seed);
  const pal = PALETTES[kind];
  const { img, set } = image(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const roll = rng.nextInt(100);
      if (kind === 'grass') set(x, y, pal[weighted(roll, [60, 25, 12, 3])]!);
      else if (kind === 'dirt') set(x, y, pal[weighted(roll, [55, 25, 15, 5])]!);
      else if (kind === 'wood') {
        // 4 px planks with a dark seam, light grain flecks.
        const seam = y % 4 === 3;
        set(x, y, seam ? pal[3]! : roll < 10 ? pal[2]! : pal[(y >> 2) % 2]!);
      } else set(x, y, pal[0]!);
    }
  }
  if (kind === 'crowd') {
    // 2-wide people every 4 px, rows of 8 px: head 2x2, body 2x3.
    for (let row = 0; row * 8 < height; row++) {
      for (let col = 0; col * 4 < width; col++) {
        if (rng.nextInt(10) === 0) continue; // an empty seat
        const x = col * 4 + 1;
        const y = row * 8 + 2;
        const skin = pal[1 + rng.nextInt(2)]!;
        const shirt = pal[3 + rng.nextInt(5)]!;
        for (let dx = 0; dx < 2; dx++) {
          for (let dy = 0; dy < 2; dy++) set(x + dx, y + dy, skin);
          for (let dy = 2; dy < 5; dy++) set(x + dx, y + dy, shirt);
        }
      }
    }
  }
  return img;
}

/** Pixel-art scenery cut-outs with transparent backgrounds. */
export function scenerySprite(kind: SceneryKind, seed: number): PixelImage {
  const rng = createSeededRng(seed);
  if (kind === 'tree') {
    const { img, set } = image(24, 32);
    for (let y = 22; y < 32; y++) for (let x = 10; x < 14; x++) set(x, y, '#5a3b22');
    const blobs = [
      [12, 10, 9],
      [7, 15, 6],
      [17, 15, 6],
    ] as const;
    for (let y = 0; y < 24; y++) {
      for (let x = 1; x < 23; x++) {
        const inside = blobs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
        if (!inside) continue;
        // Light from the top-left: lighter up there, darker bottom-right, a few flecks.
        const shade = x + y < 18 ? '#5c9e4c' : x + y > 30 ? '#24521f' : '#3d7a3a';
        set(x, y, rng.nextInt(12) === 0 ? '#4a8a43' : shade);
      }
    }
    return img;
  }
  if (kind === 'bush') {
    const { img, set } = image(16, 10);
    for (let y = 1; y < 10; y++) {
      for (let x = 1; x < 15; x++) {
        if (((x - 7.5) / 7) ** 2 + ((y - 6) / 5) ** 2 > 1) continue;
        set(x, y, y < 5 ? '#4a8a43' : rng.nextInt(6) === 0 ? '#5c9e4c' : '#356b33');
      }
    }
    return img;
  }
  const { img, set } = image(10, 24);
  for (let y = 2; y < 24; y++) set(1, y, '#dddddd');
  const cloth = ['#e53935', '#1e88e5', '#fdd835'][rng.nextInt(3)]!;
  for (let y = 2; y < 8; y++)
    for (let x = 2; x < 9; x++) set(x, y, (x + y) % 5 ? cloth : '#ffffff');
  return img;
}

/** 1 px wide vertical gradient: `top` colour at the top, `bottom` at the bottom. */
export function gradient(top: string, bottom: string, height: number): PixelImage {
  const { img, set } = image(1, height);
  const a = rgb(top);
  const b = rgb(bottom);
  for (let y = 0; y < height; y++) {
    const f = height === 1 ? 0 : y / (height - 1);
    const c = a.map((v, i) => Math.round(v + (b[i]! - v) * f));
    set(0, y, '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''));
  }
  return img;
}
