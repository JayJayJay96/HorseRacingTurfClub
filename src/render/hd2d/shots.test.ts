import { describe, expect, it } from 'vitest';
import { fakeTimeline } from '../../sim/testTimeline.ts';
import { FINISH_SHOT_METRES } from '../camera.ts';
import { TRACK, horsePoint } from '../track.ts';
import { LOOK_PAST_M, PITCH_DEG, distanceForScale } from './look.ts';
import { WIDE_SECONDS, cameraPosition, shotAt } from './shots.ts';

describe('shotAt', () => {
  const speeds = { a: 10, b: 9, c: 8, d: 7 };
  const tl = fakeTimeline(speeds, 1000);

  it('is wide during the countdown, the first 2 s, and always with reduced motion', () => {
    expect(shotAt(TRACK, tl, -3).kind).toBe('wide');
    expect(shotAt(TRACK, tl, WIDE_SECONDS - 0.1).kind).toBe('wide');
    expect(shotAt(TRACK, tl, 30, false).kind).toBe('wide');
  });

  it('chases the top 3, aimed past the pack, at the pixel-target distance', () => {
    const t = 30;
    const shot = shotAt(TRACK, tl, t);
    const pts = [speeds.a, speeds.b, speeds.c].map((v, lane) =>
      horsePoint(TRACK, 1000, v * t, lane),
    );
    const cx = (pts[0]!.x + pts[1]!.x + pts[2]!.x) / 3;
    const cy = (pts[0]!.y + pts[1]!.y + pts[2]!.y) / 3;
    expect(shot.kind).toBe('chase');
    expect(shot.x).toBeCloseTo(cx - Math.sin(shot.yaw) * LOOK_PAST_M);
    expect(shot.y).toBeCloseTo(cy - Math.cos(shot.yaw) * LOOK_PAST_M);
    expect(shot.distance).toBeCloseTo(distanceForScale());
    expect(shot.pitch).toBeCloseTo((PITCH_DEG.chase * Math.PI) / 180);
  });

  it('cuts to the finish shot once the leader is close', () => {
    expect(shotAt(TRACK, tl, (1000 - FINISH_SHOT_METRES) / 10).kind).toBe('finish');
    const shot = shotAt(TRACK, tl, 500);
    expect(shot.kind).toBe('finish');
    const f = horsePoint(TRACK, 1000, 1000, (4 - 1) / 2);
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
