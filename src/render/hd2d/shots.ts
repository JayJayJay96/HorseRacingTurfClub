import { progressAt, standingsAt } from '../../sim/playback.ts';
import type { Timeline } from '../../sim/types.ts';
import { FINISH_SHOT_METRES } from '../camera.ts';
import { finishS, horsePoint, trackBounds, trackPoint, type Point, type Track } from '../track.ts';
import {
  FINISH_DISTANCE_SCALE,
  FOV_DEG,
  LOOK_PAST_M,
  PITCH_DEG,
  distanceForScale,
} from './look.ts';

export type ShotKind = 'wide' | 'chase' | 'finish';

export interface Shot {
  readonly kind: ShotKind;
  /** Look-at point, track metres. */
  readonly x: number;
  readonly y: number;
  /** Radians; the camera sits at target + (sin yaw, ·, cos yaw) in Three.js x/z. */
  readonly yaw: number;
  /** Radians below horizontal. */
  readonly pitch: number;
  /** Metres from the target. */
  readonly distance: number;
}

export const WIDE_SECONDS = 2;
const ASPECT = 16 / 9;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Yaw that puts the camera on the infield side of the track at `s` (inward normal). */
function infieldYaw(track: Track, s: number) {
  const a = trackPoint(track, s, 0);
  const b = trackPoint(track, s, 1);
  return Math.atan2(-(b.x - a.x), -(b.y - a.y));
}

function wideShot(track: Track, lanes: number): Shot {
  const { halfWidth, halfHeight } = trackBounds(track, lanes);
  const pitch = rad(PITCH_DEG.wide);
  const tanHalf = Math.tan(rad(FOV_DEG) / 2);
  const distance =
    1.15 * Math.max(halfWidth / (ASPECT * tanHalf), (halfHeight * Math.sin(pitch)) / tanHalf);
  // From the infield side of the home straight (camera toward -y), like the other shots.
  return { kind: 'wide', x: 0, y: 0, yaw: Math.PI, pitch, distance };
}

/** Aim LOOK_PAST_M beyond `p`, away from the camera, so the pack sits in the lower frame. */
function aimPast(p: Point, yaw: number) {
  return { x: p.x - Math.sin(yaw) * LOOK_PAST_M, y: p.y - Math.cos(yaw) * LOOK_PAST_M };
}

/** Where the camera wants to be at race time `t`; the renderer eases within a shot, cuts between. */
export function shotAt(track: Track, timeline: Timeline, t: number, motion = true): Shot {
  const lanes = timeline.horses.length;
  if (!motion || t < WIDE_SECONDS) return wideShot(track, lanes);
  const { distance, horses } = timeline;
  const order = standingsAt(timeline, t);
  const lead = progressAt(timeline, order[0]!, t);
  if (lead >= distance - FINISH_SHOT_METRES) {
    const yaw = infieldYaw(track, finishS(track));
    return {
      kind: 'finish',
      ...aimPast(horsePoint(track, distance, distance, (lanes - 1) / 2), yaw),
      yaw,
      pitch: rad(PITCH_DEG.finish),
      distance: distanceForScale() * FINISH_DISTANCE_SCALE,
    };
  }
  const pack = order
    .slice(0, 3)
    .map((h) => horsePoint(track, distance, progressAt(timeline, h, t), horses.indexOf(h)));
  const mean = (f: (p: Point) => number) => pack.reduce((sum, p) => sum + f(p), 0) / pack.length;
  const yaw = infieldYaw(track, finishS(track) - distance + lead);
  return {
    kind: 'chase',
    ...aimPast({ x: mean((p) => p.x), y: mean((p) => p.y) }, yaw),
    yaw,
    pitch: rad(PITCH_DEG.chase),
    distance: distanceForScale(),
  };
}

/** Camera position in Three.js coords (x, up, z). */
export function cameraPosition(shot: Shot) {
  const flat = Math.cos(shot.pitch) * shot.distance;
  return {
    x: shot.x + Math.sin(shot.yaw) * flat,
    y: Math.sin(shot.pitch) * shot.distance,
    z: shot.y + Math.cos(shot.yaw) * flat,
  };
}
