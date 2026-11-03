import type { ReactNode } from 'react';

type Props = {
  /** Room code chip (big screen and phone). */
  code?: string;
  /** Coins chip (phone). */
  coins?: number;
  /** Right-hand controls, e.g. the sound toggle. */
  children?: ReactNode;
};

/**
 * Thin bar on every page: brand on the left; room code, coins and sound on the right. The brand
 * links home only outside a room, so a stray tap can't drop a live race.
 */
export function TopBar({ code, coins, children }: Props) {
  return (
    <header className="topbar">
      {code ? (
        <span className="brand">TURF CLUB</span>
      ) : (
        <a className="brand" href="/">
          TURF CLUB
        </a>
      )}
      <div className="topbar-end">
        {code && <span className="chip">Room {code}</span>}
        {coins !== undefined && <span className="chip">💰 {coins} coins</span>}
        {children}
      </div>
    </header>
  );
}
