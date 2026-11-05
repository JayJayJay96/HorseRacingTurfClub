import { useEffect, useState } from 'react';
import {
  buyCosmetic,
  equipCosmetic,
  fetchOwnedCosmetics,
  openCrate,
  type RoomPlayer,
} from '../net/rooms.ts';
import type { HorseColors } from '../render/palette.ts';
import { COSMETICS, type Cosmetic } from '../shop/cosmetics.ts';
import { CrateTab } from './CrateTab.tsx';
import { ShopCard, ShopPreview, ShopTabs, cardState, wearing, type ShopTab } from './ShopParts.tsx';

type Act = (fn: () => Promise<unknown>) => void;
type Props = {
  roomId: string;
  mine: RoomPlayer;
  /** The horse's saved colours (the phone header's), equipped looks included. */
  colors: HorseColors;
  balance: number;
  act: Act;
  busy: boolean;
};

/** Office LOBBY: preview your horse, try looks on, buy them or open a crate, then wear or remove them. */
export function LooksShop({ roomId, mine, colors, balance, act, busy }: Props) {
  const [owned, setOwned] = useState<readonly string[]>([]);
  const [tab, setTab] = useState<ShopTab>('pattern');
  const [trying, setTrying] = useState<Cosmetic | null>(null);
  const [replay, setReplay] = useState(0);
  const [confirming, setConfirming] = useState<Cosmetic | null>(null);
  const [crateAsk, setCrateAsk] = useState(false);
  const [prize, setPrize] = useState<Cosmetic | null>(null);
  useEffect(() => {
    fetchOwnedCosmetics(mine.id).then(setOwned, () => {}); // a failed load only hides Wear
  }, [mine.id]);

  const gained = (code: string) => {
    // The purchase went through; a failed refetch of the owned list must not report it as failed.
    setOwned((prev) => [...prev, code]);
    fetchOwnedCosmetics(mine.id).then(setOwned, () => {});
  };
  const buy = (c: Cosmetic) => {
    setConfirming(null);
    act(async () => {
      await buyCosmetic(roomId, c.code);
      gained(c.code);
    });
  };
  const open = () => {
    setCrateAsk(false);
    act(async () => {
      const code = await openCrate(roomId);
      if (!code) return; // the RPC always returns a code; this only narrows the generated type
      gained(code);
      setPrize(COSMETICS.find((c) => c.code === code) ?? null);
    });
  };
  const pickTab = (t: ShopTab) => {
    setTab(t);
    setTrying(null);
    setConfirming(null);
    setCrateAsk(false);
    setPrize(null);
  };

  return (
    <section className="shop looks-shop" aria-labelledby="looks-shop">
      <h2 id="looks-shop">Looks shop</h2>
      <ShopPreview
        colors={trying ? wearing(colors, trying) : colors}
        celebrate={trying?.slot === 'celebration' ? trying.code : null}
        replay={replay}
      />
      <ShopTabs tab={tab} onTab={pickTab} />
      {tab === 'crate' ? (
        <CrateTab
          left={COSMETICS.filter((c) => !owned.includes(c.code)).length}
          balance={balance}
          busy={busy}
          confirming={crateAsk}
          prize={prize}
          colors={colors}
          onAsk={() => setCrateAsk(true)}
          onCancel={() => setCrateAsk(false)}
          onOpen={open}
          onWear={(c) => act(() => equipCosmetic(roomId, c.slot, c.code))}
        />
      ) : (
        <ul className="shop-cards">
          {COSMETICS.filter((c) => c.slot === tab).map((c) => (
            <ShopCard
              key={c.code}
              item={c}
              state={cardState(c, owned, colors)}
              colors={colors}
              trying={trying?.code === c.code}
              busy={busy}
              balance={balance}
              onTry={() => {
                setTrying(c);
                setReplay((n) => n + 1); // tapping a celebration again plays it again
              }}
              onBuy={() => setConfirming(c)}
              onWear={() => act(() => equipCosmetic(roomId, c.slot, c.code))}
              onRemove={() => act(() => equipCosmetic(roomId, c.slot, null))}
            />
          ))}
        </ul>
      )}
      {confirming && (
        <p>
          {`Buy ${confirming.name} for ${confirming.price} coins? `}
          <button type="button" className="primary" disabled={busy} onClick={() => buy(confirming)}>
            {`Pay ${confirming.price}`}
          </button>{' '}
          <button type="button" onClick={() => setConfirming(null)}>
            Cancel
          </button>
        </p>
      )}
    </section>
  );
}
