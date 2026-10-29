import { describe, expect, it } from 'vitest';
import { ATTACK_WEIGHTS, MYSTERY_TYPE_WEIGHTS } from './config.ts';
import { bandOf, rollAttack, rollBox, type RollContext } from './items.ts';
import { createSeededRng } from './rng.ts';
import { chiSquare } from './testStats.ts';
import type { AttackTarget, ItemCode, MysteryType } from './types.ts';

const ALL_TARGETS: Record<AttackTarget, boolean> = {
  behind1: true,
  behind3: true,
  front1: true,
  front3: true,
  leader: true,
};
const ctx = (rank: number, count = 10, canTarget = ALL_TARGETS): RollContext => ({
  rank,
  count,
  canTarget,
});
const typeOf = (item: ItemCode): MysteryType => item.split(':')[0] as MysteryType;

describe('bandOf', () => {
  it.each([
    [0, 10, 'front'],
    [2, 10, 'front'],
    [3, 10, 'middle'],
    [6, 10, 'middle'],
    [7, 10, 'back'],
    [9, 10, 'back'],
    [0, 2, 'front'],
    [1, 2, 'back'],
    [1, 3, 'middle'],
  ] as const)('rank %i of %i is %s', (rank, count, band) => {
    expect(bandOf(rank, count)).toBe(band);
  });
});

describe('rollAttack', () => {
  it('never picks a target that has nobody in it', () => {
    const rng = createSeededRng(1);
    const leaderView = { ...ALL_TARGETS, front1: false, front3: false, leader: false };
    for (let i = 0; i < 2000; i++) {
      expect(rollAttack(rng, ctx(0, 10, leaderView))).toMatch(/^attack:behind[13]$/);
    }
  });

  it('returns null when no target is possible', () => {
    const none = { behind1: false, behind3: false, front1: false, front3: false, leader: false };
    expect(rollAttack(createSeededRng(1), ctx(5, 10, none))).toBeNull();
  });

  it('matches the middle-band target table', () => {
    const rng = createSeededRng(2);
    const targets = Object.keys(ATTACK_WEIGHTS.middle) as AttackTarget[];
    const counts = Array.from({ length: targets.length }, () => 0);
    for (let i = 0; i < 20_000; i++) {
      counts[targets.indexOf(rollAttack(rng, ctx(4))!.slice('attack:'.length) as AttackTarget)]!++;
    }
    const shares = targets.map((t) => ATTACK_WEIGHTS.middle[t] / 100);
    // Critical chi-square value for df = 4 at p = 0.001 is 18.47.
    expect(chiSquare(counts, shares)).toBeLessThan(18.47);
  });
});

describe('rollBox', () => {
  it('matches the back-band mystery type table', () => {
    const rng = createSeededRng(3);
    const types: MysteryType[] = ['speed', 'attack', 'defense', 'dud'];
    const counts = Array.from({ length: types.length }, () => 0);
    for (let i = 0; i < 20_000; i++)
      counts[types.indexOf(typeOf(rollBox(rng, 'mystery', ctx(8))!))]!++;
    const shares = types.map((t) => MYSTERY_TYPE_WEIGHTS.back[t] / 100);
    // Critical chi-square value for df = 3 at p = 0.001 is 16.27.
    expect(chiSquare(counts, shares)).toBeLessThan(16.27);
  });

  it('bought boxes keep their type, never contain duds or mystery-only items', () => {
    const rng = createSeededRng(4);
    for (let i = 0; i < 3000; i++) {
      const rank = i % 10;
      expect(rollBox(rng, 'speed', ctx(rank))).toMatch(/^speed:(self1|self3|star)$/);
      expect(rollBox(rng, 'defense', ctx(rank))).toMatch(/^defense:/);
      expect(rollBox(rng, 'attack', ctx(rank))).toMatch(
        /^attack:(behind1|behind3|front1|front3|leader)$/,
      );
    }
  });

  it('Stampede only comes from mystery boxes in the back half', () => {
    const rng = createSeededRng(5);
    const seen = { front: false, back: false };
    for (let i = 0; i < 20_000; i++) {
      if (rollBox(rng, 'mystery', ctx(1)) === 'speed:pass3') seen.front = true;
      if (rollBox(rng, 'mystery', ctx(8)) === 'speed:pass3') seen.back = true;
    }
    expect(seen).toEqual({ front: false, back: true });
  });

  it('Thunderclap only comes from mystery boxes in last place', () => {
    const rng = createSeededRng(6);
    const seen = { second: false, last: false };
    for (let i = 0; i < 20_000; i++) {
      if (rollBox(rng, 'mystery', ctx(8)) === 'attack:all') seen.second = true;
      if (rollBox(rng, 'mystery', ctx(9)) === 'attack:all') seen.last = true;
    }
    expect(seen).toEqual({ second: false, last: true });
  });
});
