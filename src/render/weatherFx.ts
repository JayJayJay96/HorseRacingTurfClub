import { WEATHER } from '../sim/config.ts';
import type { Puddle } from '../sim/types.ts';
import { finishS, trackPoint, type Point, type Track } from './track.ts';

/** Light touch (owner 2026-11-05): vibe only, horses always readable. */
export const RAIN = {
  /** Streaks in a box this many metres round the camera target, up to `top` high. */
  drops: 260,
  half: 45,
  top: 30,
  /** Fall speed, m/s. */
  speed: 28,
  /** Streak length (m) and its sideways lean per metre of fall. */
  length: 1.2,
  lean: 0.25,
  /** Multiplies the HD post grade; 2D draws its streaks at `alpha2d`. */
  tint: [0.86, 0.9, 0.97] as const,
  saturation: 0.85,
  alpha2d: 0.22,
} as const;

export const FOG = {
  /** HD: fog starts this many shot-distances out (clear uses 1.2 / 4). */
  near: 1,
  far: 2.3,
  /** HD fog colour mixes this much toward `color`; 2D haze peaks at `alpha2d`. */
  mix: 0.7,
  color: '#e3e8ec',
  alpha2d: 0.35,
} as const;

/** Deterministic 0..1 noise per index (same recipe as effects.ts). */
const hash = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * World-space outline of a puddle: an ellipse over its lanes and its length, with a small
 * per-puddle wobble so they don't look stamped.
 */
export function puddleOutline(
  track: Track,
  distance: number,
  puddle: Puddle,
  points = 16,
): Point[] {
  const len = WEATHER.puddleLengthM;
  const sMid = finishS(track) - distance + puddle.at + len / 2;
  const lw = track.laneWidth;
  const inner = puddle.lanes[0] * lw;
  const outer = (puddle.lanes[1] + 1) * lw;
  const mid = (inner + outer) / 2;
  const half = (outer - inner) / 2 - 0.2;
  return Array.from({ length: points }, (_, i) => {
    const a = (i / points) * 2 * Math.PI;
    const wob = 1 + (hash(i, puddle.at) - 0.5) * 0.18;
    return trackPoint(track, sMid + Math.cos(a) * (len / 2) * wob, mid + Math.sin(a) * half * wob);
  });
}

/** A rain streak's top end relative to the camera target (y up), looping every top/speed s. */
export function rainDrop(i: number, t: number): { x: number; y: number; z: number } {
  const x = (hash(i, 1) * 2 - 1) * RAIN.half;
  const z = (hash(i, 2) * 2 - 1) * RAIN.half;
  const phase = hash(i, 3) * RAIN.top;
  // Positive modulo: the countdown runs at negative t.
  const y = RAIN.top - ((((phase + t * RAIN.speed) % RAIN.top) + RAIN.top) % RAIN.top);
  return { x, y, z };
}
