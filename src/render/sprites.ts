import { contrastOf, type HorseColors } from './palette.ts';

export type Pose = 'side-right' | 'side-left' | 'away' | 'toward';

/** Pose from the on-screen running direction (y grows downward). */
export function poseOf(dx: number, dy: number): Pose {
  if (Math.abs(dy) > Math.abs(dx)) return dy < 0 ? 'away' : 'toward';
  return dx >= 0 ? 'side-right' : 'side-left';
}

/** Leg swing (px) for the front/back pairs in each of the 4 gallop frames. */
const LEGS = [
  [0, 2],
  [1, 1],
  [2, 0],
  [1, 1],
] as const;

/**
 * Horse and jockey, ~8–16 px wide × 14–17 px tall × `size`, hooves at (x, y). Side views at the
 * straights, 3/4 rear (`away`) and front (`toward`) views when running up or down the screen.
 * `frame` picks the gallop pose; pass a value that only changes while the horse moves.
 */
export function drawHorse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colors: HorseColors,
  frame: number,
  pose: Pose,
  size = 1,
) {
  const { coat, mane, silk } = colors;
  const px = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(dx, dy, w, h);
  };
  // The jockey's body rect in this pose, which the silk pattern decorates.
  let bx = -1;
  let by = -12;
  let bw = 3;
  let bh = 4;
  const lift = frame % 2; // also the gallop bob
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y) - lift * size);
  ctx.scale(pose === 'side-left' ? -size : size, size);
  if (pose === 'away') {
    px(-3, -4 + lift, 1, 4 - lift, coat); // hind legs, alternating
    px(2, -3 - lift, 1, 3 + lift, coat);
    px(-4, -9, 8, 5, coat); // rump and back
    px(-1, -8, 2, 5, mane); // tail
    px(2, -12, 2, 3, coat); // neck ahead, off to one side
    px(2, -13, 2, 1, mane); // ears
    px(-2, -13, 4, 3, silk); // jockey's back
    bx = -2;
    by = -13;
    bw = 4;
    bh = 3;
    px(-3, -10, 1, 2, silk); // jockey's legs either side
    px(2, -10, 1, 2, silk);
    px(-1, -15, 2, 2, silk); // cap
  } else if (pose === 'toward') {
    px(-2, -4 + lift, 1, 4 - lift, coat); // forelegs, alternating
    px(1, -3 - lift, 1, 3 + lift, coat);
    px(-3, -9, 7, 5, coat); // chest and shoulders
    px(-4, -13, 3, 4, silk); // jockey, off to one side of the head
    bx = -4;
    by = -13;
    px(-4, -15, 2, 2, silk); // cap
    px(0, -12, 3, 4, coat); // head facing us
    px(0, -13, 1, 1, coat); // ears
    px(2, -13, 1, 1, coat);
    px(1, -12, 1, 1, mane); // forelock
  } else {
    const [a, b] = LEGS[frame % LEGS.length]!;
    for (const [lx, swing] of [
      [-4, a],
      [-2, b],
      [2, a],
      [4, b],
    ] as const) {
      px(lx + swing - 1, -4, 1, 4, coat);
    }
    px(-5, -8, 10, 4, coat); // body
    px(-7, -8, 2, 3, mane); // tail
    px(4, -11, 3, 4, coat); // neck
    px(6, -12, 3, 2, coat); // head
    px(4, -12, 2, 1, mane); // mane
    px(-1, -12, 3, 4, silk); // jockey
    px(0, -14, 2, 2, silk); // cap
  }
  if (colors.pattern) {
    const ink = contrastOf(silk);
    if (colors.pattern === 'pattern:hoops') {
      for (let row = by + 1; row < by + bh; row += 2) px(bx, row, bw, 1, ink);
    } else if (colors.pattern === 'pattern:sash') {
      for (let i = 0; i < bh; i++) px(bx + Math.min(i, bw - 1), by + i, 1, 1, ink);
    } else if (colors.pattern === 'pattern:stars') {
      px(bx, by + 1, 1, 1, ink);
      px(bx + bw - 1, by + bh - 1, 1, 1, ink);
    } else if (colors.pattern === 'pattern:chevrons') {
      for (let i = 0; i < bw; i++) px(bx + i, by + 1 + Math.min(i, bw - 1 - i), 1, 1, ink);
    } else if (colors.pattern === 'pattern:quarters') {
      const hw = Math.ceil(bw / 2);
      const hh = Math.ceil(bh / 2);
      px(bx, by, hw, hh, ink);
      px(bx + hw, by + hh, bw - hw, bh - hh, ink);
    } else if (colors.pattern === 'pattern:dots') {
      for (let r = 1; r < bh; r += 2) {
        for (let c = (r >> 1) % 2; c < bw; c += 2) px(bx + c, by + r, 1, 1, ink);
      }
    } else if (colors.pattern === 'pattern:lightning') {
      // Gold bolt on dark silks, the contrast ink on light ones (gold would vanish on yellow).
      const bolt = ink === '#ffffff' ? '#ffd54f' : ink;
      px(bx + bw - 1, by, 1, 1, bolt);
      px(bx + 1, by + 1, bw - 1, 1, bolt);
      px(bx, by + 2, bw - 1, 1, bolt);
      if (bh > 3) px(bx, by + 3, 1, 1, bolt);
    }
  }
  ctx.restore();
}

/** 3×5 pixel digits, rows top to bottom, 3 bits each (MSB = left). */
const DIGITS = [
  [7, 5, 5, 5, 7],
  [2, 6, 2, 2, 7],
  [7, 1, 7, 4, 7],
  [7, 1, 7, 1, 7],
  [5, 5, 7, 1, 1],
  [7, 4, 7, 1, 7],
  [7, 4, 7, 5, 7],
  [7, 1, 2, 2, 2],
  [7, 5, 7, 5, 7],
  [7, 5, 7, 1, 7],
] as const;

/** Saddle-cloth style number badge in `silk`, centred on x with its bottom edge at y. */
export function drawNumber(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  n: number,
  silk: string,
  size = 1,
) {
  const digits = String(n);
  const w = digits.length * 4 + 1;
  const left = Math.round(x) - Math.ceil(w / 2) * size;
  const top = Math.round(y) - 7 * size;
  ctx.fillStyle = '#000'; // outline so light silks read on dirt
  ctx.fillRect(left - size, top - size, (w + 2) * size, 9 * size);
  ctx.fillStyle = silk;
  ctx.fillRect(left, top, w * size, 7 * size);
  ctx.fillStyle = contrastOf(silk);
  [...digits].forEach((d, i) => {
    DIGITS[Number(d)]!.forEach((bits, row) => {
      for (let col = 0; col < 3; col++) {
        if (bits & (4 >> col)) {
          ctx.fillRect(left + (1 + i * 4 + col) * size, top + (1 + row) * size, size, size);
        }
      }
    });
  });
}
