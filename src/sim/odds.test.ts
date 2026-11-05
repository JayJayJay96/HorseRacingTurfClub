import { describe, expect, it } from 'vitest';
import { blendHistory, groupLanes, ODDS, priceOdds, simulateOdds, simulateShares } from './odds.ts';
import { createSeededRng } from './rng.ts';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `h${i}`);
const frozenClock = () => 0;

describe('priceOdds', () => {
  it.each([
    [0.5, ODDS.win, 1.8],
    [0.1, ODDS.win, 9],
    [0.03, ODDS.win, 20], // 30 → max
    [0, ODDS.win, 20],
    [0.75, ODDS.win, 1.2], // exactly the minimum
    [0.9, ODDS.win, null], // 1.0 < min: closed, not lifted to 1.2
    [1, ODDS.place, null], // 0.9 < min
    [0.85, ODDS.place, 1.1], // 1.06 → 1.1
    [0.3, ODDS.place, 3],
    [0.05, ODDS.place, 6],
  ])('p=%s', (p, range, expected) => {
    expect(priceOdds(p, range)).toBe(expected);
  });

  it('never offers a bet that returns more than it costs on average', () => {
    for (const range of [ODDS.win, ODDS.place, ODDS.group]) {
      for (let p = 0.01; p <= 1; p += 0.001) {
        const odds = priceOdds(p, range);
        if (odds !== null) expect(odds * p).toBeLessThan(1);
      }
    }
  });
});

describe('simulateShares', () => {
  it('counts one winner and three top-3 finishers per run', () => {
    const horses = ids(5);
    const { wins, top3, sims } = simulateShares(
      { horses, bought: { h0: ['speed'] }, length: 'short' },
      createSeededRng(3),
      frozenClock,
    );
    const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    expect(sum(wins)).toBeCloseTo(sims);
    expect(sum(top3)).toBeCloseTo(3 * sims);
  });

  it('gives horses with the same boxes the same share and the same odds', () => {
    const horses = ids(6);
    const race = { horses, bought: { h0: ['speed'] as const }, length: 'short' as const };
    const { wins, top3 } = simulateShares(race, createSeededRng(4), frozenClock);
    for (const h of horses.slice(2)) {
      expect(wins.get(h)).toBe(wins.get('h1'));
      expect(top3.get(h)).toBe(top3.get('h1'));
    }
    const { odds } = simulateOdds(race, createSeededRng(4), frozenClock);
    for (const h of horses.slice(2)) expect(odds[h]).toEqual(odds.h1);
  });
});

describe('group bets', () => {
  it('splits the numbers: odd/even, low = first half rounded down', () => {
    expect(groupLanes('odd', 5)).toEqual([1, 3, 5]);
    expect(groupLanes('even', 5)).toEqual([2, 4]);
    expect(groupLanes('low', 5)).toEqual([1, 2]);
    expect(groupLanes('high', 5)).toEqual([3, 4, 5]);
  });

  it('prices groups from summed win chances, only with 4+ horses', () => {
    const race = (n: number) => ({ horses: ids(n), bought: {}, length: 'short' as const });
    const { groups } = simulateOdds(race(6), createSeededRng(5), frozenClock);
    // Six equal horses: each half wins half the time, so 0.9 / 0.5 = 1.8x.
    for (const g of ['odd', 'even', 'low', 'high'] as const) expect(groups[g]).toBe(1.8);
    expect(simulateOdds(race(3), createSeededRng(5), frozenClock).groups).toEqual({});
  });
});

describe('simulateOdds', () => {
  it('prices an even 2-horse race near 0.9 / 0.5', () => {
    const { odds, sims } = simulateOdds(
      { horses: ['a', 'b'], bought: {}, length: 'short' },
      createSeededRng(1),
      frozenClock,
    );
    expect(sims).toBe(ODDS.maxSims);
    for (const h of ['a', 'b']) {
      expect(odds[h]!.win).toBeGreaterThanOrEqual(1.6);
      expect(odds[h]!.win).toBeLessThanOrEqual(2.1);
      expect(odds[h]!.place).toBeNull(); // everyone places in a 2-horse race: closed
    }
  });

  it('gives a 3-Speed horse shorter win odds than the typical horse', () => {
    const horses = ids(10);
    const { odds } = simulateOdds(
      { horses, bought: { h0: ['speed', 'speed', 'speed'] }, length: 'short' },
      createSeededRng(2),
      frozenClock,
    );
    const others = horses
      .slice(1)
      .map((h) => odds[h]!.win!)
      .sort((a, b) => a - b);
    expect(odds.h0!.win!).toBeLessThan(others[4]!);
  });

  it('stops at the time budget but always runs minSims', () => {
    let t = 0;
    const { sims } = simulateOdds(
      { horses: ['a', 'b'], bought: {}, length: 'short' },
      createSeededRng(3),
      () => (t += 1000),
    );
    expect(sims).toBe(ODDS.minSims);
  });
});

