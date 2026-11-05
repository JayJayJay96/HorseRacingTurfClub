/**
 * Tracks in metres, seen from above: x right, y down. Every shape runs its home straight along
 * the bottom, left to right, with the stands below it. Lanes are visual only (the sim has none).
 * Shape is looks only; the terrain tracks (spec 2026-11-06 C) add hills, sand, ice and hurdles,
 * which the sim reads through `terrain.ts`.
 */
export type TrackId =
  | 'oval'
  | 'speedway'
  | 'kidney'
  | 'downs'
  | 'summit'
  | 'canyon'
  | 'figure8'
  | 'steeple'
  | 'seaside'
  | 'ice';

/** A stretch of special ground, in lap metres from the start of the home straight. */
export interface SurfaceZone {
  readonly from: number;
  /** May run past the lap end (wraps). */
  readonly to: number;
  readonly kind: 'sand' | 'ice';
}

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
  /** One line for the host picker and the phone Guide. */
  readonly blurb: string;
  /** Height above the grass in metres at lap metre `s` (never below 0); missing = flat. */
  readonly height?: (s: number) => number;
  /** Sand / ice stretches; missing = none. */
  readonly zones?: readonly SurfaceZone[];
  /** Hurdles across every lane, lap metres. Missing = none. */
  readonly hurdles?: readonly number[];
}

