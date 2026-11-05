import { surfaceAt } from '../sim/terrain.ts';
import { trackPoint, type Point, type Track } from './track.ts';

/** Display colours for terrain (spec 2026-11-06 C). Dirt matches the flat ribbon. */
export const GROUND = {
  dirt: [185, 138, 90],
  high: [232, 200, 140],
  sand: '#e8d39b',
  ice: '#d6eef7',
  hurdle: '#f5f5f5',
  hurdleWood: '#6b4a2b',
} as const;
/** Heights are shaded in this many bands, so a frame fills a handful of paths. */
const BANDS = 6;
const STEP_M = 4;

const hex = (rgb: readonly number[]) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** True when a track has anything to draw beyond the plain dirt ribbon. */
export const hasTerrain = (track: Track) =>
  Boolean(track.height || track.zones || track.hurdles) || track.id === 'figure8';

/**
 * The track surface as quads of `STEP_M` metres between the rails, bucketed by colour and listed
 * lowest first, so a bridge paints over the road it crosses. World coordinates.
 */
export function groundPatches(track: Track, outer: number): { color: string; quads: Point[][] }[] {
  let top = 0;
  if (track.height)
    for (let s = 0; s < track.lap; s += STEP_M) top = Math.max(top, track.height(s));
  const buckets = new Map<string, { color: string; order: number; quads: Point[][] }>();
  for (let s = 0; s < track.lap; s += STEP_M) {
    const mid = s + STEP_M / 2;
    const h = track.height?.(mid) ?? 0;
    const band = top > 0 ? Math.min(BANDS - 1, Math.floor((h / top) * BANDS)) : 0;
    const surface = surfaceAt(track, mid);
    const color =
      surface === 'sand'
        ? GROUND.sand
        : surface === 'ice'
          ? GROUND.ice
          : hex(GROUND.dirt.map((c, i) => c + ((GROUND.high[i]! - c) * band) / (BANDS - 1)));
    const key = `${band}|${color}`;
    const b = buckets.get(key) ?? { color, order: band, quads: [] };
    // A hair of overlap hides seams between neighbouring quads.
    const e = s + STEP_M + 0.3;
    b.quads.push([
      trackPoint(track, s, -2),
      trackPoint(track, e, -2),
      trackPoint(track, e, outer + 2),
      trackPoint(track, s, outer + 2),
    ]);
    buckets.set(key, b);
  }
  return [...buckets.values()].sort((a, b) => a.order - b.order);
}

/** Each hurdle as a line across all lanes, world coordinates. */
export const hurdleLines = (track: Track, outer: number): [Point, Point][] =>
  (track.hurdles ?? []).map((s) => [trackPoint(track, s, -2), trackPoint(track, s, outer + 2)]);
