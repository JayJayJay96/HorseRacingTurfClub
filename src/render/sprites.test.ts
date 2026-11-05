import { describe, expect, it } from 'vitest';
import { COSMETICS } from '../shop/cosmetics.ts';
import { CELL, FRAMES, POSES } from './hd2d/sheet.ts';
import { colorsOf, type HorseColors } from './palette.ts';
import { drawHorse, poseOf } from './sprites.ts';

describe('poseOf', () => {
  it('uses side views when running mostly sideways', () => {
    expect(poseOf(5, 1)).toBe('side-right');
    expect(poseOf(-5, -1)).toBe('side-left');
  });
  it('uses 3/4 views when running mostly up or down the screen', () => {
    expect(poseOf(1, -5)).toBe('away');
    expect(poseOf(-1, 5)).toBe('toward');
  });
});

type Rect = { fill: string; x: number; y: number; w: number; h: number };

/** Records each fillRect in canvas pixels, with drawHorse's translate + scale applied. */
function recorder() {
  const rects: Rect[] = [];
  let fill = '';
  let tx = 0;
  let ty = 0;
  let sx = 1;
  let sy = 1;
  const ctx = {
    get fillStyle() {
      return fill;
    },
    set fillStyle(v: string) {
      fill = v;
    },
    save() {},
    restore() {
      tx = ty = 0;
      sx = sy = 1;
    },
    translate(x: number, y: number) {
      tx = x;
      ty = y;
    },
    scale(x: number, y: number) {
      sx = x;
      sy = y;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      const x0 = tx + sx * x;
      const x1 = tx + sx * (x + w);
      rects.push({ fill, x: Math.min(x0, x1), y: ty + sy * y, w: Math.abs(x1 - x0), h: sy * h });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
}

/** What drawHorse paints in one CELL (hooves at the cell foot), at size 1. */
function paint(colors: HorseColors, frame: number, pose: (typeof POSES)[number]) {
  const r = recorder();
  drawHorse(r.ctx, CELL.footX, CELL.footY, colors, frame, pose, 1);
  return r.rects;
}

const codes = (slot: string) => COSMETICS.filter((c) => c.slot === slot).map((c) => c.code);

describe('drawHorse patterns', () => {
  it('every pattern adds pixels in every pose and frame, and no two look the same', () => {
    for (const pose of POSES) {
      for (let f = 0; f < FRAMES; f++) {
        const plain = paint(colorsOf(0), f, pose).length;
        const looks = new Set<string>();
        for (const code of codes('pattern')) {
          const extra = paint({ ...colorsOf(0), pattern: code }, f, pose).slice(plain);
          expect(extra.length, `${code} ${pose} ${f}`).toBeGreaterThan(0);
          looks.add(JSON.stringify(extra));
        }
        expect(looks.size, `${pose} ${f}`).toBe(codes('pattern').length);
      }
    }
  });
});
describe('drawHorse caps', () => {
  const inCell = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= CELL.w && r.y + r.h <= CELL.h;

  it('every cap adds at least 2 px, differs from the others, and stays inside the cell', () => {
    for (const pose of POSES) {
      for (let f = 0; f < FRAMES; f++) {
        const plain = paint(colorsOf(0), f, pose).length;
        const looks = new Set<string>();
        for (const code of codes('cap')) {
          const all = paint({ ...colorsOf(0), cap: code }, f, pose);
          const extra = all.slice(plain);
          expect(
            extra.reduce((a, r) => a + r.w * r.h, 0),
            `${code} ${pose} ${f}`,
          ).toBeGreaterThanOrEqual(2);
          // The HD sheet and HorseSprite draw one CELL per frame: a pixel outside would bleed.
          expect(
            all.filter((r) => !inCell(r)),
            `${code} ${pose} ${f}`,
          ).toEqual([]);
          looks.add(JSON.stringify(extra));
        }
        expect(looks.size).toBe(codes('cap').length);
      }
    }
  });

  it('a cap and a pattern together still draw both', () => {
    const pattern = paint({ ...colorsOf(0), pattern: 'pattern:hoops' }, 1, 'side-right');
    const both = paint(
      { ...colorsOf(0), pattern: 'pattern:hoops', cap: 'cap:crown' },
      1,
      'side-right',
    );
    expect(both.length).toBeGreaterThan(pattern.length);
    expect(both.some((r) => r.fill === '#ffd54f')).toBe(true);
  });
});
