import { HorseSprite } from '../render/HorseSprite.tsx';
import type { HorseColors } from '../render/palette.ts';
import { CRATE_PRICE, type Cosmetic } from '../shop/cosmetics.ts';
import { wearing } from './ShopParts.tsx';

type Props = {
  /** Items the player doesn't own yet. */
  left: number;
  balance: number;
  busy: boolean;
  confirming: boolean;
  /** The last crate's item, revealed until the tab changes. */
  prize: Cosmetic | null;
  /** Saved colours (equipped looks included). */
  colors: HorseColors;
  onAsk: () => void;
  onCancel: () => void;
  onOpen: () => void;
  onWear: (prize: Cosmetic) => void;
};

/**
 * The mystery crate: price, Open with a confirm, and the reveal (crate shakes, opens, the horse wears
 * the prize; CSS only, no shake under reduced motion). The status line is always mounted so screen
 * readers announce the prize.
 */
export function CrateTab(p: Props) {
  const prize = p.prize;
  return (
    <div className="crate">
      <p role="status" className="crate-result">
        {prize ? `You got ${prize.name}!` : ''}
      </p>
      {prize && (
        <div className="crate-reveal" key={prize.code}>
          <span className="crate-box" aria-hidden="true">
            🎁
          </span>
          <div className="crate-prize">
            <HorseSprite colors={wearing(p.colors, prize)} size="lg" animated />
            {p.colors[prize.slot] === prize.code ? (
              <p>Wearing it.</p>
            ) : (
              <button
                type="button"
                className="primary"
                disabled={p.busy}
                onClick={() => p.onWear(prize)}
              >
                Wear it
              </button>
            )}
          </div>
        </div>
      )}
      {p.left === 0 ? (
        <p>You own everything!</p>
      ) : (
        <>
          <p className="pixel">{`Mystery crate · ${CRATE_PRICE} coins`}</p>
          <p>Gives one item you don't own yet. Pricier items are rarer.</p>
          {p.confirming ? (
            <p>
              {`Open a crate for ${CRATE_PRICE} coins? `}
              <button type="button" className="primary" disabled={p.busy} onClick={p.onOpen}>
                {`Pay ${CRATE_PRICE}`}
              </button>{' '}
              <button type="button" onClick={p.onCancel}>
                Cancel
              </button>
            </p>
          ) : (
            <button type="button" disabled={p.busy || p.balance < CRATE_PRICE} onClick={p.onAsk}>
              Open crate
            </button>
          )}
        </>
      )}
    </div>
  );
}
