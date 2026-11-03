import { useEffect, useState } from 'react';
import { buyCosmetic, equipCosmetic, fetchOwnedCosmetics, type RoomPlayer } from '../net/rooms.ts';
import { COSMETICS, type Cosmetic } from '../shop/cosmetics.ts';

type Act = (fn: () => Promise<unknown>) => void;
type Props = { roomId: string; mine: RoomPlayer; balance: number; act: Act; busy: boolean };

/** Office LOBBY: buy silk patterns and trails with coins, then wear or remove them. */
export function LooksShop({ roomId, mine, balance, act, busy }: Props) {
  const [owned, setOwned] = useState<readonly string[]>([]);
  const [confirming, setConfirming] = useState<Cosmetic | null>(null);
  useEffect(() => {
    fetchOwnedCosmetics(mine.id).then(setOwned, () => {}); // a failed load only hides Wear
  }, [mine.id]);

  const buy = (c: Cosmetic) => {
    setConfirming(null);
    act(async () => {
      await buyCosmetic(roomId, c.code);
      // The buy went through; a failed refetch of the owned list must not report it as failed.
      setOwned((prev) => [...prev, c.code]);
      fetchOwnedCosmetics(mine.id).then(setOwned, () => {});
    });
  };

  return (
    <section className="shop" aria-labelledby="looks-shop">
      <h2 id="looks-shop">Looks shop</h2>
      <ul>
        {COSMETICS.map((c) => {
          const worn = mine[c.slot] === c.code;
          return (
            <li key={c.code}>
              {c.name} · {c.price}{' '}
              {!owned.includes(c.code) ? (
                <button
                  type="button"
                  aria-label={`Buy ${c.name}`}
                  disabled={busy || balance < c.price}
                  onClick={() => setConfirming(c)}
                >
                  Buy
                </button>
              ) : worn ? (
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  disabled={busy}
                  onClick={() => act(() => equipCosmetic(roomId, c.slot, null))}
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={`Wear ${c.name}`}
                  disabled={busy}
                  onClick={() => act(() => equipCosmetic(roomId, c.slot, c.code))}
                >
                  Wear
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {confirming && (
        <p>
          Buy {confirming.name} for {confirming.price} coins?{' '}
          <button type="button" className="primary" disabled={busy} onClick={() => buy(confirming)}>
            Pay {confirming.price}
          </button>{' '}
          <button type="button" onClick={() => setConfirming(null)}>
            Cancel
          </button>
        </p>
      )}
    </section>
  );
}
