import { ITEM_INFO } from '../render/items.ts';
import type { BoxType, HotBuff, HotItem } from '../sim/types.ts';

const BUFF_ICON: Readonly<Record<HotBuff, string>> = { lucky: '🍀', extended: '⏱️' };
const BUFF_NAME: Readonly<Record<HotBuff, string>> = { lucky: 'Lucky', extended: 'Extended' };
export const BUFF_TEXT: Readonly<Record<HotBuff, string>> = {
  lucky: `${BUFF_ICON.lucky} ${BUFF_NAME.lucky}`,
  extended: `${BUFF_ICON.extended} ${BUFF_NAME.extended}`,
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

const BUFF_NOTE: Readonly<Record<HotBuff, string>> = {
  lucky: 'more likely from its box',
  extended: 'lasts longer',
};

const Icon = ({ children }: { children: string }) => <span aria-hidden="true">{children}</span>;

/** Shop to finish and replays (spec C); nothing when the list is empty. */
export function HotStrip({ hot }: { hot: unknown }) {
  const list = hotOf(hot);
  if (list.length === 0) return null;
  const buffs = (['lucky', 'extended'] as const).filter((b) => list.some((x) => x.buff === b));
  return (
    <p className="chip hot-strip">
      <Icon>🔥</Icon> Hot items:{' '}
      {list.map(({ item, buff }, i) => (
        <span key={item}>
          {i > 0 && ' · '}
          <Icon>{ITEM_INFO[item].icon}</Icon> {ITEM_INFO[item].name} <Icon>{BUFF_ICON[buff]}</Icon>{' '}
          {BUFF_NAME[buff]}
        </span>
      ))}{' '}
      <small>
        {buffs.map((b, i) => (
          <span key={b}>
            {i > 0 ? ' · ' : '· '}
            <Icon>{BUFF_ICON[b]}</Icon> {BUFF_NOTE[b]}
          </span>
        ))}
      </small>
    </p>
  );
}
