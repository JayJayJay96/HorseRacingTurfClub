import { TERRAIN } from './config.ts';
import type { Track } from './track.ts';

/** What a track's terrain does to one race over `distance` metres (spec 2026-11-06 C). */
export interface RaceTerrain {
  /** Pace factor for each whole race metre (index floor(progress)); null on flat, plain tracks. */
  readonly pace: Float32Array | null;
  /** Race metres where the field meets a hurdle, ascending. */
  readonly hurdles: readonly number[];
}

const NONE: RaceTerrain = { pace: null, hurdles: [] };
const wrap = (s: number, lap: number) => ((s % lap) + lap) % lap;

/** Turning per metre of the inner rail at lap metre `s` (1 / radius). */
export function curvature(track: Track, s: number): number {
  const a = track.point(s - 2, 0);
  const b = track.point(s, 0);
  const c = track.point(s + 2, 0);
  const t1 = Math.atan2(b.y - a.y, b.x - a.x);
  const t2 = Math.atan2(c.y - b.y, c.x - b.x);
  const turn = Math.abs(wrap(t2 - t1 + Math.PI, 2 * Math.PI) - Math.PI);
  return turn / 2;
}

/** Surface under lap metre `s`, if any. */
export function surfaceAt(track: Track, s: number): 'sand' | 'ice' | null {
  for (const z of track.zones ?? []) {
    if (wrap(s - z.from, track.lap) < z.to - z.from) return z.kind;
  }
  return null;
}

/** Pace factor at lap metre `s`: slope, then sand or ice. Flat plain ground is 1. */
export function paceAt(track: Track, s: number): number {
  let pace = 1;
  if (track.height) {
    const grade = track.height(s + 0.5) - track.height(s - 0.5);
    pace *=
      grade > 0
        ? Math.max(TERRAIN.minUpPace, 1 - TERRAIN.upPerGrade * grade)
        : Math.min(TERRAIN.maxDownPace, 1 - TERRAIN.downPerGrade * grade);
  }
  const surface = surfaceAt(track, s);
  if (surface === 'sand') pace *= TERRAIN.sandPace;
  if (surface === 'ice') {
    pace *= Math.max(
      TERRAIN.iceMinPace,
      TERRAIN.iceStraightPace - TERRAIN.icePerCurvature * curvature(track, s),
    );
  }
  return pace;
}

const cache = new Map<string, RaceTerrain>();

/**
 * The terrain a race meets. Race metre m is lap metre finishS - distance + m (as the renderers
 * place horses). Cached per track and distance: odds run thousands of races on one track.
 */
export function raceTerrain(track: Track, distance: number): RaceTerrain {
  if (!track.height && !track.zones && !track.hurdles) return NONE;
  const key = `${track.id}|${distance}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const start = track.finishS - distance;
  const pace =
    track.height || track.zones
      ? Float32Array.from({ length: distance + 1 }, (_, m) => paceAt(track, start + m + 0.5))
      : null;
  const hurdles: number[] = [];
  for (const h of track.hurdles ?? []) {
    for (let m = wrap(h - start, track.lap); m < distance; m += track.lap) hurdles.push(m);
  }
  hurdles.sort((a, b) => a - b);
  const terrain = { pace, hurdles };
  cache.set(key, terrain);
  return terrain;
}
