/**
 * Randomness for the race engine. Real races use a crypto-random seed; the simulation itself
 * runs on the seeded RNG so the same seed always replays the same race.
 */
export interface Rng {
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}

const UINT32_RANGE = 2 ** 32;

/**
 * Unbiased bounded sampling by rejection: values in the incomplete top bucket are redrawn,
 * so every result in [0, maxExclusive) has exactly the same probability.
 */
export function boundedInt(nextUint32: () => number, maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
    throw new RangeError(`maxExclusive must be an integer in [1, 2^32], got ${maxExclusive}`);
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
  for (;;) {
    const x = nextUint32();
    if (x < limit) return x % maxExclusive;
  }
}

export function createCryptoRng(source: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): Rng {
  const buffer = new Uint32Array(1);
  const next = () => {
    source.getRandomValues(buffer);
    return buffer[0]!;
  };
  return { nextInt: (maxExclusive) => boundedInt(next, maxExclusive) };
}

/** mulberry32: small, fast, good enough for simulation; never used to pick a real seed. */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return { nextInt: (maxExclusive) => boundedInt(next, maxExclusive) };
}

export function createScriptedRng(values: readonly number[]): Rng {
  let i = 0;
  return {
    nextInt(maxExclusive) {
      if (i >= values.length) throw new Error('Scripted RNG exhausted');
      const value = values[i++]!;
      if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
        throw new RangeError(`Scripted value ${value} outside [0, ${maxExclusive})`);
      }
      return value;
    },
  };
}
