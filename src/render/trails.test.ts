import { describe, expect, it } from 'vitest';
import { COSMETICS } from '../shop/cosmetics.ts';
import { TRAIL_STYLES, drawMark, type TrailShape } from './trails.ts';

describe('TRAIL_STYLES', () => {
  it('styles every trail in the shop, with #rrggbb colours and lifts for every sample', () => {
    for (const c of COSMETICS.filter((x) => x.slot === 'trail')) {
      const s = TRAIL_STYLES[c.code];
      expect(s, c.code).toBeDefined();
      for (let i = 0; i <= 8; i++) {
        for (const t of [0, 0.37, 12.5, 90]) {
          expect(s!.color(i, t), c.code).toMatch(/^#[0-9a-f]{6}$/);
        }
        expect(s!.lift(i)).toBeGreaterThanOrEqual(0);
        expect(s!.hd.lift(i)).toBeGreaterThan(0);
      }
      expect(s!.hd.size).toBeGreaterThan(0);
    }
  });
  it('dust and sparkle keep their old 2D look', () => {
    const dust = TRAIL_STYLES['trail:dust']!;
    const sparkle = TRAIL_STYLES['trail:sparkle']!;
    expect([dust.shape, dust.color(3, 5), dust.lift(3)]).toEqual(['dash', '#a39382', 0]);
    expect(sparkle.shape).toBe('dot');
    expect([0, 1, 2, 3].map((i) => sparkle.lift(i))).toEqual([6, 8, 10, 6]);
    expect([sparkle.color(0, 0), sparkle.color(1, 0)]).toEqual(['#ffd54f', '#ffffff']);
  });
});

describe('drawMark', () => {
  const rects = (shape: TrailShape) => {
    const out: number[][] = [];
    const ctx = { fillRect: (...a: number[]) => void out.push(a) };
    drawMark(ctx as unknown as CanvasRenderingContext2D, shape, 10, 20, 2);
    return out;
  };
  it('dash and dot are the old dust and sparkle pixels', () => {
    expect(rects('dash')).toEqual([[8, 18, 4, 2]]);
    expect(rects('dot')).toEqual([[10, 20, 2, 2]]);
  });
  it('heart and ring are 4 rects each, scaled by size', () => {
    expect(rects('heart')).toEqual([
      [8, 18, 2, 2],
      [12, 18, 2, 2],
      [8, 20, 6, 2],
      [10, 22, 2, 2],
    ]);
    expect(rects('ring')).toEqual([
      [10, 18, 2, 2],
      [8, 20, 2, 2],
      [12, 20, 2, 2],
      [10, 22, 2, 2],
    ]);
  });
});
