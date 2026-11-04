import { describe, expect, it } from 'vitest';
import { CELL, FRAMES, POSES, cellOf, cellUv, sheetSize } from './sheet.ts';

describe('sheet', () => {
  it('gives every lane, pose and frame its own cell', () => {
    const seen = new Set<string>();
    for (let lane = 0; lane < 22; lane++) {
      for (const pose of POSES) {
        for (let f = 0; f < FRAMES; f++) {
          const { col, row } = cellOf(lane, pose, f);
          seen.add(`${col},${row}`);
        }
      }
    }
    expect(seen.size).toBe(22 * POSES.length * FRAMES);
  });

  it('wraps frames and handles negative frames', () => {
    expect(cellOf(0, 'away', 5)).toEqual(cellOf(0, 'away', 1));
    expect(cellOf(0, 'away', -1)).toEqual(cellOf(0, 'away', 3));
  });

  it('maps cells to UVs inside the sheet (flipY canvas texture)', () => {
    const { width, height } = sheetSize(3);
    expect(width).toBe(POSES.length * FRAMES * CELL.w);
    const uv = cellUv(3, cellOf(2, 'toward', 3));
    expect(uv.repeatX).toBeCloseTo(CELL.w / width);
    expect(uv.repeatY).toBeCloseTo(CELL.h / height);
    expect(uv.offsetY).toBeCloseTo(0); // the last row is at the bottom
    expect(uv.offsetX + uv.repeatX).toBeCloseTo(1);
  });
});
