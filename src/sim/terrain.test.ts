import { describe, expect, it } from 'vitest';
import { DISTANCE, TERRAIN } from './config.ts';
import { simulateRace } from './simulate.ts';
import { curvature, paceAt, raceTerrain, surfaceAt } from './terrain.ts';
import { TRACKS, TRACK_IDS, type TrackId } from './track.ts';
import type { RaceInput } from './types.ts';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `h${i}`);
const race = (over: Partial<RaceInput> = {}) =>
  simulateRace({ seed: 5, horses: ids(8), bought: {}, length: 'short', ...over });
const meanWinner = (track: TrackId) => {
  let sum = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const tl = race({ seed, track });
    sum += tl.finishTimes[tl.finishOrder[0]!]!;
  }
  return sum / 60;
};

describe('terrain (spec 2026-11-06 C)', () => {
  it('the three original tracks stay flat: same race as no track at all', () => {
    for (const track of ['oval', 'speedway', 'kidney'] as const) {
      expect(raceTerrain(TRACKS[track], 1800)).toEqual({ pace: null, hurdles: [] });
      const { track: _t, ...rest } = race({ track });
      expect(rest).toEqual(race());
    }
  });

  it('rejects an unknown track', () => {
    expect(() => race({ track: 'moon' as TrackId })).toThrow(RangeError);
  });

  it('every track has a name, a blurb and heights on the grass', () => {
    for (const id of TRACK_IDS) {
      const t = TRACKS[id];
      expect(t.blurb.length).toBeGreaterThan(10);
      for (let s = 0; s < t.lap; s += 7) expect(t.height?.(s) ?? 0).toBeGreaterThanOrEqual(0);
    }
  });

  it('slopes: slower uphill, faster downhill, within the caps', () => {
    const t = TRACKS.summit;
    // Climbs from the finish for 70 % of the lap, then drops.
    expect(paceAt(t, t.finishS + 0.35 * t.lap)).toBeLessThan(1);
    expect(paceAt(t, t.finishS + 0.85 * t.lap)).toBeGreaterThan(1);
    for (let s = 0; s < t.lap; s += 5) {
      expect(paceAt(t, s)).toBeGreaterThanOrEqual(TERRAIN.minUpPace);
      expect(paceAt(t, s)).toBeLessThanOrEqual(TERRAIN.maxDownPace);
    }
  });

  it('ice: fast on the straights, slow round the bends', () => {
    const t = TRACKS.ice;
    expect(curvature(t, 75)).toBeCloseTo(0, 5);
    expect(paceAt(t, 75)).toBeCloseTo(TERRAIN.iceStraightPace);
    const bend = paceAt(t, 150 + 200);
    expect(bend).toBeLessThan(0.92);
    expect(bend).toBeGreaterThan(TERRAIN.iceMinPace);
  });

  it('sand slows only inside its zone', () => {
    const t = TRACKS.seaside;
    const z = t.zones![0]!;
    expect(surfaceAt(t, z.from + 10)).toBe('sand');
    expect(paceAt(t, z.from + 10)).toBeCloseTo(TERRAIN.sandPace);
    expect(surfaceAt(t, t.finishS)).toBeNull();
  });

  it('hurdles: the field meets each one in race order; about the stumble chance trips', () => {
    const { hurdles } = raceTerrain(TRACKS.steeple, DISTANCE.short);
    expect(hurdles.length).toBeGreaterThanOrEqual(8); // 1.5 laps of 6
    expect([...hurdles].sort((a, b) => a - b)).toEqual(hurdles);
    let met = 0;
    let stumbles = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const tl = race({ seed, horses: ids(10), track: 'steeple' });
      met += 10 * hurdles.length;
      stumbles += tl.events.filter((e) => e.type === 'stumble').length;
    }
    expect(Math.abs(stumbles / met - TERRAIN.hurdleStumblePercent / 100)).toBeLessThan(0.02);
  });

  it('hilly, sandy and icy tracks run slower than the flat oval; the timeline names its track', () => {
    const oval = meanWinner('oval');
    for (const id of ['summit', 'canyon', 'seaside', 'ice'] as const) {
      expect(meanWinner(id)).toBeGreaterThan(oval);
    }
    expect(race({ track: 'downs' }).track).toBe('downs');
  });
});
