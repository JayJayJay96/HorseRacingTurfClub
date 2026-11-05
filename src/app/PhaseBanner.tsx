import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { soundEngine } from '../audio/sound.ts';

export const PHASE_BANNER: Readonly<Record<string, string>> = {
  SHOP: '🛒 SHOP OPEN!',
  ODDS_LOCKED: '🔒 ODDS LOCKED',
  BETTING: '💰 PLACE YOUR BETS!',
  RUNNING: '🏁 RACE TIME!',
  PODIUM: '🏆 RESULTS!',
};
const SHOW_MS = 1200;

/**
 * Banner text for a phase change; null on mount (`prev` null), when nothing changed, or for the
 * lobby. Each change compares against the last phase seen, so A to B to C shows C's banner.
 */
export const bannerText = (prev: string | null, next: string): string | null =>
  prev === null || prev === next ? null : (PHASE_BANNER[next] ?? null);

/**
 * A pixel band across the screen when `phase` changes after mount (spec 2026-11-05 polish section 3),
 * with the `phase` sting. aria-hidden: the live regions already announce phase changes.
 */
export function PhaseBanner({ phase }: { phase: string }) {
  const prev = useRef<string | null>(null);
  const [shown, setShown] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    const text = bannerText(prev.current, phase);
    prev.current = phase;
    if (!text) return;
    setShown((s) => ({ text, n: (s?.n ?? 0) + 1 }));
    try {
      soundEngine().sfx('phase');
    } catch {
      // sound is best effort
    }
  }, [phase]);
  // Its own effect, so a change to the lobby mid-banner can't leave the band stuck on screen.
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  if (!shown) return null;
  const layer = (
    <div className="phase-layer" aria-hidden="true">
      <div key={shown.n} className="phase-banner">
        <span>{shown.text}</span>
      </div>
    </div>
  );
  // In fullscreen only that element (and its children) is drawn, so show the banner inside it.
  const host = document.fullscreenElement;
  return host ? createPortal(layer, host) : layer;
}
