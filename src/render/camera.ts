import { progressAt, standingsAt } from '../sim/playback.ts';
import type { Timeline } from '../sim/types.ts';
import { horsePoint, type Point, type Track } from './track.ts';

/** Centre in track metres; zoom 1 fits the whole track. */
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export const WIDE: Camera = { x: 0, y: 0, zoom: 1 };
export const FOLLOW_ZOOM = 6;
export const FINISH_ZOOM = 3.5;
/** The camera moves to the finish line once the leader is this close. */
export const FINISH_SHOT_METRES = 60;
const WIDE_SECONDS = 2;

/** Where the camera wants to be at race time `t`; the renderer eases toward it. */
export function cameraAt(track: Track, timeline: Timeline, t: number): Camera {
  if (t < WIDE_SECONDS) return WIDE;
  const { distance, horses } = timeline;
  const order = standingsAt(timeline, t);
  if (progressAt(timeline, order[0]!, t) >= distance - FINISH_SHOT_METRES) {
    const p = horsePoint(track, distance, distance, 0);
    return { x: p.x, y: p.y, zoom: FINISH_ZOOM };
  }
  const pack = order
    .slice(0, 3)
    .map((h) => horsePoint(track, distance, progressAt(timeline, h, t), horses.indexOf(h)));
  const mean = (f: (p: Point) => number) => pack.reduce((sum, p) => sum + f(p), 0) / pack.length;
  return { x: mean((p) => p.x), y: mean((p) => p.y), zoom: FOLLOW_ZOOM };
}
