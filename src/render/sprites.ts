import type { HorseColors } from './palette.ts';

/** Leg swing (px) for the front/back pairs in each of the 4 gallop frames. */
const LEGS = [
  [0, 2],
  [1, 1],
  [2, 0],
  [1, 1],
] as const;

/**
 * Side-view horse and jockey, ~16×14 px, hooves at (x, y). Facing +1 runs right, −1 left.
 * `frame` picks the gallop pose; pass a value that only changes while the horse moves.
 */
export function drawHorse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colors: HorseColors,
  frame: number,
  facing: 1 | -1,
) {
  const px = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(dx, dy, w, h);
  };
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(facing, 1);
  const [a, b] = LEGS[frame % LEGS.length]!;
  for (const [lx, swing] of [
    [-4, a],
    [-2, b],
    [2, a],
    [4, b],
  ] as const) {
    px(lx + swing - 1, -4, 1, 4, colors.coat);
  }
  px(-5, -8, 10, 4, colors.coat); // body
  px(-7, -8, 2, 3, colors.mane); // tail
  px(4, -11, 3, 4, colors.coat); // neck
  px(6, -12, 3, 2, colors.coat); // head
  px(4, -12, 2, 1, colors.mane); // mane
  px(-1, -12, 3, 4, colors.silk); // jockey
  px(0, -14, 2, 2, colors.silk); // cap
  ctx.restore();
}
