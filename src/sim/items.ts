import {
  ATTACK_WEIGHTS,
  DEFENSE_ITEMS,
  DUD_ITEMS,
  HOT,
  MYSTERY_TYPE_WEIGHTS,
  PASS3_CHANCE_PERCENT,
  SPEED_ITEMS,
  THUNDERCLAP_CHANCE_PERCENT,
  TRAITS,
} from './config.ts';
import type { Rng } from './rng.ts';
import type { AttackTarget, Band, BoxKind, ItemCode, MysteryType } from './types.ts';
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
  /** This race's Lucky hot items (spec C); missing = none. */
  readonly lucky?: ReadonlySet<ItemCode>;
  /** The picking horse is Charmed (spec D). */
  readonly charmed?: boolean;
}

/** A Lucky item's weight (or percent chance) is multiplied by HOT.luckyWeight. */
const luckyWeight = (ctx: RollContext, item: ItemCode, weight: number): number =>
  ctx.lucky?.has(item) ? weight * HOT.luckyWeight : weight;

/**
 * Uniform pick, or weighted when one of `items` is Lucky. Only then: a weighted pick draws
 * nextInt(total) instead of nextInt(items.length), which would change races without hot items.
 */
function pickItem<T extends ItemCode>(rng: Rng, items: readonly T[], ctx: RollContext): T {
  if (!items.some((i) => ctx.lucky?.has(i))) return pickOne(rng, items);
  const weights: Partial<Record<T, number>> = {};
  for (const i of items) weights[i] = luckyWeight(ctx, i, 1);
  return pickWeighted(rng, weights);
}

/** Percent chance of a mystery-only upgrade; Lucky doubles the threshold, still one draw. */
const chance = (ctx: RollContext, item: ItemCode, percent: number): number =>
  Math.min(100, luckyWeight(ctx, item, percent));

/** Attack item by position band, impossible targets removed. Null when nobody can be hit. */
export function rollAttack(rng: Rng, ctx: RollContext): ItemCode | null {
  const weights: Partial<Record<AttackTarget, number>> = {};
  const table = ATTACK_WEIGHTS[bandOf(ctx.rank, ctx.count)];
  for (const [target, weight] of Object.entries(table) as [AttackTarget, number][]) {
    if (ctx.canTarget[target] && weight > 0)
      weights[target] = luckyWeight(ctx, `attack:${target}`, weight);
  }
  if (Object.keys(weights).length === 0) return null;
  return `attack:${pickWeighted(rng, weights)}`;
}

/** The item inside a box at the moment it is picked up. Null = an attack with nobody to hit. */
export function rollBox(rng: Rng, kind: BoxKind, ctx: RollContext): ItemCode | null {
  const mystery = kind === 'mystery';
  const table = MYSTERY_TYPE_WEIGHTS[bandOf(ctx.rank, ctx.count)];
  let type: MysteryType = mystery ? pickWeighted(rng, table) : kind;
  // Charmed: some dud rolls become another type. Extra draws only for a Charmed horse's dud.
  if (mystery && type === 'dud' && ctx.charmed && rng.nextInt(100) < TRAITS.charmed.rerollPercent) {
    const { dud: _dud, ...rest } = table;
    type = pickWeighted(rng, rest);
  }
  // Charmed never gets the rare upgrades, and makes no draw for them.
  const rare = mystery && !ctx.charmed;
  switch (type) {
    case 'speed':
      if (
        rare &&
        ctx.rank >= ctx.count / 2 &&
        rng.nextInt(100) < chance(ctx, 'speed:pass3', PASS3_CHANCE_PERCENT)
      ) {
        return 'speed:pass3';
      }
      return pickItem(rng, SPEED_ITEMS, ctx);
    case 'attack':
      if (
        rare &&
        ctx.rank === ctx.count - 1 &&
        rng.nextInt(100) < chance(ctx, 'attack:all', THUNDERCLAP_CHANCE_PERCENT)
      ) {
        return ctx.canTarget.front1 || ctx.canTarget.behind1 ? 'attack:all' : null;
      }
      return rollAttack(rng, ctx);
    case 'defense':
      return pickItem(rng, DEFENSE_ITEMS, ctx);
    case 'dud':
      return pickOne(rng, DUD_ITEMS);
  }
}
