import { describe, expect, it } from 'vitest';
import { NOMINAL_SECONDS } from './config.ts';
import { simulateRace } from './simulate.ts';
import type { BoxType, RaceLength } from './types.ts';

const RACES = 10_000;
const FIELD = Array.from({ length: 10 }, (_, i) => `h${i}`);

interface Result {
  readonly shares: readonly number[];
  readonly winnerTimeOk: number;
}

const cache = new Map<string, Result>();

/** Seeds 1..RACES, so every run gives the same numbers (no flaky statistics). */
function run(length: RaceLength, h0Boxes: readonly BoxType[]): Result {
  const key = `${length}:${h0Boxes.join(',') || 'equal'}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const wins = Array.from({ length: FIELD.length }, () => 0);
  let winnerTimeOk = 0;
  for (let seed = 1; seed <= RACES; seed++) {
    const tl = simulateRace({
      seed,
      horses: FIELD,
      bought: h0Boxes.length > 0 ? { h0: h0Boxes } : {},
      length,
    });
    const winner = tl.finishOrder[0]!;
    wins[FIELD.indexOf(winner)]!++;
    if (Math.abs(tl.finishTimes[winner]! - NOMINAL_SECONDS[length]) <= 20) winnerTimeOk++;
  }
  const result = { shares: wins.map((w) => w / RACES), winnerTimeOk: winnerTimeOk / RACES };
  console.log(key, result.shares.map((s) => s.toFixed(3)).join(' '), 'timeOk', result.winnerTimeOk);
  cache.set(key, result);
  return result;
}

describe.each(['short', 'long'] as const)('balance, %s race, 10 horses', (length) => {
  it('equal field: every horse wins 10% ± 1%', () => {
    for (const share of run(length, []).shares) {
      expect(share).toBeGreaterThanOrEqual(0.09);
      expect(share).toBeLessThanOrEqual(0.11);
    }
  });

  it('winner time is within ±20 s of nominal in 99% of races', () => {
    expect(run(length, []).winnerTimeOk).toBeGreaterThanOrEqual(0.99);
  });

  it('3 Speed boxes give a real but small edge (above 10%, at most 18%)', () => {
    const share = run(length, ['speed', 'speed', 'speed']).shares[0]!;
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThanOrEqual(0.18);
  });

  it('3 Attack boxes give a smaller edge than Speed, at most 13%', () => {
    const attack = run(length, ['attack', 'attack', 'attack']).shares[0]!;
    expect(attack).toBeLessThanOrEqual(0.13);
    expect(attack).toBeLessThan(run(length, ['speed', 'speed', 'speed']).shares[0]!);
  });
});
