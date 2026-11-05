import { ITEM_INFO } from '../render/items.ts';
import type { BoxType, HotBuff, HotItem } from '../sim/types.ts';

export const BUFF_TEXT: Readonly<Record<HotBuff, string>> = {
  lucky: '🍀 Lucky',
  extended: '⏱️ Extended',
};

/** A race row's `hot_items` or a timeline's `hot`; anything malformed (or an old race) is none. */
export const hotOf = (value: unknown): HotItem[] =>
  Array.isArray(value)
    ? (value as HotItem[]).filter((x) => x && x.item in ITEM_INFO && x.buff in BUFF_TEXT)
    : [];

/** "🥕 Carrot 🍀 Lucky · …", or null when there are none. */
export const hotText = (hot: readonly HotItem[]): string | null =>
  hot.length > 0
    ? hot
        .map(
          ({ item, buff }) => `${ITEM_INFO[item].icon} ${ITEM_INFO[item].name} ${BUFF_TEXT[buff]}`,
        )
        .join(' · ')
    : null;

/** Box types a bought box can give a hot item from (Stampede and Thunderclap are mystery-only). */
export const hotBoxTypes = (hot: readonly HotItem[]): ReadonlySet<BoxType> =>
  new Set(
    hot
      .filter((x) => x.item !== 'speed:pass3' && x.item !== 'attack:all')
      .map((x) => x.item.split(':')[0] as BoxType),
  );

/** Shop to finish and replays (spec C); nothing when the list is empty. */
export function HotStrip({ hot }: { hot: unknown }) {
  const text = hotText(hotOf(hot));
  if (!text) return null;
  return (
    <p className="chip hot-strip">
      <span aria-hidden="true">🔥</span> Hot items: {text}{' '}
      <small>· 🍀 2× more likely from its box · ⏱️ lasts 50 % longer</small>
    </p>
  );
}
