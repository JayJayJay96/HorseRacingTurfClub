import { describe, expect, it } from 'vitest';
import { fakeTimeline } from '../sim/testTimeline.ts';
import { FINISH_SHOT_METRES, FINISH_ZOOM, FOLLOW_ZOOM, WIDE, cameraAt } from './camera.ts';
import { TRACK, horsePoint } from './track.ts';

describe('cameraAt', () => {
  const speeds = { a: 10, b: 9, c: 8, d: 7 };
  const tl = fakeTimeline(speeds, 1000);

  it('is wide during the countdown and the first 2 s', () => {
    expect(cameraAt(TRACK, tl, -4)).toEqual(WIDE);
    expect(cameraAt(TRACK, tl, 1.9)).toEqual(WIDE);
  });

  it('follows the centroid of the top 3', () => {
    const t = 30;
    const pts = [speeds.a, speeds.b, speeds.c].map((v, lane) =>
      horsePoint(TRACK, 1000, v * t, lane),
    );
    const cam = cameraAt(TRACK, tl, t);
    expect(cam.zoom).toBe(FOLLOW_ZOOM);
    expect(cam.x).toBeCloseTo((pts[0]!.x + pts[1]!.x + pts[2]!.x) / 3);
    expect(cam.y).toBeCloseTo((pts[0]!.y + pts[1]!.y + pts[2]!.y) / 3);
  });

  it('holds on the finish line once the leader is close', () => {
    const t = (1000 - FINISH_SHOT_METRES) / 10;
    const finish = horsePoint(TRACK, 1000, 1000, 0);
    expect(cameraAt(TRACK, tl, t)).toEqual({ x: finish.x, y: finish.y, zoom: FINISH_ZOOM });
    expect(cameraAt(TRACK, tl, 500)).toEqual({ x: finish.x, y: finish.y, zoom: FINISH_ZOOM });
  });
});
