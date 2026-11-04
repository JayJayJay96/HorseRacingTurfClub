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

/** Draws every lane's poses and gallop frames with the 2D sprite code. */
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
}
