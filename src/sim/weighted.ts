import type { Rng } from './rng.ts';

/** Picks a key with probability weight / total. Weights must be non-negative integers. */
export function pickWeighted<K extends string>(rng: Rng, weights: Readonly<Partial<Record<K, number>>>): K {
  const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) throw new RangeError('pickWeighted needs at least one positive weight');
  let r = rng.nextInt(total);
  for (const [key, w] of entries) {
    if (r < w) return key;
    r -= w;
  }
  throw new Error('unreachable: r is always below the total weight');
}

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  return items[rng.nextInt(items.length)]!;
}
