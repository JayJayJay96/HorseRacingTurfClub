import type { HorseColors } from '../palette.ts';
import { drawHorse, type Pose } from '../sprites.ts';

/** One cell fits every pose of `drawHorse` at size 1; hooves at (footX, footY) from the top-left. */
export const CELL = { w: 24, h: 22, footX: 12, footY: 21 } as const;
export const POSES: readonly Pose[] = ['side-right', 'side-left', 'away', 'toward'];
export const FRAMES = 4;

export const sheetSize = (lanes: number) => ({
  width: POSES.length * FRAMES * CELL.w,
  height: lanes * CELL.h,
});

export function cellOf(lane: number, pose: Pose, frame: number) {
  const f = ((frame % FRAMES) + FRAMES) % FRAMES;
  return { col: POSES.indexOf(pose) * FRAMES + f, row: lane };
}

/** Texture offset/repeat for a cell of a canvas texture (flipY = true, so row 0 is at the top). */
export function cellUv(lanes: number, cell: { col: number; row: number }) {
  const { width, height } = sheetSize(lanes);
  return {
    offsetX: (cell.col * CELL.w) / width,
    offsetY: 1 - ((cell.row + 1) * CELL.h) / height,
    repeatX: CELL.w / width,
    repeatY: CELL.h / height,
  };
}

/** Dark rim so horses read against the grass after tilt-shift and bloom. */
export const OUTLINE_RGBA = [20, 16, 28, 255] as const;

/**
 * Paints a 1-pixel outline around the opaque pixels (alpha >= 128, the material's alphaTest)
 * of one cell, staying inside the cell so neighbours never bleed in.
 */
export function outlineCell(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rgba: readonly number[] = OUTLINE_RGBA,
) {
  const solid = (x: number, y: number) =>
    x >= x0 && x < x0 + w && y >= y0 && y < y0 + h && data[(y * width + x) * 4 + 3]! >= 128;
  const rim: number[] = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        rim.push((y * width + x) * 4);
      }
    }
  }
  for (const i of rim) for (let k = 0; k < 4; k++) data[i + k] = rgba[k]!;
}

/** Draws every lane's poses and gallop frames with the 2D sprite code, then outlines them. */
export function drawSheet(ctx: CanvasRenderingContext2D, colors: readonly HorseColors[]) {
  ctx.imageSmoothingEnabled = false;
  colors.forEach((c, lane) => {
    for (const pose of POSES) {
      for (let f = 0; f < FRAMES; f++) {
        const { col, row } = cellOf(lane, pose, f);
        drawHorse(ctx, col * CELL.w + CELL.footX, row * CELL.h + CELL.footY, c, f, pose, 1);
      }
    }
  });
  const { width, height } = sheetSize(colors.length);
  const img = ctx.getImageData(0, 0, width, height);
  for (let row = 0; row < colors.length; row++) {
    for (let col = 0; col < POSES.length * FRAMES; col++) {
      outlineCell(img.data, width, col * CELL.w, row * CELL.h, CELL.w, CELL.h);
    }
  }
  ctx.putImageData(img, 0, 0);
}
