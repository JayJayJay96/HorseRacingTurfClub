import { describe, expect, it } from 'vitest';
import {
  ATTACK_WEIGHTS,
  HOT,
  MYSTERY_TYPE_WEIGHTS,
  PASS3_CHANCE_PERCENT,
  THUNDERCLAP_CHANCE_PERCENT,
} from './config.ts';
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
  top3: true,
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
    const leaderView = { ...ALL_TARGETS, front1: false, front3: false, leader: false, top3: false };
    for (let i = 0; i < 2000; i++) {
      expect(rollAttack(rng, ctx(0, 10, leaderView))).toMatch(/^attack:behind[13]$/);
    }
  });

  it('returns null when no target is possible', () => {
    const none = {
      behind1: false,
      behind3: false,
      front1: false,
      front3: false,
      leader: false,
      top3: false,
    };
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
    // Critical chi-square value for df = 5 at p = 0.001 is 20.52.
    expect(chiSquare(counts, shares)).toBeLessThan(20.52);
  });

  it('the front band never rolls Hornet Swarm', () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 5000; i++) expect(rollAttack(rng, ctx(i % 3))).not.toBe('attack:top3');
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
        /^attack:(behind1|behind3|front1|front3|leader|top3)$/,
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

describe('Lucky hot items', () => {
  const lucky = (...items: ItemCode[]) => ({ lucky: new Set(items) });

  it('a Lucky Carrot comes out of a Speed box 2 times in 4', () => {
    const rng = createSeededRng(11);
    const items: ItemCode[] = ['speed:self1', 'speed:self3', 'speed:star'];
    const counts = [0, 0, 0];
    for (let i = 0; i < 20_000; i++) {
      counts[items.indexOf(rollBox(rng, 'speed', { ...ctx(i % 10), ...lucky('speed:self1') })!)]!++;
    }
    expect(chiSquare(counts, [0.5, 0.25, 0.25])).toBeLessThan(13.82); // df = 2, p = 0.001
  });

  it('a Lucky Mirror Saddle doubles in a Defense box', () => {
    const rng = createSeededRng(12);
    const items: ItemCode[] = ['defense:block1', 'defense:immune', 'defense:reflect'];
    const counts = [0, 0, 0];
    for (let i = 0; i < 20_000; i++) {
      counts[
        items.indexOf(rollBox(rng, 'defense', { ...ctx(i % 10), ...lucky('defense:reflect') })!)
      ]!++;
    }
    expect(chiSquare(counts, [0.25, 0.25, 0.5])).toBeLessThan(13.82);
  });

  it('a Lucky attack doubles its band weight', () => {
    const rng = createSeededRng(13);
    const targets = Object.keys(ATTACK_WEIGHTS.middle) as AttackTarget[];
    const weights = targets.map((t) =>
      t === 'top3' ? ATTACK_WEIGHTS.middle[t] * HOT.luckyWeight : ATTACK_WEIGHTS.middle[t],
    );
    const total = weights.reduce((a, b) => a + b, 0);
    const counts = targets.map(() => 0);
    for (let i = 0; i < 20_000; i++) {
      const item = rollAttack(rng, { ...ctx(4), ...lucky('attack:top3') })!;
      counts[targets.indexOf(item.slice('attack:'.length) as AttackTarget)]!++;
    }
    expect(
      chiSquare(
        counts,
        weights.map((w) => w / total),
      ),
    ).toBeLessThan(20.52); // df = 5
  });

  it('a Lucky Stampede or Thunderclap doubles its chance', () => {
    const rng = createSeededRng(14);
    let speed = 0;
    let pass3 = 0;
    let attack = 0;
    let all = 0;
    for (let i = 0; i < 40_000; i++) {
      const back = rollBox(rng, 'mystery', { ...ctx(8), ...lucky('speed:pass3') });
      if (back?.startsWith('speed:')) speed++;
      if (back === 'speed:pass3') pass3++;
      const last = rollBox(rng, 'mystery', { ...ctx(9), ...lucky('attack:all') });
      if (last?.startsWith('attack:')) attack++;
      if (last === 'attack:all') all++;
    }
    const p = Math.min(100, PASS3_CHANCE_PERCENT * HOT.luckyWeight) / 100;
    expect(chiSquare([pass3, speed - pass3], [p, 1 - p])).toBeLessThan(10.83); // df = 1
    const q = Math.min(100, THUNDERCLAP_CHANCE_PERCENT * HOT.luckyWeight) / 100;
    expect(chiSquare([all, attack - all], [q, 1 - q])).toBeLessThan(10.83);
  });

  it('draws exactly as before unless the roll holds a Lucky item', () => {
    // A Lucky item of another box type must not touch this roll's draws.
    const other = {
      speed: 'defense:block1',
      attack: 'speed:self1',
      defense: 'attack:leader',
    } as const;
    for (const kind of ['speed', 'attack', 'defense'] as const) {
      const a = createSeededRng(21);
      const b = createSeededRng(21);
      for (let i = 0; i < 2000; i++) {
        const c = ctx(i % 10);
        expect(rollBox(b, kind, { ...c, ...lucky(other[kind]) })).toBe(rollBox(a, kind, c));
      }
    }
    const a = createSeededRng(22);
    const b = createSeededRng(22);
    for (let i = 0; i < 2000; i++) {
      const c = ctx(i % 10);
      expect(rollBox(b, 'mystery', { ...c, lucky: new Set() })).toBe(rollBox(a, 'mystery', c));
    }
  });
});
