import { describe, expect, it } from 'vitest';
import { DISTANCE, EFFECTS, MYSTERY_PER_LANE, TICK_HZ, TRAITS, WEATHER } from './config.ts';
import { simulateRace } from './simulate.ts';
import { earlyPaceOf, toughen } from './traits.ts';
import type { BoxType, HotItem, ItemCode, RaceInput, Timeline, Trait } from './types.ts';

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

const fingerprint = (over: Partial<RaceInput> = {}) => {
  let h = 2166136261;
  for (const seed of [1, 2, 3, 42, 9999]) {
    const tl = simulateRace({
      seed,
      horses: ids(12),
      bought: { h0: ['speed', 'attack'] },
      length: 'short',
      ...over,
    });
    // Old timelines have none of these fields: drop them so the fingerprint compares the race itself.
    const { weather: _w, puddles: _p, hot: _h, traits: _t, ...rest } = tl;
    const s = JSON.stringify(rest);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
};

describe('weather', () => {
  it('leaves clear races exactly as they were (no extra RNG draws)', () => {
    expect(fingerprint()).toBe(2438717223); // recorded before weather touched simulate.ts
    expect(fingerprint({ weather: 'clear' })).toBe(2438717223);
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

  it('ignores defenses: a slip still lands on a horse holding or protected by one', () => {
    const bought = Object.fromEntries(
      ids(12).map((h) => [h, ['defense', 'defense', 'defense'] as BoxType[]]),
    );
    const found = { immune: false, held: false };
    for (let seed = 1; seed <= 300 && !(found.immune && found.held); seed++) {
      const tl = race({ seed, weather: 'rain', horses: ids(12), bought });
      for (const slip of tl.events.filter((e) => e.type === 'slip')) {
        // Nothing may block, reflect or otherwise answer the slip.
        const answered = tl.events.some(
          (e) =>
            (e.type === 'blocked' || e.type === 'reflected') &&
            e.horse === slip.horse &&
            e.t === slip.t,
        );
        expect(answered).toBe(false);
        const picks = tl.events.filter(
          (e) =>
            e.type === 'pickup' &&
            e.horse === slip.horse &&
            e.t < slip.t &&
            e.item?.startsWith('defense:'),
        );
        for (const pick of picks) {
          if (pick.type !== 'pickup') continue;
          if (
            pick.item === 'defense:immune' &&
            slip.t <= pick.t + EFFECTS['defense:immune'].seconds
          )
            found.immune = true;
          // Held shield/mirror: still unspent (no block or reflect for this horse since the pickup).
          const spent = tl.events.some(
            (e) =>
              (e.type === 'blocked' || e.type === 'reflected') &&
              e.horse === slip.horse &&
              e.t > pick.t &&
              e.t <= slip.t,
          );
          if (pick.item !== 'defense:immune' && !spent) found.held = true;
        }
      }
    }
    expect(found).toEqual({ immune: true, held: true });
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

describe('hot items', () => {
  const allBoxes = (box: BoxType) =>
    Object.fromEntries(ids(12).map((h) => [h, [box, box, box] as BoxType[]]));

  it('no hot items: exactly the old race (no extra RNG draws)', () => {
    expect(fingerprint({ hot: [] })).toBe(2438717223);
  });

  it('rejects bad hot lists', () => {
    const bad: HotItem[][] = [
      [
        { item: 'speed:self1', buff: 'lucky' },
        { item: 'speed:star', buff: 'lucky' },
        { item: 'attack:leader', buff: 'lucky' },
        { item: 'defense:immune', buff: 'lucky' },
      ],
      [
        { item: 'speed:self1', buff: 'lucky' },
        { item: 'speed:self1', buff: 'extended' },
      ],
      [{ item: 'dud:stop', buff: 'lucky' }],
      [{ item: 'speed:self1', buff: 'golden' as never }],
      [{ item: 'defense:block1', buff: 'extended' }],
      [{ item: 'defense:reflect', buff: 'extended' }],
    ];
    for (const hot of bad) expect(() => race({ hot })).toThrow(RangeError);
  });

  it('records the list and flags hot pickups only', () => {
    const hot: HotItem[] = [{ item: 'speed:self1', buff: 'lucky' }];
    const tl = race({ hot, horses: ids(12), bought: allBoxes('speed') });
    expect(tl.hot).toEqual(hot);
    expect(race().hot).toEqual([]);
    let flagged = 0;
    for (const e of tl.events) {
      if (e.type !== 'pickup') continue;
      if (e.item === 'speed:self1') {
        expect(e.hot).toBe('lucky');
        flagged++;
      } else expect(e.hot).toBeUndefined();
    }
    expect(flagged).toBeGreaterThan(0);
  });

  it('a Lucky Carrot fills about half the bought Speed boxes', () => {
    const hot: HotItem[] = [{ item: 'speed:self1', buff: 'lucky' }];
    let speed = 0;
    let carrots = 0;
    for (let seed = 1; seed <= 100; seed++) {
      for (const e of race({ seed, hot, horses: ids(12), bought: allBoxes('speed') }).events) {
        if (e.type !== 'pickup' || e.kind !== 'speed') continue;
        speed++;
        if (e.item === 'speed:self1') carrots++;
      }
    }
    expect(carrots / speed).toBeGreaterThan(0.46);
    expect(carrots / speed).toBeLessThan(0.54);
  });

  it('an Extended Golden Lasso stops its victim for 3 s', () => {
    const hot: HotItem[] = [{ item: 'attack:leader', buff: 'extended' }];
    let checked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const tl = race({ seed, horses: ids(12), hot });
      for (const e of tl.events) {
        if (e.type !== 'hit' || e.item !== 'attack:leader') continue;
        const tick = Math.round(e.t * TICK_HZ);
        const p = tl.progress[e.horse]!;
        for (let k = 1; k <= 3 * TICK_HZ; k++) expect(p[tick + k]).toBe(p[tick]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('an Extended Lucky Bubble keeps its horse immune for 9 s', () => {
    const hot: HotItem[] = [{ item: 'defense:immune', buff: 'extended' }];
    const longest = EFFECTS['defense:immune'].seconds * 1.5;
    let late = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const tl = race({ seed, horses: ids(12), hot, bought: allBoxes('defense') });
      for (const e of tl.events) {
        if (e.type !== 'blocked' || e.reason !== 'immune') continue;
        const bubble = tl.events
          .filter(
            (p) =>
              p.type === 'pickup' &&
              p.horse === e.horse &&
              p.item === 'defense:immune' &&
              p.t <= e.t,
          )
          .at(-1)!;
        expect(e.t - bubble.t).toBeLessThanOrEqual(longest + 0.01);
        if (e.t - bubble.t > EFFECTS['defense:immune'].seconds) late++;
      }
    }
    expect(late).toBeGreaterThan(0); // some blocks land in the extra 3 s
  });
});

const allOf = (trait: Trait, n = 12): Record<string, Trait> =>
  Object.fromEntries(ids(n).map((h) => [h, trait]));

describe('traits', () => {
  it('an all-Normal field races exactly as before', () => {
    expect(fingerprint({ traits: allOf('normal') })).toBe(2438717223);
    expect(fingerprint({ traits: {} })).toBe(2438717223);
  });

  it('rejects unknown traits and unknown horses', () => {
    expect(() => race({ traits: { h0: 'lucky' as never } })).toThrow(RangeError);
    expect(() => race({ traits: { nobody: 'tough' } })).toThrow(RangeError);
  });

  it("records every horse's trait, Normal by default", () => {
    expect(race({ traits: { h1: 'stayer' } }).traits).toEqual({
      ...allOf('normal', 8),
      h1: 'stayer',
    });
  });

  it('Sprinter and Stayer change the pace over the first third', () => {
    const at10s = (trait: Trait) => {
      let sum = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const tl = race({ seed, horses: ids(12), traits: allOf(trait) });
        for (const h of ids(12)) sum += tl.progress[h]![100]!; // ~150 m, well inside 600 m
      }
      return sum;
    };
    const normal = at10s('normal');
    for (const trait of ['sprinter', 'stayer'] as const) {
      const want = earlyPaceOf(trait);
      expect(Math.abs(at10s(trait) / normal - want)).toBeLessThan(Math.abs(want - 1) / 2 + 0.002);
    }
  });

  it('Charmed: fewer duds, never Stampede or Thunderclap', () => {
    const count = (trait: Trait) => {
      let duds = 0;
      let rare = 0;
      for (let seed = 1; seed <= 100; seed++) {
        for (const e of race({ seed, horses: ids(12), traits: allOf(trait) }).events) {
          if (e.type !== 'pickup') continue;
          if (e.item?.startsWith('dud:')) duds++;
          if (e.item === 'speed:pass3' || e.item === 'attack:all') rare++;
        }
      }
      return { duds, rare };
    };
    const normal = count('normal');
    const charmed = count('charmed');
    expect(normal.rare).toBeGreaterThan(0);
    expect(charmed.rare).toBe(0);
    const keep = 1 - TRAITS.charmed.rerollPercent / 100;
    expect(Math.abs(charmed.duds / normal.duds - keep)).toBeLessThan(0.12);
  });

  it('Tough: the Golden Lasso only slows it', () => {
    let checked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const tl = race({ seed, horses: ids(12), traits: allOf('tough') });
      for (const e of tl.events) {
        if (e.type !== 'hit' || e.item !== 'attack:leader') continue;
        const tick = Math.round(e.t * TICK_HZ);
        const p = tl.progress[e.horse]!;
        expect(p[tick + 2 * TICK_HZ]!).toBeGreaterThan(p[tick]!);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('Tough: a rain slip slows it less', () => {
    // Noise takes at most 6 % off; a Normal slip tops out near 15 * 0.5 * 1.17, below this floor.
    const floor = 15 * toughen(WEATHER.slip.mult) * 0.9;
    let checked = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const tl = race({ seed, weather: 'rain', horses: ids(12), traits: allOf('tough') });
      for (const slip of tl.events) {
        if (slip.type !== 'slip') continue;
        // Clean slips only: no other event for this horse from 4 s before to just after.
        const busy = tl.events.some(
          (e) =>
            e !== slip &&
            e.type !== 'finish' &&
            e.horse === slip.horse &&
            e.t > slip.t - 4 &&
            e.t <= slip.t + 1.6,
        );
        const tick = Math.round(slip.t * TICK_HZ);
        const p = tl.progress[slip.horse]!;
        if (busy || p[tick + 15]! >= tl.distance) continue;
        expect((p[tick + 15]! - p[tick + 1]!) / 1.4).toBeGreaterThan(floor);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('Mudder: slips at its own chance', () => {
    let entries = 0;
    let slips = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const tl = race({ seed, weather: 'rain', horses: ids(12), traits: allOf('mudder') });
      entries += tl.horses.reduce(
        (n, _, lane) =>
          n + tl.puddles!.filter((p) => p.lanes[0] <= lane && lane <= p.lanes[1]).length,
        0,
      );
      slips += tl.events.filter((e) => e.type === 'slip').length;
    }
    expect(Math.abs(slips / entries - TRAITS.mudder.slipChancePercent / 100)).toBeLessThan(0.025);
  });

  it('Mudder: each Mudder in a fog pair scales its bump chance', () => {
    const bumps = (traits: Record<string, Trait>) => {
      let n = 0;
      for (let seed = 1; seed <= 100; seed++) {
        n += race({ seed, weather: 'fog', horses: ids(12), traits }).events.filter(
          (e) => e.type === 'bump',
        ).length;
      }
      return n;
    };
    const ratio = bumps(allOf('mudder')) / bumps(allOf('normal'));
    expect(Math.abs(ratio - TRAITS.mudder.bumpFactor ** 2)).toBeLessThan(0.12);
  });

  it('Mudder: slower on a clear day', () => {
    const meanWinner = (trait: Trait) => {
      let sum = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const tl = race({ seed, horses: ids(12), traits: allOf(trait) });
        sum += tl.finishTimes[tl.finishOrder[0]!]!;
      }
      return sum;
    };
    const want = 1 / TRAITS.mudder.clearPace;
    const ratio = meanWinner('mudder') / meanWinner('normal');
    expect(Math.abs(ratio - want)).toBeLessThan(Math.max((want - 1) / 2, 0.002));
  });
});
