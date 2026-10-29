import {
  ATTACK_WEIGHTS,
  DEFENSE_ITEMS,
  DUD_ITEMS,
  MYSTERY_TYPE_WEIGHTS,
  PASS3_CHANCE_PERCENT,
  SPEED_ITEMS,
  THUNDERCLAP_CHANCE_PERCENT,
} from './config.ts';
import type { Rng } from './rng.ts';
import type { AttackTarget, Band, BoxKind, ItemCode } from './types.ts';
import { pickOne, pickWeighted } from './weighted.ts';

/** Front, middle or back third of the field; each outer band holds at least one horse. */
export function bandOf(rank: number, count: number): Band {
  const k = Math.max(1, Math.round(count / 3));
  if (rank < k) return 'front';
  if (rank >= count - k) return 'back';
  return 'middle';
}

export interface RollContext {
  /** 0 = in the lead, counted over every horse in the race (finished ones included). */
  readonly rank: number;
  readonly count: number;
  /** Which attack targets currently contain at least one running horse. */
  readonly canTarget: Readonly<Record<AttackTarget, boolean>>;
}

/** Attack item by position band, impossible targets removed. Null when nobody can be hit. */
export function rollAttack(rng: Rng, ctx: RollContext): ItemCode | null {
  const weights: Partial<Record<AttackTarget, number>> = {};
  const table = ATTACK_WEIGHTS[bandOf(ctx.rank, ctx.count)];
  for (const [target, weight] of Object.entries(table) as [AttackTarget, number][]) {
    if (ctx.canTarget[target] && weight > 0) weights[target] = weight;
  }
  if (Object.keys(weights).length === 0) return null;
  return `attack:${pickWeighted(rng, weights)}`;
}

/** The item inside a box at the moment it is picked up. Null = an attack with nobody to hit. */
export function rollBox(rng: Rng, kind: BoxKind, ctx: RollContext): ItemCode | null {
  const mystery = kind === 'mystery';
  const type = mystery
    ? pickWeighted(rng, MYSTERY_TYPE_WEIGHTS[bandOf(ctx.rank, ctx.count)])
    : kind;
  switch (type) {
    case 'speed':
      if (mystery && ctx.rank >= ctx.count / 2 && rng.nextInt(100) < PASS3_CHANCE_PERCENT) {
        return 'speed:pass3';
      }
      return pickOne(rng, SPEED_ITEMS);
    case 'attack':
      if (mystery && ctx.rank === ctx.count - 1 && rng.nextInt(100) < THUNDERCLAP_CHANCE_PERCENT) {
        return ctx.canTarget.front1 || ctx.canTarget.behind1 ? 'attack:all' : null;
      }
      return rollAttack(rng, ctx);
    case 'defense':
      return pickOne(rng, DEFENSE_ITEMS);
    case 'dud':
      return pickOne(rng, DUD_ITEMS);
  }
}
