import { EFFECTS, HOT } from './config.ts';
import type { HotBuff, HotItem, ItemCode } from './types.ts';

/** The 14 items that can be hot: every non-dud item (spec C). Mirrored in private.roll_hot_items. */
export const HOT_ELIGIBLE: readonly ItemCode[] = (Object.keys(EFFECTS) as ItemCode[]).filter(
  (i) => !i.startsWith('dud:'),
);

/**
 * Items that can only be Lucky: Shield and Mirror have no duration, and an Extended Stampede does
 * nothing (it ends when the horse reaches its target, long before the cap). Mirrored in SQL.
 */
export const HOT_LUCKY_ONLY: readonly ItemCode[] = [
  'speed:pass3',
  'defense:block1',
  'defense:reflect',
];

/** Whether `item` can be Extended: it has a duration and is not Lucky-only. */
export const canBeExtended = (item: ItemCode): boolean =>
  EFFECTS[item].seconds > 0 && !HOT_LUCKY_ONLY.includes(item);

/** The race's buff on `item`, if it is hot. */
export const buffOf = (hot: readonly HotItem[], item: ItemCode | null): HotBuff | undefined =>
  item ? hot.find((x) => x.item === item)?.buff : undefined;

/** An item's effect seconds in this race: an Extended item lasts HOT.extendedFactor longer. */
export const effectSeconds = (item: ItemCode, hot: readonly HotItem[] = []): number =>
  EFFECTS[item].seconds * (buffOf(hot, item) === 'extended' ? HOT.extendedFactor : 1);
