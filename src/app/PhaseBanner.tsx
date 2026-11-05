import { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/sound.ts';

export const PHASE_BANNER: Readonly<Record<string, string>> = {
  SHOP: '🛒 SHOP OPEN!',
  ODDS_LOCKED: '🔒 ODDS LOCKED',
  BETTING: '💰 PLACE YOUR BETS!',
  RUNNING: '🏁 RACE TIME!',
  PODIUM: '🏆 RESULTS!',
};
const SHOW_MS = 1200;

/** Banner text for a phase change; null when nothing changed or for the lobby. */
export const bannerText = (prev: string, next: string): string | null =>
  prev === next ? null : (PHASE_BANNER[next] ?? null);

/**
 * A pixel band across the screen when `phase` changes after mount (spec 2026-11-05 polish section 3),
 * with the `phase` sting. aria-hidden: the live regions already announce phase changes.
 */
export function PhaseBanner({ phase }: { phase: string }) {
  const prev = useRef(phase);
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
  return (
    <div className="phase-layer" aria-hidden="true">
      <div key={shown.n} className="phase-banner">
        <span>{shown.text}</span>
      </div>
    </div>
  );
}
