import { describe, expect, it } from 'vitest';
import { DISTANCE, EFFECTS, MYSTERY_PER_LANE, TICK_HZ, WEATHER } from './config.ts';
import { simulateRace } from './simulate.ts';
import type { BoxType, ItemCode, RaceInput, Timeline } from './types.ts';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `h${i}`);
const race = (over: Partial<RaceInput> = {}): Timeline =>
  simulateRace({ seed: 7, horses: ids(8), bought: {}, length: 'short', ...over });
const ALL_BOUGHT: readonly BoxType[] = ['speed', 'attack', 'defense'];

describe('input validation', () => {
  it.each([
    ['too few horses', { horses: ['solo'] }],
    ['too many horses', { horses: ids(23) }],
    ['duplicate ids', { horses: ['a', 'a', 'b'] }],
    [
      'more than 3 bought boxes',
      { bought: { h0: ['speed', 'speed', 'speed', 'speed'] as BoxType[] } },
    ],
    ['boxes for an unknown horse', { bought: { nobody: ['speed'] as BoxType[] } }],
    ['non-integer seed', { seed: 1.5 }],
  ])('rejects %s', (_, over) => {
    expect(() => race(over)).toThrow(RangeError);
  });
});

describe('simulateRace', () => {
  it('is deterministic per input', () => {
    expect(race()).toEqual(race());
    expect(race({ seed: 8 }).progress).not.toEqual(race().progress);
  });

  it.each(['short', 'long'] as const)(
    'every horse finishes exactly once, in time order (%s)',
    (length) => {
      for (let seed = 1; seed <= 20; seed++) {
        const tl = race({
          seed,
          length,
          horses: ids(22),
          bought: { h0: ALL_BOUGHT, h5: ['speed'] },
        });
        expect([...tl.finishOrder].sort()).toEqual([...ids(22)].sort());
        const times = tl.finishOrder.map((id) => tl.finishTimes[id]!);
        expect(times).toEqual([...times].sort((a, b) => a - b));
        const finishes = tl.events.filter((e) => e.type === 'finish');
        expect(finishes.map((e) => e.place)).toEqual(ids(22).map((_, i) => i + 1));
        expect(tl.distance).toBe(DISTANCE[length]);
      }
    },
  );

  it('progress starts at 0, never decreases and ends at the distance', () => {
    const tl = race({ bought: { h1: ALL_BOUGHT } });
    for (const id of tl.horses) {
      const p = tl.progress[id]!;
      expect(p[0]).toBe(0);
      for (let i = 1; i < p.length; i++) expect(p[i]!).toBeGreaterThanOrEqual(p[i - 1]!);
      expect(p.at(-1)).toBe(tl.distance);
    }
  });

  it('every lane box is picked up exactly once, bought boxes included', () => {
    const tl = race({ bought: { h0: ALL_BOUGHT } });
    expect(tl.boxes.h0).toHaveLength(MYSTERY_PER_LANE[tl.length] + 3);
    for (const id of tl.horses) {
      const kinds = tl.events.flatMap((e) =>
        e.type === 'pickup' && e.horse === id ? [e.kind] : [],
      );
      expect(kinds).toEqual(tl.boxes[id]!.map((b) => b.kind));
    }
  });

  it('over many races every item and every resolution shows up', () => {
    const items = new Set<ItemCode>();
    const types = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const tl = race({ seed, horses: ids(12), bought: { h0: ALL_BOUGHT, h11: ALL_BOUGHT } });
      for (const e of tl.events) {
        types.add(e.type);
        if (e.type === 'pickup' && e.item) items.add(e.item);
      }
    }
    expect([...items].sort()).toEqual((Object.keys(EFFECTS) as ItemCode[]).sort());
    expect([...types].sort()).toEqual(['blocked', 'finish', 'hit', 'pickup', 'reflected']);
  });

  it('Golden Lasso stops its victim for 2 s and Snack Break stops the eater for 1.5 s', () => {
    let lassoChecked = 0;
    let snackChecked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const tl = race({ seed, horses: ids(12) });
      for (const e of tl.events) {
        const tick = Math.round(e.t * TICK_HZ);
        if (e.type === 'hit' && e.item === 'attack:leader') {
          const p = tl.progress[e.horse]!;
          for (let k = 1; k <= 2 * TICK_HZ; k++) expect(p[tick + k]).toBe(p[tick]);
          lassoChecked++;
        }
        if (e.type === 'pickup' && e.item === 'dud:stop') {
          const p = tl.progress[e.horse]!;
          for (let k = 1; k <= 1.5 * TICK_HZ; k++) expect(p[tick + k]).toBe(p[tick]);
          snackChecked++;
        }
      }
    }
    expect(lassoChecked).toBeGreaterThan(0);
    expect(snackChecked).toBeGreaterThan(0);
  });

  it('Hornet Swarm hits only running top-3 horses, never its sender', () => {
    let checked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const tl = race({ seed, horses: ids(12) });
      tl.events.forEach((e, k) => {
        if (e.type !== 'hit' || e.item !== 'attack:top3') return;
        expect(e.horse).not.toBe(e.by);
        const prev = tl.events[k - 1];
        if (prev?.type === 'reflected' && prev.by === e.horse) return; // bounced back to the sender
        const tick = Math.round(e.t * TICK_HZ);
        const third = tl.horses
          .map((h) => tl.progress[h]![tick]!)
          .filter((p) => p < tl.distance)
          .sort((x, y) => y - x)[2]!;
        // >= rather than membership: stored progress is rounded, so near-ties can swap places.
        expect(tl.progress[e.horse]![tick]!).toBeGreaterThanOrEqual(third);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('only Lucky Bubble makes a horse immune (not Thunder Hooves or Stampede)', () => {
    let blocked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const tl = race({ seed, horses: ids(12), bought: { h0: ['speed', 'speed', 'speed'] } });
      for (const e of tl.events) {
        if (e.type !== 'blocked' || e.reason !== 'immune') continue;
        const bubble = tl.events.some(
          (p) =>
            p.type === 'pickup' &&
            p.horse === e.horse &&
            p.item === 'defense:immune' &&
            p.t <= e.t &&
            e.t - p.t <= 6,
        );
        expect(bubble).toBe(true);
        blocked++;
      }
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it('same-tick pickups do not favour any lane', () => {
    const wins = Array.from({ length: 10 }, () => 0);
    for (let seed = 1; seed <= 300; seed++) {
      const winner = race({ seed, horses: ids(10) }).finishOrder[0]!;
      wins[ids(10).indexOf(winner)]!++;
    }
    for (const w of wins) {
      expect(w).toBeGreaterThanOrEqual(15);
      expect(w).toBeLessThanOrEqual(45);
    }
  });
});

const fingerprint = (weather?: RaceInput['weather']) => {
  let h = 2166136261;
  for (const seed of [1, 2, 3, 42, 9999]) {
    const tl = simulateRace({
      seed,
      horses: ids(12),
      bought: { h0: ['speed', 'attack'] },
      length: 'short',
      ...(weather ? { weather } : {}),
    });
    // Old timelines have no weather fields: drop them so the fingerprint compares the race itself.
    const { weather: _w, puddles: _p, ...rest } = tl;
    const s = JSON.stringify(rest);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
};

describe('weather', () => {
  it('leaves clear races exactly as they were (no extra RNG draws)', () => {
    expect(fingerprint()).toBe(2438717223); // recorded before weather touched simulate.ts
    expect(fingerprint('clear')).toBe(2438717223);
  });

  it('records weather and puddles on the timeline', () => {
    expect(race().weather).toBe('clear');
    expect(race().puddles).toEqual([]);
    const wet = race({ weather: 'rain' });
    expect(wet.weather).toBe('rain');
    expect(wet.puddles!.length).toBeGreaterThan(0);
    expect(race({ weather: 'fog' }).puddles).toEqual([]);
  });

  it('rejects an unknown weather', () => {
    expect(() => race({ weather: 'snow' as never })).toThrow(RangeError);
  });

  it('slips only at puddles, at about 15 %', () => {
    let entries = 0;
    let slips = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const tl = race({ seed, weather: 'rain', horses: ids(12) });
      const lanes = tl.horses.map((_, lane) =>
        tl.puddles!.filter((p) => p.lanes[0] <= lane && lane <= p.lanes[1]),
      );
      entries += lanes.reduce((n, l) => n + l.length, 0);
      for (const e of tl.events) {
        if (e.type !== 'slip') continue;
        slips++;
        const lane = tl.horses.indexOf(e.horse);
        const m = tl.progress[e.horse]![Math.round(e.t * TICK_HZ)]!;
        // Checked once on the tick the horse reaches the puddle: within one tick (< 3 m) past it.
        expect(lanes[lane]!.some((p) => p.at <= m + 0.01 && m <= p.at + 3)).toBe(true);
      }
    }
    expect(slips / entries).toBeGreaterThan(0.11);
    expect(slips / entries).toBeLessThan(0.19);
  });

  it('a slip slows the horse', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const tl = race({ seed, weather: 'rain' });
      const slip = tl.events.find((e) => e.type === 'slip');
      if (!slip) continue;
      const tick = Math.round(slip.t * TICK_HZ);
      const p = tl.progress[slip.horse]!;
      const during = (p[tick + 10]! - p[tick + 1]!) / 0.9;
      expect(during).toBeLessThan(15 * WEATHER.slip.mult * 1.4); // base 15 m/s, noise and kick
      return;
    }
    throw new Error('no slip in 50 seeds');
  });

  it('bumps only close neighbours, with a cooldown per pair', () => {
    let bumps = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const tl = race({ seed, weather: 'fog', horses: ids(12) });
      const last = new Map<string, number>();
      for (const e of tl.events) {
        if (e.type !== 'bump') continue;
        bumps++;
        const a = tl.horses.indexOf(e.horse);
        expect(tl.horses.indexOf(e.with)).toBe(a + 1);
        const tick = Math.round(e.t * TICK_HZ);
        const gap = Math.abs(tl.progress[e.horse]![tick]! - tl.progress[e.with]![tick]!);
        expect(gap).toBeLessThanOrEqual(WEATHER.bumpRangeM + 0.01);
        const prev = last.get(e.horse);
        if (prev !== undefined)
          expect(e.t - prev).toBeGreaterThanOrEqual(WEATHER.bumpCooldownS - 0.01);
        last.set(e.horse, e.t);
      }
    }
    expect(bumps).toBeGreaterThan(0);
  });

  it('rain and fog keep every race finishing', () => {
    for (const weather of ['rain', 'fog'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const tl = race({ seed, weather, horses: ids(22), length: 'long' });
        expect(tl.finishOrder).toHaveLength(22);
      }
    }
  });
});
