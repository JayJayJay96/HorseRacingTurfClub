import type { HorseId, ItemCode, Timeline } from '../sim/types.ts';

/** Items that earn a cut-in, highest priority first (owner 2026-11-05). */
export const CUTIN_ITEMS = [
  'attack:all',
  'attack:leader',
  'speed:pass3',
] as const satisfies readonly ItemCode[];
export type CutInItem = (typeof CUTIN_ITEMS)[number];

/** At most one cut-in per this many seconds. */
export const CUTIN_COOLDOWN = 12;
/** A higher-priority item this soon after a candidate takes its place. */
export const CUTIN_WINDOW = 1;
/** How long a band shows: 0.2 s in, 0.9 s hold, 0.2 s out. */
export const CUTIN_SECONDS = 1.3;

export interface CutIn {
  readonly t: number;
  readonly horse: HorseId;
  readonly item: CutInItem;
}

const rank = (item: CutInItem) => CUTIN_ITEMS.indexOf(item);
const isCutIn = (item: ItemCode | null): item is CutInItem =>
  item !== null && (CUTIN_ITEMS as readonly ItemCode[]).includes(item);

const cache = new WeakMap<Timeline, readonly CutIn[]>();

/** The race's cut-ins, in time order. Pure and memoised per timeline. */
export function cutinsOf(timeline: Timeline): readonly CutIn[] {
  const hit = cache.get(timeline);
  if (hit) return hit;
  const candidates: CutIn[] = [];
  for (const e of timeline.events) {
    if (e.type === 'pickup' && isCutIn(e.item)) {
      candidates.push({ t: e.t, horse: e.horse, item: e.item });
    }
  }
  candidates.sort((a, b) => a.t - b.t);
  const out: CutIn[] = [];
  let nextFree = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const first = candidates[i]!;
    if (first.t < nextFree) continue;
    // Best within the window: highest priority, earliest among equals.
    let best = first;
    for (let j = i + 1; j < candidates.length && candidates[j]!.t <= first.t + CUTIN_WINDOW; j++) {
      if (rank(candidates[j]!.item) < rank(best.item)) best = candidates[j]!;
    }
    out.push(best);
    nextFree = best.t + CUTIN_COOLDOWN;
  }
  cache.set(timeline, out);
  return out;
}

/** The cut-in showing at race time `t`, if any. */
export function cutinAt(cutins: readonly CutIn[], t: number): CutIn | undefined {
  return cutins.find((c) => t >= c.t && t < c.t + CUTIN_SECONDS);
}
