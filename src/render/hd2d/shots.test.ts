import { describe, expect, it } from 'vitest';
import { fakeTimeline } from '../../sim/testTimeline.ts';
import { FINISH_SHOT_METRES } from '../camera.ts';
import { TRACK, horsePoint } from '../track.ts';
import {
  FOLLOW_DISTANCE_SCALE,
  FOLLOW_PACK,
  LOOK_PAST_M,
  PITCH_DEG,
  distanceForScale,
} from './look.ts';
import { WIDE_SECONDS, cameraPosition, shotAt } from './shots.ts';

describe('shotAt', () => {
  const speeds = { a: 10, b: 9, c: 8, d: 7, e: 6, f: 5 };
  const tl = fakeTimeline(speeds, 1000);

  it('is wide during the countdown, the first 2 s, and always with reduced motion', () => {
    expect(shotAt(TRACK, tl, -3).kind).toBe('wide');
    expect(shotAt(TRACK, tl, WIDE_SECONDS - 0.1).kind).toBe('wide');
    expect(shotAt(TRACK, tl, 30, false).kind).toBe('wide');
  });

  it('chases the plain top-5 centroid from the follow distance and pitch', () => {
    const t = 30;
    const shot = shotAt(TRACK, tl, t);
    const pts = Object.values(speeds)
      .slice(0, FOLLOW_PACK)
      .map((v, lane) => horsePoint(TRACK, 1000, v * t, lane));
    expect(pts).toHaveLength(5);
    expect(shot.kind).toBe('chase');
    expect(shot.x).toBeCloseTo(pts.reduce((s, p) => s + p.x, 0) / 5);
    expect(shot.y).toBeCloseTo(pts.reduce((s, p) => s + p.y, 0) / 5);
    expect(shot.distance).toBeCloseTo(distanceForScale() * FOLLOW_DISTANCE_SCALE);
    expect(PITCH_DEG.chase).toBe(50);
    expect(shot.pitch).toBeCloseTo((PITCH_DEG.chase * Math.PI) / 180);
  });

  it('never turns the chase camera: yaw is pi on the home and the far straight alike', () => {
    // 1800 m starts on the far straight and passes the home straight once before the finish.
    const long = fakeTimeline(speeds, 1800);
    let home = false;
    let far = false;
    for (let t = WIDE_SECONDS; t < (1800 - FINISH_SHOT_METRES) / 10; t += 0.5) {
      const shot = shotAt(TRACK, long, t);
      expect(shot.kind).toBe('chase');
      expect(shot.yaw).toBe(Math.PI);
      // Straights are |x| < 150 on the oval; home is +y (finish side), far is -y.
      if (Math.abs(shot.x) < 100) {
        if (shot.y > 0) home = true;
        else far = true;
      }
    }
    expect(home).toBe(true);
    expect(far).toBe(true);
    expect(shotAt(TRACK, tl, 30).yaw).toBe(Math.PI);
  });

  it('cuts to the finish shot once the leader is close', () => {
    expect(shotAt(TRACK, tl, (1000 - FINISH_SHOT_METRES) / 10).kind).toBe('finish');
    const shot = shotAt(TRACK, tl, 500);
    expect(shot.kind).toBe('finish');
    const f = horsePoint(TRACK, 1000, 1000, (6 - 1) / 2);
    expect(Math.hypot(shot.x - f.x, shot.y - f.y)).toBeCloseTo(LOOK_PAST_M);
  });

  it('sits on the infield side: on the home straight the camera is north of the target', () => {
    // The finish is mid home straight (y = +radius); the infield is toward -y.
    const shot = shotAt(TRACK, tl, 500);
    const cam = cameraPosition(shot);
    expect(cam.z).toBeLessThan(shot.y);
    expect(cam.y).toBeCloseTo(Math.sin(shot.pitch) * shot.distance);
  });

  it('the wide shot fits the whole track', () => {
    const wide = shotAt(TRACK, tl, 0);
    expect(wide.x).toBe(0);
    expect(wide.y).toBe(0);
    expect(wide.distance).toBeGreaterThan(distanceForScale() * 3);
  });
});
