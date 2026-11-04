import { describe, expect, it } from 'vitest';
import {
  CELL,
  FRAMES,
  OUTLINE_RGBA,
  POSES,
  cellOf,
  cellUv,
  outlineCell,
  sheetSize,
} from './sheet.ts';

describe('outlineCell', () => {
  it('rims opaque pixels with the outline colour, inside the cell only', () => {
    // 4x3 image, two 2x3 cells side by side; one opaque pixel at (1,1) on the cell edge.
    const width = 4;
    const data = new Uint8ClampedArray(width * 3 * 4);
    const at = (x: number, y: number) => (y * width + x) * 4;
    data.set([200, 100, 50, 255], at(1, 1));
    outlineCell(data, width, 0, 0, 2, 3);
    const alpha = (x: number, y: number) => data[at(x, y) + 3];
    expect(Array.from(data.slice(at(0, 1), at(0, 1) + 4))).toEqual([...OUTLINE_RGBA]);
    expect(alpha(1, 0)).toBe(255);
    expect(alpha(1, 2)).toBe(255);
    expect(alpha(0, 0)).toBe(0); // diagonals stay clear
    expect(alpha(2, 1)).toBe(0); // the next cell is untouched
    expect(Array.from(data.slice(at(1, 1), at(1, 1) + 4))).toEqual([200, 100, 50, 255]);
  });
});

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
