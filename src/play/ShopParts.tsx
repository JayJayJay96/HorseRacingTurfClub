import { HorseSprite } from '../render/HorseSprite.tsx';
import type { HorseColors } from '../render/palette.ts';
import { TRAIL_STYLES } from '../render/trails.ts';
import type { Cosmetic, CosmeticSlot } from '../shop/cosmetics.ts';
import { Celebration } from '../track/Podium.tsx';

export type ShopTab = CosmeticSlot;
export const TABS: readonly { readonly id: ShopTab; readonly label: string }[] = [
  { id: 'pattern', label: 'Patterns' },
  { id: 'trail', label: 'Trails' },
  { id: 'cap', label: 'Caps' },
  { id: 'celebration', label: 'Celebrations' },
];

/** The horse wearing `item` on top of what it already wears. */
export const wearing = (colors: HorseColors, item: Cosmetic): HorseColors => ({
  ...colors,
  [item.slot]: item.code,
});

export type CardState = 'buy' | 'wear' | 'remove';
/** `worn` = the horse's saved colours, whose slot fields are the equipped codes. */
export function cardState(item: Cosmetic, owned: readonly string[], worn: HorseColors): CardState {
  if (!owned.includes(item.code)) return 'buy';
  return worn[item.slot] === item.code ? 'remove' : 'wear';
}

/** Section switcher: toggle buttons (aria-pressed) in a labelled group; ≥ 44 px in app.css. */
export function ShopTabs({ tab, onTab }: { tab: ShopTab; onTab: (t: ShopTab) => void }) {
  return (
    <div className="shop-tabs" role="group" aria-label="Shop sections">
      {TABS.map((t) => (
        <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => onTab(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Eight fading marks in a trail's colours (trails aren't drawn on sprites). Decorative. */
export function TrailMarks({ code }: { code: string }) {
  const style = TRAIL_STYLES[code];
  if (!style) return null;
  return (
    <span className="trail-marks" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ background: style.color(i, 0), opacity: 1 - i / 9 }} />
      ))}
    </span>
  );
}

/**
 * The phone's own horse, big and galloping, in its saved looks plus whatever is being tried on.
 * Decorative (the cards carry the names). A tried-on celebration plays once; `replay` restarts it.
 */
export function ShopPreview(props: {
  colors: HorseColors;
  celebrate: string | null;
  replay: number;
}) {
  const horse = <HorseSprite colors={props.colors} size="lg" animated />;
  return (
    <div className="shop-preview" aria-hidden="true">
      {props.colors.trail && <TrailMarks code={props.colors.trail} />}
      {props.celebrate ? (
        <Celebration key={props.replay} code={props.celebrate} once>
          {horse}
        </Celebration>
      ) : (
        horse
      )}
    </div>
  );
}

type CardProps = {
  item: Cosmetic;
  state: CardState;
  /** Saved colours; the card's sprite wears the item on top. */
  colors: HorseColors;
  trying: boolean;
  busy: boolean;
  balance: number;
  onTry: () => void;
  onBuy: () => void;
  onWear: () => void;
  onRemove: () => void;
};

/** One item: a try-on button (sprite, name, price) and Buy / Wear / Remove. */
export function ShopCard(p: CardProps) {
  const { item } = p;
  return (
    <li className="shop-card">
      <button
        type="button"
        className="card shop-try"
        aria-pressed={p.trying}
        aria-label={`Try on ${item.name}, ${item.price} coins`}
        onClick={p.onTry}
      >
        {item.slot === 'trail' && <TrailMarks code={item.code} />}
        <HorseSprite colors={wearing(p.colors, item)} size="md" />
        <span>{item.name}</span>
        <span className="pixel">{`${item.price} coins`}</span>
      </button>
      {p.state === 'buy' ? (
        <button
          type="button"
          aria-label={`Buy ${item.name}`}
          disabled={p.busy || p.balance < item.price}
          onClick={p.onBuy}
        >
          Buy
        </button>
      ) : p.state === 'remove' ? (
        <button
          type="button"
          aria-label={`Remove ${item.name}`}
          disabled={p.busy}
          onClick={p.onRemove}
        >
          Remove
        </button>
      ) : (
        <button type="button" aria-label={`Wear ${item.name}`} disabled={p.busy} onClick={p.onWear}>
          Wear
        </button>
      )}
    </li>
  );
}