/** Terrain a track adds on top of its shape, given its finish line. */
type Terrain = (finishS: number) => Pick<Track, 'height' | 'zones' | 'hurdles'>;
const FLAT: Terrain = () => ({});

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
function stadium(
  id: TrackId,
  name: string,
  lap: number,
  straight: number,
  blurb: string,
  terrain: Terrain = FLAT,
): StadiumTrack {
  const radius = (lap - 2 * straight) / (2 * Math.PI);
  return {
    ...terrain(straight / 2),
    id,
    name,
    blurb,
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
  blurb: string,
  terrain: Terrain = FLAT,
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
    ...terrain(finishS),
    id,
    name,
    blurb,
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
function kidney(
  id: TrackId,
  name: string,
  lap: number,
  D: number,
  blurb: string,
  terrain: Terrain = FLAT,
): Track {
  const S = 300;
  const R = (lap - 2 * S) / (2 * Math.PI);
  const centre = (u: number): Point => {
    const p = stadiumPoint(S, R, lap, u * lap, 0);
    if (p.y > 0 || Math.abs(p.x) > S / 2) return p;
    return { x: p.x, y: p.y + (D * (1 + Math.cos((2 * Math.PI * p.x) / S))) / 2 };
  };
  // The bottom straight is untouched, so its middle is still at u = (S/2) / lap.
  return sampledTrack(id, name, centre, lap, S / 2 / lap, blurb, terrain);
}

/**
 * An upright figure eight (lemniscate of Gerono) crossing itself in the middle. The bottom loop
 * runs like every other track; the top loop turns the other way, so its lanes lie inside it.
 */
function figure8(lap: number): Track {
  const A = 1;
  const lift = 0.35; // the lap starts this far (radians) before the lowest point
  const centre = (u: number): Point => {
    const th = Math.PI / 2 - lift + 2 * Math.PI * u;
    return { x: -A * Math.sin(th) * Math.cos(th), y: Math.sin(th) };
  };
  // Crossings at th = pi (u ~ 0.3) and 2 pi (u ~ 0.8); the first one goes over the bridge.
  const bridgeU = (Math.PI / 2 + lift) / (2 * Math.PI);
  return sampledTrack(
    'figure8',
    'Figure-8 Bridge',
    centre,
    lap,
    lift / (2 * Math.PI),
    'Crosses itself in the middle: up and over the bridge once a lap.',
    () => ({ height: (s) => bump(s, bridgeU * lap, 120, 5, lap) }),
  );
}

/** A smooth hill `h` metres high reaching `half` metres either side of `at`. */
function bump(s: number, at: number, half: number, h: number, lap: number): number {
  const d = Math.abs(wrap(s - at + lap / 2, lap) - lap / 2);
  return d >= half ? 0 : (h * (1 + Math.cos((Math.PI * d) / half))) / 2;
}

/**
 * From `start`: climbs to `h` over `up` of the lap, holds for `flat`, drops back over `down`, then
 * stays on the floor for the rest. Smooth (cosine) at every corner.
 */
function climb(
  s: number,
  start: number,
  lap: number,
  h: number,
  up: number,
  flat = 0,
  down = 1 - up - flat,
): number {
  const u = wrap(s - start, lap) / lap;
  if (u < up) return (h * (1 - Math.cos((Math.PI * u) / up))) / 2;
  if (u < up + flat) return h;
  if (u < up + flat + down) return (h * (1 + Math.cos((Math.PI * (u - up - flat)) / down))) / 2;
  return 0;
}

/** `n` hurdles evenly round the lap, the first `clear` metres past the finish line. */
const hurdlesRound = (lap: number, finishS: number, n: number, clear: number): number[] =>
  Array.from({ length: n }, (_, i) => wrap(finishS + clear + (i * lap) / n, lap));

const LAP = 1200;

export const TRACKS = {
  oval: stadium('oval', 'Oval', LAP, 300, 'The classic: flat, with two long straights.'),
  speedway: stadium('speedway', 'Speedway', LAP, 420, 'Long straights and tight bends. Flat.'),
  kidney: kidney('kidney', 'Kidney', LAP, 50, 'A bean with a dented back straight. Flat.'),
  downs: stadium(
    'downs',
    'Rolling Downs',
    LAP,
    320,
    'Gentle hills all the way round: slower up, faster down.',
    () => ({
      height: (s) =>
        4 + 2.5 * Math.sin((2 * Math.PI * 3 * s) / LAP) + Math.sin((2 * Math.PI * 5 * s) / LAP + 1),
    }),
  ),
  summit: kidney(
    'summit',
    'Summit Pass',
    LAP,
    40,
    'A long climb from the finish to the summit, then a steep dash back down.',
    (f) => ({ height: (s) => climb(s, f, LAP, 14, 0.7) }),
  ),
  canyon: stadium(
    'canyon',
    'Canyon Drop',
    LAP,
    440,
    'Starts up on a high plateau, plunges into the canyon, then runs the canyon floor home.',
    // Floor at the finish; the short race starts on the plateau half a lap back.
    (f) => ({ height: (s) => climb(s, f + 0.1 * LAP, LAP, 14, 0.3, 0.2, 0.15) }),
  ),
  figure8: figure8(2 * LAP),
  steeple: stadium(
    'steeple',
    'Forest Steeplechase',
    LAP,
    280,
    'Hurdles round the lap: clear them or stumble. Tough horses stumble less.',
    (f) => ({ hurdles: hurdlesRound(LAP, f, 6, 50) }),
  ),
  seaside: kidney(
    'seaside',
    'Seaside',
    LAP,
    60,
    'Deep sand along the beach side slows everyone down.',
    (f) => ({ zones: [{ from: f + 0.3 * LAP, to: f + 0.62 * LAP, kind: 'sand' }] }),
  ),
  ice: stadium(
    'ice',
    'Ice Ring',
    LAP,
    150,
    'All ice: fast on the straights, slow round the bends as horses fight their momentum.',
    () => ({ zones: [{ from: 0, to: LAP, kind: 'ice' }] }),
  ),
} satisfies Record<TrackId, Track>;

/** Every track id, in picker order. */
export const TRACK_IDS = Object.keys(TRACKS) as TrackId[];

/** The MVP track: Short (1800 m) is 1.5 laps, Long (2700 m) 2.25. */
export const TRACK = TRACKS.oval;

/** Unknown or missing ids fall back to the oval. */
export const trackById = (id: string | null | undefined): Track =>
  id && Object.hasOwn(TRACKS, id) ? TRACKS[id as TrackId] : TRACK;

export const trackPoint = (track: Track, s: number, offset: number): Point =>
  track.point(s, offset);

export const finishS = (track: Track) => track.finishS;

/** Ground height (m) under lap metre `s`; 0 on flat tracks. */
export const heightAt = (track: Track, s: number): number => track.height?.(s) ?? 0;

/** Display only: how high a horse is in the air `metres` into a race, jumping each hurdle. */
export function hurdleHop(track: Track, distance: number, metres: number): number {
  const s = finishS(track) - distance + metres;
  for (const h of track.hurdles ?? []) {
    const d = Math.abs(wrap(s - h + track.lap / 2, track.lap) - track.lap / 2);
    if (d < HOP_HALF_M) return HOP_M * Math.cos((Math.PI * d) / (2 * HOP_HALF_M));
  }
  return 0;
}
const HOP_M = 1.4;
const HOP_HALF_M = 3;

/** Ground height under a horse `metres` into a race over `distance`. */
export const raceHeight = (track: Track, distance: number, metres: number): number =>
  heightAt(track, finishS(track) - distance + metres);

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