describe('blendHistory', () => {
  it('is 0.7·p_sim + 0.3·p_hist, with p_hist pulled toward the field share', () => {
    // No history: p_hist = (0 + 5·0.25) / 5 = 0.25
    expect(blendHistory(0.5, 0, 0, 0.25)).toBeCloseTo(0.7 * 0.5 + 0.3 * 0.25);
    // 10 wins in 10 races: p_hist = (10 + 1.25) / 15 = 0.75
    expect(blendHistory(0.5, 10, 10, 0.25)).toBeCloseTo(0.7 * 0.5 + 0.3 * 0.75);
  });
});

describe('simulateOdds with history', () => {
  it('shortens a habitual winner but never lengthens anyone past the simulation', () => {
    const race = { horses: ids(4), bought: {}, length: 'short' as const };
    const plain = simulateOdds(race, createSeededRng(7), frozenClock);
    const hist = {
      h0: { races: 20, wins: 20, top3: 20 },
      h1: { races: 20, wins: 0, top3: 0 },
    };
    const blended = simulateOdds(race, createSeededRng(7), frozenClock, hist);
    expect(blended.sims).toBe(plain.sims);
    expect(blended.odds.h0!.win!).toBeLessThan(plain.odds.h0!.win!);
    // A habitual loser keeps its simulated odds: history can't make a bet on it pay more.
    expect(blended.odds.h1!.win).toBe(plain.odds.h1!.win);
    for (const h of race.horses) {
      expect(blended.odds[h]!.win!).toBeLessThanOrEqual(plain.odds[h]!.win!);
    }
  });

  it('prices a boxed horse with no history from its simulated chance', () => {
    // History knows nothing about this race's boxes, so the old blend underpriced boxed horses.
    const race = {
      horses: ids(6),
      bought: { h0: ['speed', 'speed', 'speed'] as const },
      length: 'short' as const,
    };
    const plain = simulateOdds(race, createSeededRng(9), frozenClock);
    const blended = simulateOdds(race, createSeededRng(9), frozenClock, {});
    expect(blended.odds.h0).toEqual(plain.odds.h0);
  });
});

describe('weather in the odds', () => {
  it('passes the weather to every simulated race', () => {
    const race = {
      horses: ids(6),
      bought: { h0: ['speed', 'speed', 'speed'] },
      length: 'short',
    } as const; // identical seeds give identical shares, so a difference proves weather reached simulateRace; equal horses would tie in any weather
    const clear = simulateShares(race, createSeededRng(11), frozenClock);
    const rain = simulateShares({ ...race, weather: 'rain' }, createSeededRng(11), frozenClock);
    expect(rain).not.toEqual(clear);
  });
});

describe('hot items and traits in the odds', () => {
  it('passes the hot items to every simulated race', () => {
    const race = {
      horses: ids(6),
      bought: { h0: ['attack', 'attack', 'attack'] },
      length: 'short',
    } as const;
    const plain = simulateShares(race, createSeededRng(12), frozenClock);
    const hot = simulateShares(
      { ...race, hot: [{ item: 'attack:leader', buff: 'extended' }] },
      createSeededRng(12),
      frozenClock,
    );
    expect(hot).not.toEqual(plain);
  });

  it('prices each trait on its own instead of averaging it away', () => {
    const race = {
      horses: ids(4),
      bought: {},
      length: 'short',
      traits: { h0: 'sprinter' },
    } as const;
    const { wins } = simulateShares(race, createSeededRng(13), frozenClock);
    expect(wins.get('h0')).not.toBe(wins.get('h1'));
    expect(wins.get('h1')).toBe(wins.get('h2')); // the Normal horses are still averaged
    expect(wins.get('h2')).toBe(wins.get('h3'));
  });
});
