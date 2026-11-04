import { createSeededRng } from '../../sim/rng.ts';
import { trackBounds, type Track } from '../track.ts';
import type { SceneryKind } from './textures.ts';

export interface SceneryItem {
  readonly kind: SceneryKind;
  /** Track metres. */
  readonly x: number;
  readonly y: number;
  /** Picks the sprite variant (0-3). */
  readonly variant: number;
}

/** Metres of clear ground kept around the track's bounding box. */
export const SCENERY_MARGIN = 12;
const BAND = 80;

/** The stands as the 2D renderer places them (pushed out by the field's width), plus 4 m. */
export function standsRect(track: Track, lanes: number) {
  const outer = lanes * track.laneWidth;
  const { stands } = track;
  return {
    x0: stands.x0 - 4,
    y0: stands.y0 + outer - 4,
    x1: stands.x1 + 4,
    y1: stands.y1 + outer + 4,
  };
}

/** Trees, bushes and flags in a band around the track, the same for every viewer of a race. */
export function placeScenery(track: Track, lanes: number, seed: number, count = 90): SceneryItem[] {
  const rng = createSeededRng(seed ^ 0x5eed);
  const { halfWidth: hw, halfHeight: hh } = trackBounds(track, lanes);
  const s = standsRect(track, lanes);
  const out: SceneryItem[] = [];
  const span = (half: number) => 2 * (half + SCENERY_MARGIN + BAND);
  for (let tries = 0; out.length < count && tries < count * 50; tries++) {
    const x = (rng.nextInt(10_000) / 10_000 - 0.5) * span(hw);
    const y = (rng.nextInt(10_000) / 10_000 - 0.5) * span(hh);
    const offTrack = Math.abs(x) > hw + SCENERY_MARGIN || Math.abs(y) > hh + SCENERY_MARGIN;
    const inStands = x > s.x0 && x < s.x1 && y > s.y0 && y < s.y1;
    if (!offTrack || inStands) continue;
    const roll = rng.nextInt(100);
    const kind: SceneryKind = roll < 50 ? 'tree' : roll < 85 ? 'bush' : 'flag';
    out.push({ kind, x, y, variant: rng.nextInt(4) });
  }
  return out;
}
