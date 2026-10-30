import type { Rng } from './rng.ts';
import { simulateRace } from './simulate.ts';
import type { HorseId, RaceInput } from './types.ts';

export interface OddsLine {
  readonly win: number;
  readonly place: number;
}
export interface OddsRange {
  readonly min: number;
  readonly max: number;
}

/** Spec §7 (Private: p = p_sim). Odds pay 90% of fair value, rounded to 0.1, then clamped. */
export const ODDS = {
  payoutRate: 0.9,
  win: { min: 1.2, max: 20 },
  place: { min: 1.05, max: 6 },
  maxSims: 500,
  /** Always run this many, even past the budget. */
  minSims: 50,
  /** Edge Functions get 2 s CPU; a 22-horse long race costs ~3-5 ms per sim. */
  budgetMs: 800,
} as const;

export function priceOdds(p: number, range: OddsRange): number {
  if (p <= 0) return range.max;
  const odds = Math.round((ODDS.payoutRate / p) * 10) / 10;
  return Math.min(range.max, Math.max(range.min, odds));
}

/**
 * Win/Place odds from repeated runs of this exact field, bought boxes and length.
 * Each run has a fresh seed, so box spots vary between runs.
 */
export function simulateOdds(
  race: Omit<RaceInput, 'seed'>,
  rng: Rng,
  now: () => number = () => performance.now(),
): { odds: Record<HorseId, OddsLine>; sims: number } {
  const wins = new Map(race.horses.map((h) => [h, 0]));
  const top3 = new Map(race.horses.map((h) => [h, 0]));
  const start = now();
  let sims = 0;
  while (sims < ODDS.maxSims && (sims < ODDS.minSims || now() - start < ODDS.budgetMs)) {
    const { finishOrder } = simulateRace({ ...race, seed: rng.nextInt(2 ** 32) });
    wins.set(finishOrder[0]!, wins.get(finishOrder[0]!)! + 1);
    for (const h of finishOrder.slice(0, 3)) top3.set(h, top3.get(h)! + 1);
    sims++;
  }
  const odds = Object.fromEntries(
    race.horses.map((h) => [
      h,
      {
        win: priceOdds(wins.get(h)! / sims, ODDS.win),
        place: priceOdds(top3.get(h)! / sims, ODDS.place),
      },
    ]),
  );
  return { odds, sims };
}
