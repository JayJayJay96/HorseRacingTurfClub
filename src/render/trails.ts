/** How each bought trail looks behind a horse in both renderers (display only). */
export type TrailShape = 'dash' | 'dot' | 'heart' | 'ring';
export type TrailStyle = {
  /** 2D: the mark drawn at each sample. */
  readonly shape: TrailShape;
  /** 2D: height of sample i (0 = newest) above the hooves, in sprite pixels. */
  readonly lift: (i: number) => number;
  /** Colour (#rrggbb) of sample i (0 = newest) at race time t. Constant strings only. */
  readonly color: (i: number, t: number) => string;
  /** HD-2D point cloud: point size (m), opacity, additive glow (bloom), lift (m) of sample i (1 = newest). */
  readonly hd: {
    readonly size: number;
    readonly opacity: number;
    readonly glow: boolean;
    readonly lift: (i: number) => number;
  };
};

const GOLD = '#ffd54f';
const FIRE = ['#fff176', '#ff9800', '#f4511e'] as const;
const RAINBOW = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'] as const;
function cycle(list: readonly string[], n: number): string {
  return list[((n % list.length) + list.length) % list.length]!;
}

export const TRAIL_STYLES: Readonly<Record<string, TrailStyle>> = {
  'trail:dust': {
    shape: 'dash',
    lift: () => 0,
    color: () => '#a39382',
    hd: { size: 0.35, opacity: 0.6, glow: false, lift: () => 0.15 },
  },
  'trail:sparkle': {
    shape: 'dot',
    lift: (i) => 6 + (i % 3) * 2, // lifted to the jockey's height
    color: (i, t) => ((Math.floor(t * 12) + i) % 2 ? '#ffffff' : GOLD),
    hd: { size: 0.25, opacity: 1, glow: true, lift: (i) => 1.5 + (i % 3) * 0.3 },
  },
  'trail:hearts': {
    shape: 'heart',
    lift: (i) => 6 + (i % 2) * 3,
    color: (i) => (i % 2 ? '#f48fb1' : '#e91e63'),
    hd: { size: 0.4, opacity: 0.9, glow: false, lift: (i) => 1.4 + (i % 2) * 0.4 },
  },
  'trail:fire': {
    shape: 'dot',
    lift: (i) => 1 + i, // flames rise as they fade
    color: (i, t) => cycle(FIRE, i + Math.floor(t * 10)),
    hd: { size: 0.3, opacity: 1, glow: true, lift: (i) => 0.2 + i * 0.15 },
  },
  'trail:rainbow': {
    shape: 'dash',
    lift: () => 4,
    color: (i) => cycle(RAINBOW, i),
    hd: { size: 0.35, opacity: 1, glow: true, lift: () => 0.8 },
  },
  'trail:bubbles': {
    shape: 'ring',
    lift: (i) => 3 + i,
    color: () => '#b3e5fc',
    hd: { size: 0.3, opacity: 0.7, glow: false, lift: (i) => 0.4 + i * 0.2 },
  },
};

/** One 2D trail mark at (x, y), `s` = sprite size. Up to 4 rects, no allocation. */
export function drawMark(
  ctx: CanvasRenderingContext2D,
  shape: TrailShape,
  x: number,
  y: number,
  s: number,
) {
  if (shape === 'dash') ctx.fillRect(x - s, y - s, 2 * s, s);
  else if (shape === 'dot') ctx.fillRect(x, y, s, s);
  else if (shape === 'heart') {
    ctx.fillRect(x - s, y - s, s, s);
    ctx.fillRect(x + s, y - s, s, s);
    ctx.fillRect(x - s, y, 3 * s, s);
    ctx.fillRect(x, y + s, s, s);
  } else {
    ctx.fillRect(x, y - s, s, s);
    ctx.fillRect(x - s, y, s, s);
    ctx.fillRect(x + s, y, s, s);
    ctx.fillRect(x, y + s, s, s);
  }
}
