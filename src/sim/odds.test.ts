import { describe, expect, it } from 'vitest';
import { blendHistory, ODDS, priceOdds, simulateOdds, simulateShares } from './odds.ts';
import { createSeededRng } from './rng.ts';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `h${i}`);
const frozenClock = () => 0;

describe('priceOdds', () => {
  it.each([
    [0.5, ODDS.win, 1.8],
    [0.1, ODDS.win, 9],
    [0.03, ODDS.win, 20], // 30 → max
    [0, ODDS.win, 20],
    [0.9, ODDS.win, 1.2], // 1.0 → min
    [1, ODDS.place, 1.05],
    [0.3, ODDS.place, 3],
    [0.05, ODDS.place, 6],
  ])('p=%s', (p, range, expected) => {
    expect(priceOdds(p, range)).toBe(expected);
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
      expect(odds[h]!.place).toBe(ODDS.place.min); // everyone places in a 2-horse race
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
      .map((h) => odds[h]!.win)
      .sort((a, b) => a - b);
    expect(odds.h0!.win).toBeLessThan(others[4]!);
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
  it('shortens a habitual winner and lengthens a habitual loser, same simulations', () => {
    const race = { horses: ids(4), bought: {}, length: 'short' as const };
    const plain = simulateOdds(race, createSeededRng(7), frozenClock);
    const hist = {
      h0: { races: 20, wins: 20, top3: 20 },
      h1: { races: 20, wins: 0, top3: 0 },
    };
    const blended = simulateOdds(race, createSeededRng(7), frozenClock, hist);
    expect(blended.sims).toBe(plain.sims);
    expect(blended.odds.h0!.win).toBeLessThan(plain.odds.h0!.win);
    expect(blended.odds.h1!.win).toBeGreaterThan(plain.odds.h1!.win);
    // A horse with no history entry blends toward the field share (25%), not toward 0.
    expect(Math.abs(blended.odds.h2!.win - plain.odds.h2!.win)).toBeLessThan(0.5);
  });
});
