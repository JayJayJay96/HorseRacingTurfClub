import { describe, expect, it } from 'vitest';
import { TRACK, finishS, horsePoint, trackBounds, trackPoint } from './track.ts';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('track', () => {
  it('is a 1200 m lap with 300 m straights', () => {
    expect(TRACK.lap).toBe(1200);
    expect(2 * TRACK.straight + 2 * Math.PI * TRACK.radius).toBeCloseTo(1200);
  });

  it('is continuous and arc-length parametrised along lane 0', () => {
    for (let s = 0; s < TRACK.lap; s += 0.5) {
      expect(dist(trackPoint(TRACK, s, 0), trackPoint(TRACK, s + 0.5, 0))).toBeCloseTo(0.5, 2);
    }
  });

  it('wraps every lap, including negative distances', () => {
    for (const s of [0, 123, 777]) {
      const p = trackPoint(TRACK, s, 3);
      expect(dist(p, trackPoint(TRACK, s + TRACK.lap, 3))).toBeCloseTo(0);
      expect(dist(p, trackPoint(TRACK, s - TRACK.lap, 3))).toBeCloseTo(0);
    }
  });

  it('puts the finish mid home straight, in front of the stands', () => {
    expect(finishS(TRACK)).toBe(150);
    const p = horsePoint(TRACK, 1800, 1800, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(TRACK.radius + TRACK.laneWidth / 2);
  });

  it('starts a race `distance` metres before the finish', () => {
    // Short = 1.5 laps: the start is mid back straight.
    const start = horsePoint(TRACK, 1800, 0, 0);
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(-(TRACK.radius + TRACK.laneWidth / 2));
  });

  it('puts higher lanes further out', () => {
    const centre = (s: number, lane: number) => {
      const p = horsePoint(TRACK, 1800, s, lane);
      return Math.hypot(Math.max(Math.abs(p.x) - TRACK.straight / 2, 0), p.y);
    };
    for (const s of [0, 300, 700, 1100]) expect(centre(s, 5)).toBeGreaterThan(centre(s, 0));
  });

  it('bounds the whole track for a field', () => {
    const b = trackBounds(TRACK, 10);
    expect(b.halfWidth).toBeCloseTo(150 + TRACK.radius + 25);
    expect(b.halfHeight).toBeCloseTo(TRACK.radius + 25);
  });
});
