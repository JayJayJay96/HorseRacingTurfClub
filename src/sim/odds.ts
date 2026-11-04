import type { Rng } from './rng.ts';
import { simulateRace } from './simulate.ts';
import type { HorseId, RaceInput } from './types.ts';

/** `null` = that bet is closed for this horse (see `priceOdds`). */
export interface OddsLine {
  readonly win: number | null;
  readonly place: number | null;
}
export interface OddsRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Spec §7 (Private: p = p_sim). Odds pay 90% of fair value, rounded to 0.1, capped at `max`. A bet
 * whose 90% price falls below `min` is closed rather than lifted to `min`, which would pay more
 * than it is worth; with rounding, no open bet returns more than ~94% of its stake on average.
 */
export const ODDS = {
  payoutRate: 0.9,
  win: { min: 1.2, max: 20 },
  place: { min: 1.05, max: 6 },
  /** Odd/Even/Low/High bets on the winner's number. */
  group: { min: 1.05, max: 20 },
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

/** Odds for a chance `p`, or null when the bet is closed (its 90% price is below `range.min`). */
export function priceOdds(p: number, range: OddsRange): number | null {
  if (p <= 0) return range.max;
  const raw = ODDS.payoutRate / p;
  if (raw < range.min) return null;
  return Math.min(range.max, Math.round(raw * 10) / 10);
}

/**
 * Finish counts from repeated runs of this exact field, bought boxes and length: how often each
 * horse won and finished top 3. Each run has a fresh seed, so box spots vary between runs.
 * Horses with the same bought boxes are interchangeable, so each such group gets its average:
 * equal horses show equal counts instead of simulation noise (counts may be fractional).
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
  const groups = new Map<string, HorseId[]>();
  for (const h of race.horses) {
    const key = [...(race.bought[h] ?? [])].sort().join();
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  for (const group of groups.values()) {
    for (const counts of [wins, top3]) {
      const mean = group.reduce((sum, h) => sum + counts.get(h)!, 0) / group.length;
      for (const h of group) counts.set(h, mean);
    }
  }
  return { wins, top3, sims };
}

/** Roulette-style bets on the winner's number (#1 = first lane). */
export const GROUP_KINDS = ['odd', 'even', 'low', 'high'] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

/** Group bets need 4+ horses; with fewer, a group is just one or two horses. */
export const canGroup = (horses: number) => horses >= 4;

/**
 * The numbers (1-based) a group covers in an `n`-horse race. Low is the first half rounded down,
 * High the rest. Mirrored in SQL (start_race_finish payouts, migration 0018).
 */
export function groupLanes(kind: GroupKind, n: number): number[] {
  const lanes = Array.from({ length: n }, (_, i) => i + 1);
  const half = Math.floor(n / 2);
  switch (kind) {
    case 'odd':
      return lanes.filter((l) => l % 2 === 1);
    case 'even':
      return lanes.filter((l) => l % 2 === 0);
    case 'low':
      return lanes.filter((l) => l <= half);
    case 'high':
      return lanes.filter((l) => l > half);
  }
}

/**
 * Win/Place odds from `simulateShares`, plus group odds (4+ horses) priced from the summed win
 * chances of the group's horses. Office races pass `history` (spec §7): horses missing from it
 * count as having no past races.
 */
export function simulateOdds(
  race: Omit<RaceInput, 'seed'>,
  rng: Rng,
  now: () => number = () => performance.now(),
  history?: Readonly<Record<HorseId, HorseHistory>>,
): {
  odds: Record<HorseId, OddsLine>;
  groups: Partial<Record<GroupKind, number | null>>;
  sims: number;
} {
  const { wins, top3, sims } = simulateShares(race, rng, now);
  const n = race.horses.length;
  // History only ever shortens odds: it ignores this race's boxes, so letting it lengthen them
  // would underprice a boxed horse and make betting on it pay more than it is worth.
  const blend = (h: HorseId, p: number, hits: (s: HorseHistory) => number, share: number) => {
    if (!history) return p;
    const s = history[h] ?? EMPTY;
    return Math.max(p, blendHistory(p, hits(s), s.races, share));
  };
  const pWin = race.horses.map((h) => blend(h, wins.get(h)! / sims, (s) => s.wins, 1 / n));
  const odds = Object.fromEntries(
    race.horses.map((h, i) => [
      h,
      {
        win: priceOdds(pWin[i]!, ODDS.win),
        place: priceOdds(
          blend(h, top3.get(h)! / sims, (s) => s.top3, Math.min(3, n) / n),
          ODDS.place,
        ),
      },
    ]),
  );
  const groups = canGroup(n)
    ? Object.fromEntries(
        GROUP_KINDS.map((k) => [
          k,
          priceOdds(
            groupLanes(k, n).reduce((sum, lane) => sum + pWin[lane - 1]!, 0),
            ODDS.group,
          ),
        ]),
      )
    : {};
  return { odds, groups, sims };
}
