import { describe, expect, it } from 'vitest';
import { boundedInt, createCryptoRng, createScriptedRng, createSeededRng } from './rng.ts';
import { chiSquare } from './testStats.ts';

describe('boundedInt', () => {
  it('rejects values in the incomplete top bucket instead of folding them (no modulo bias)', () => {
    // 2^32 % 3 === 1, so 2^32 - 1 is the single biased value and must be redrawn.
    const values = [2 ** 32 - 1, 2 ** 32 - 1, 7];
    let i = 0;
    expect(boundedInt(() => values[i++]!, 3)).toBe(7 % 3);
    expect(i).toBe(3);
  });

  it.each([0, -1, 1.5, Number.NaN, 2 ** 32 + 1])('rejects bound %s', (bound) => {
    expect(() => boundedInt(() => 0, bound)).toThrow(RangeError);
  });

  it('a bound of 2^32 is allowed (used to draw a full 32-bit seed)', () => {
    expect(boundedInt(() => 2 ** 32 - 1, 2 ** 32)).toBe(2 ** 32 - 1);
  });
});

describe('createCryptoRng', () => {
  it('works with the real Web Crypto API', () => {
    const rng = createCryptoRng();
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(22);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(22);
    }
  });
});

describe('createSeededRng', () => {
  it('is deterministic per seed', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const c = createSeededRng(43);
    const seqA = Array.from({ length: 20 }, () => a.nextInt(1000));
    expect(Array.from({ length: 20 }, () => b.nextInt(1000))).toEqual(seqA);
    expect(Array.from({ length: 20 }, () => c.nextInt(1000))).not.toEqual(seqA);
  });

  it('is uniform over 7 buckets (seeded, so the check is not flaky)', () => {
    const rng = createSeededRng(20261029);
    const counts = Array.from({ length: 7 }, () => 0);
    for (let i = 0; i < 70_000; i++) counts[rng.nextInt(7)]!++;
    // Critical chi-square value for df = 6 at p = 0.001 is 22.46.
    expect(chiSquare(counts, Array.from({ length: 7 }, () => 1 / 7))).toBeLessThan(22.46);
  });
});

describe('createScriptedRng', () => {
  it('replays values and validates their range', () => {
    const rng = createScriptedRng([2, 0]);
    expect(rng.nextInt(3)).toBe(2);
    expect(rng.nextInt(1)).toBe(0);
    expect(() => rng.nextInt(1)).toThrow(/exhausted/);
    expect(() => createScriptedRng([5]).nextInt(3)).toThrow(RangeError);
  });
});
