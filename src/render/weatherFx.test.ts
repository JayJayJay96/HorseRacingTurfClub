import { describe, expect, it } from 'vitest';
import { TRACKS, horsePoint } from './track.ts';
import { RAIN, puddleOutline, rainDrop } from './weatherFx.ts';

describe('puddleOutline', () => {
  it('is a ring round the puddle centre, within its lanes', () => {
    const track = TRACKS.oval;
    const ring = puddleOutline(track, 1800, { at: 500, lanes: [2, 4] });
    expect(ring.length).toBe(16);
    const centre = horsePoint(track, 1800, 502, 3);
    for (const p of ring) {
      const r = Math.hypot(p.x - centre.x, p.y - centre.y);
      expect(r).toBeLessThanOrEqual(1.5 * track.laneWidth * 1.1 + 2.5);
      expect(r).toBeGreaterThan(0.5);
    }
  });

  it('works for a single edge lane', () => {
    const track = TRACKS.oval;
    const ring = puddleOutline(track, 1800, { at: 500, lanes: [0, 0] });
    const centre = horsePoint(track, 1800, 502, 0);
    for (const p of ring) {
      const r = Math.hypot(p.x - centre.x, p.y - centre.y);
      expect(r).toBeLessThanOrEqual(0.5 * track.laneWidth * 1.1 + 2.5);
      expect(r).toBeGreaterThan(0.5);
    }
  });
});

describe('rainDrop', () => {
  it('stays in its box and loops', () => {
    for (const t of [0, 0.3, 5, 100]) {
      for (let i = 0; i < 20; i++) {
        const d = rainDrop(i, t);
        expect(Math.abs(d.x)).toBeLessThanOrEqual(RAIN.half);
        expect(Math.abs(d.z)).toBeLessThanOrEqual(RAIN.half);
        expect(d.y).toBeGreaterThan(0);
        expect(d.y).toBeLessThanOrEqual(RAIN.top);
      }
    }
    expect(rainDrop(3, 0).y).toBeCloseTo(rainDrop(3, RAIN.top / RAIN.speed).y, 5);
  });
});
