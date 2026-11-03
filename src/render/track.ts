/**
 * Tracks in metres, seen from above: x right, y down. Every shape runs its home straight along
 * the bottom, left to right, with the stands below it. Lanes are visual only (the sim has none).
 */
export type TrackId = 'oval' | 'speedway' | 'kidney';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Track {
  readonly id: TrackId;
  readonly name: string;
  readonly lap: number;
  readonly laneWidth: number;
  /** The finish line: mid home straight, in front of the stands. */
  readonly finishS: number;
  /** `s` metres along the inner rail from the start of the home straight, `offset` metres outward. */
  point(s: number, offset: number): Point;
  /** The stands for a field with no lanes; the renderer pushes them down by the field's width. */
  readonly stands: {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
  };
}

export interface StadiumTrack extends Track {
  readonly straight: number;
  readonly radius: number;
}

const wrap = (s: number, lap: number) => ((s % lap) + lap) % lap;

function stadiumPoint(S: number, R: number, lap: number, s: number, offset: number): Point {
  const r = R + offset;
  const bend = Math.PI * R;
  const u = wrap(s, lap);
  if (u < S) return { x: -S / 2 + u, y: r };
  if (u < S + bend) {
    const th = Math.PI / 2 - (u - S) / R;
    return { x: S / 2 + r * Math.cos(th), y: r * Math.sin(th) };
  }
  if (u < 2 * S + bend) return { x: S / 2 - (u - S - bend), y: -r };
  const th = -Math.PI / 2 - (u - 2 * S - bend) / R;
  return { x: -S / 2 + r * Math.cos(th), y: r * Math.sin(th) };
}

/** Two straights joined by semicircles. */
function stadium(id: TrackId, name: string, lap: number, straight: number): StadiumTrack {
  const radius = (lap - 2 * straight) / (2 * Math.PI);
  return {
    id,
    name,
    lap,
    laneWidth: 2.5,
    straight,
    radius,
    finishS: straight / 2,
    point: (s, offset) => stadiumPoint(straight, radius, lap, s, offset),
    stands: { x0: -straight / 2, y0: radius + 8, x1: straight / 2, y1: radius + 40 },
  };
}

/**
 * Any closed inner rail `centre(u)`, u in [0, 1), clockwise on screen (interior on the right of
 * travel), u = 0 at the start of the home straight. Sampled finely and scaled to `lap` metres.
 */
function sampledTrack(
  id: TrackId,
  name: string,
  centre: (u: number) => Point,
  lap: number,
  finishU: number,
  N = 2000,
): Track {
  const raw = Array.from({ length: N }, (_, i) => centre(i / N));
  let total = 0;
  const rawS = raw.map((p, i) => {
    const s = total;
    total += Math.hypot(raw[(i + 1) % N]!.x - p.x, raw[(i + 1) % N]!.y - p.y);
    return s;
  });
  const k = lap / total;
  const pts = raw.map((p) => ({ x: p.x * k, y: p.y * k }));
  const cum = [...rawS.map((s) => s * k), lap];
  // Outward unit normal per sample (tangent turned a quarter clockwise), from central differences.
  const normals = pts.map((_, i) => {
    const a = pts[(i + N - 1) % N]!;
    const b = pts[(i + 1) % N]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  });
  const at = (s: number, offset: number): Point => {
    const u = wrap(s, lap);
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! <= u) lo = mid;
      else hi = mid;
    }
    const f = (u - cum[lo]!) / (cum[lo + 1]! - cum[lo]!);
    const p = pts[lo]!;
    const q = pts[(lo + 1) % N]!;
    const m = normals[lo]!;
    const n = normals[(lo + 1) % N]!;
    const nx = m.x + (n.x - m.x) * f;
    const ny = m.y + (n.y - m.y) * f;
    const nl = Math.hypot(nx, ny);
    return {
      x: p.x + (q.x - p.x) * f + (nx / nl) * offset,
      y: p.y + (q.y - p.y) * f + (ny / nl) * offset,
    };
  };
  const fi = Math.floor(finishU * N);
  const finishS = cum[fi]! + (finishU * N - fi) * (cum[fi + 1]! - cum[fi]!);
  const f = at(finishS, 0);
  return {
    id,
    name,
    lap,
    laneWidth: 2.5,
    finishS,
    point: at,
    stands: { x0: f.x - 150 * k, y0: f.y + 8, x1: f.x + 150 * k, y1: f.y + 40 },
  };
}

/**
 * A bean: the oval's top straight pushed in by y += D (1 + cos(2πx/S)) / 2. The dent's radius of
 * curvature is S² / (2π² D) ≈ 91 m before scaling to the lap, so 55 m of lanes never fold over.
 */
function kidney(lap: number): Track {
  const S = 300;
  const R = (lap - 2 * S) / (2 * Math.PI);
  const D = 50;
  const centre = (u: number): Point => {
    const p = stadiumPoint(S, R, lap, u * lap, 0);
    if (p.y > 0 || Math.abs(p.x) > S / 2) return p;
    return { x: p.x, y: p.y + (D * (1 + Math.cos((2 * Math.PI * p.x) / S))) / 2 };
  };
  // The bottom straight is untouched, so its middle is still at u = (S/2) / lap.
  return sampledTrack('kidney', 'Kidney', centre, lap, S / 2 / lap);
}

export const TRACKS = {
  oval: stadium('oval', 'Oval', 1200, 300),
  speedway: stadium('speedway', 'Speedway', 1200, 420),
  kidney: kidney(1200),
} satisfies Record<TrackId, Track>;

/** The MVP track: Short (1800 m) is 1.5 laps, Long (2700 m) 2.25. */
export const TRACK = TRACKS.oval;

/** Unknown or missing ids fall back to the oval. */
export const trackById = (id: string | null | undefined): Track =>
  id && Object.hasOwn(TRACKS, id) ? TRACKS[id as TrackId] : TRACK;

export const trackPoint = (track: Track, s: number, offset: number): Point =>
  track.point(s, offset);

export const finishS = (track: Track) => track.finishS;

/** Where a horse in `lane` is after `metres` of a race over `distance`. */
export const horsePoint = (track: Track, distance: number, metres: number, lane: number) =>
  trackPoint(track, finishS(track) - distance + metres, (lane + 0.5) * track.laneWidth);

/** Half extents (about the origin) of the track with `lanes` lanes, for fitting it on screen. */
export function trackBounds(track: Track, lanes: number) {
  const offset = lanes * track.laneWidth;
  let halfWidth = 0;
  let halfHeight = 0;
  for (let s = 0; s < track.lap; s += 1) {
    const p = track.point(s, offset);
    halfWidth = Math.max(halfWidth, Math.abs(p.x));
    halfHeight = Math.max(halfHeight, Math.abs(p.y));
  }
  return { halfWidth, halfHeight };
}
