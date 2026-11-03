import { describe, expect, it } from 'vitest';
import { TRACK, TRACKS, finishS, horsePoint, trackBounds, trackById, trackPoint } from './track.ts';

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

type P = { x: number; y: number };
const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
/** Proper crossing of segments ab and cd (shared endpoints don't count). */
const crosses = (a: P, b: P, c: P, d: P) =>
  cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;

describe.each(Object.values(TRACKS))('track $id', (track) => {
  const OUTER = 55;

  it('has an inner rail about one lap long', () => {
    let length = 0;
    for (let s = 0; s < track.lap; s += 0.5) {
      length += dist(trackPoint(track, s, 0), trackPoint(track, s + 0.5, 0));
    }
    expect(Math.abs(length - track.lap) / track.lap).toBeLessThan(0.005);
  });

  it('is continuous on the rail and the outer lane', () => {
    for (let s = 0; s < track.lap; s += 1) {
      expect(dist(trackPoint(track, s, 0), trackPoint(track, s + 1, 0))).toBeLessThanOrEqual(1.1);
      expect(dist(trackPoint(track, s, OUTER), trackPoint(track, s + 1, OUTER))).toBeLessThan(3);
    }
  });

  it('never crosses itself on the outer lane', () => {
    const pts = Array.from({ length: Math.ceil(track.lap / 4) }, (_, i) =>
      trackPoint(track, i * 4, OUTER),
    );
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        expect(crosses(pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!)).toBe(false);
      }
    }
  });

  it('finishes on the bottom home straight, above the stands', () => {
    const f = trackPoint(track, finishS(track), 0);
    const ahead = trackPoint(track, finishS(track) + 5, 0);
    expect(ahead.x).toBeGreaterThan(f.x);
    expect(ahead.y).toBeCloseTo(f.y);
    expect(Math.abs(f.x)).toBeLessThan(1);
    expect(track.stands.y0).toBeGreaterThan(f.y);
    expect(track.stands.x0).toBeLessThan(f.x);
    expect(track.stands.x1).toBeGreaterThan(f.x);
  });

  it('bounds every lane', () => {
    const b = trackBounds(track, 22);
    for (let s = 0; s < track.lap; s += 2) {
      const p = trackPoint(track, s, OUTER);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(b.halfWidth + 1e-6);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(b.halfHeight + 1e-6);
    }
  });
});

describe('trackById', () => {
  it('falls back to the oval', () => {
    expect(trackById('nope')).toBe(TRACK);
    expect(trackById(null)).toBe(TRACK);
    expect(trackById('toString')).toBe(TRACK);
    expect(trackById('kidney')).toBe(TRACKS.kidney);
  });
});
