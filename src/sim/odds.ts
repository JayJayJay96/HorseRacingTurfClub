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

/** Past Office results for one horse: finished races, wins and top-3 finishes. */
export interface HorseHistory {
  readonly races: number;
  readonly wins: number;
  readonly top3: number;
}

/** Spec §7 (Office): share of past results in p, and the prior's strength in races. */
export const HISTORY = { weight: 0.3, priorRaces: 5 } as const;
const EMPTY: HorseHistory = { races: 0, wins: 0, top3: 0 };

/** p = 0.7·p_sim + 0.3·p_hist, where p_hist = (hits + 5·fieldShare) / (races + 5). */
export function blendHistory(
  pSim: number,
  hits: number,
  races: number,
  fieldShare: number,
): number {
  const pHist = (hits + HISTORY.priorRaces * fieldShare) / (races + HISTORY.priorRaces);
  return (1 - HISTORY.weight) * pSim + HISTORY.weight * pHist;
}

export function priceOdds(p: number, range: OddsRange): number {
  if (p <= 0) return range.max;
  const odds = Math.round((ODDS.payoutRate / p) * 10) / 10;
  return Math.min(range.max, Math.max(range.min, odds));
}

/**
 * Finish counts from repeated runs of this exact field, bought boxes and length: how often each
 * horse won and finished top 3. Each run has a fresh seed, so box spots vary between runs.
 */
export function simulateShares(
  race: Omit<RaceInput, 'seed'>,
  rng: Rng,
  now: () => number = () => performance.now(),
): { wins: Map<HorseId, number>; top3: Map<HorseId, number>; sims: number } {
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
  return { wins, top3, sims };
}

/**
 * Win/Place odds from `simulateShares`. Office races pass `history` (spec §7): horses missing
 * from it count as having no past races.
 */
export function simulateOdds(
  race: Omit<RaceInput, 'seed'>,
  rng: Rng,
  now: () => number = () => performance.now(),
  history?: Readonly<Record<HorseId, HorseHistory>>,
): { odds: Record<HorseId, OddsLine>; sims: number } {
  const { wins, top3, sims } = simulateShares(race, rng, now);
  const n = race.horses.length;
  const blend = (h: HorseId, p: number, hits: (s: HorseHistory) => number, share: number) => {
    if (!history) return p;
    const s = history[h] ?? EMPTY;
    return blendHistory(p, hits(s), s.races, share);
  };
  const odds = Object.fromEntries(
    race.horses.map((h) => [
      h,
      {
        win: priceOdds(
          blend(h, wins.get(h)! / sims, (s) => s.wins, 1 / n),
          ODDS.win,
        ),
        place: priceOdds(
          blend(h, top3.get(h)! / sims, (s) => s.top3, Math.min(3, n) / n),
          ODDS.place,
        ),
      },
    ]),
  );
  return { odds, sims };
}
