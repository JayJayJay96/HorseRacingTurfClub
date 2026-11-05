import type { CSSProperties, ReactNode } from 'react';
import { nameOf } from '../betting/betting.ts';
import { HorseSprite } from '../render/HorseSprite.tsx';
import { horseColors, SILK_COLORS } from '../render/palette.ts';

type Person = {
  id: string;
  name: string;
  coat: number | null;
  silk: number | null;
  pattern?: string | null;
  cap?: string | null;
  celebration?: string | null;
};
type Paid = { player_id: string; payout: number | null };

/** Winning players, one line each (payouts summed), high to low; every line at the top total is best. */
export function payoutLines(bets: readonly Paid[]) {
  const totals = new Map<string, number>();
  for (const b of bets) {
    if ((b.payout ?? 0) > 0) totals.set(b.player_id, (totals.get(b.player_id) ?? 0) + b.payout!);
  }
  const lines = [...totals]
    .map(([player, total]) => ({ player, total }))
    .sort((a, b) => b.total - a.total);
  const top = lines[0]?.total;
  return lines.map((l) => ({ ...l, best: l.total === top }));
}

/** Podium payout lines: sprite, bettor, "+N coins"; the biggest in gold. */
export function Payouts(props: {
  bets: readonly Paid[];
  players: readonly Person[];
  horses: readonly string[];
}) {
  const lines = payoutLines(props.bets);
  if (lines.length === 0) return <p>No winning bets.</p>;
  return (
    <ul className="payout-lines">
      {lines.map((l) => (
        <li key={l.player} className={l.best ? 'best' : undefined}>
          <HorseSprite colors={horseColors(props.players, props.horses, l.player)} size="sm" />
          {` ${nameOf(props.players, l.player)} `}
          <span className="pixel">{`+${l.total} coins`}</span>
        </li>
      ))}
    </ul>
  );
}

/** A one-off ~3 s burst of pixel squares in the podium silks (CSS only; none under reduced motion). */
export function Confetti({ colors }: { colors: readonly string[] }) {
  const palette = colors.length > 0 ? colors : SILK_COLORS;
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 40 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: palette[i % palette.length],
            animationDelay: `${(i % 8) * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Podium class per celebration (app.css). None or an unknown code keeps today's hop. */
export const CELEBRATIONS: Readonly<Record<string, string>> = {
  'celebration:spin': 'celebrate-spin',
  'celebration:fireworks': 'celebrate-fireworks',
  'celebration:moonwalk': 'celebrate-moonwalk',
  'celebration:cannon': 'celebrate-cannon',
};
export const celebrationClass = (code?: string | null) =>
  (code && CELEBRATIONS[code]) || 'podium-hop';

const FX_COLORS = ['#ffd54f', '#ffffff', '#ff5252', '#40c4ff', '#69f0ae', '#ff4081', '#ffab40'];

/** Deterministic 0..1 jitter, so the markup is stable (tests, SSR). */
const jit = (i: number, k: number) => ((i * 7919 + k * 104729) % 1000) / 1000;

/**
 * Winner particles, 6-10 px squares positioned against the sprite box: three firework bursts of 12
 * above the winner, or a 36-piece confetti cone shooting up from the step and falling back.
 */
function particles(code: string): CSSProperties[] {
  const base = (i: number) => {
    const color = FX_COLORS[i % FX_COLORS.length]!;
    return {
      width: `${12 + Math.round(jit(i, 1) * 6)}px`,
      height: `${12 + Math.round(jit(i, 2) * 6)}px`,
      background: color,
      boxShadow: `0 0 10px 2px ${color}`,
    };
  };
  if (code === 'celebration:fireworks') {
    const bursts = [
      { left: '-10%', top: '0%' },
      { left: '110%', top: '-30%' },
      { left: '50%', top: '-60%' },
    ];
    return Array.from({ length: 36 }, (_, i) => {
      const b = bursts[Math.floor(i / 12)]!;
      const a = ((i % 12) / 12) * Math.PI * 2;
      const r = 90 + jit(i, 3) * 80;
      return {
        ...base(i),
        ...b,
        '--dx': `${Math.round(Math.cos(a) * r)}px`,
        '--dy': `${Math.round(Math.sin(a) * r)}px`,
        animationDelay: `${Math.floor(i / 12) * 0.4}s`,
      } as CSSProperties;
    });
  }
  if (code === 'celebration:cannon') {
    return Array.from({ length: 36 }, (_, i) => {
      const a = ((-90 + (jit(i, 3) - 0.5) * 80) * Math.PI) / 180; // a cone straight up
      const r = 170 + jit(i, 4) * 120;
      return {
        ...base(i),
        '--dx': `${Math.round(Math.cos(a) * r)}px`,
        '--dy': `${Math.round(Math.sin(a) * r)}px`,
        animationDelay: `${(i % 6) * 0.05}s`,
      } as CSSProperties;
    });
  }
  return [];
}

/**
 * The podium winner's celebration around its sprite (CSS only; spec 2026-11-05 cosmetics shop).
 * Reduced motion: no movement, no particles. `once` plays it a single time (the shop preview).
 */
export function Celebration(props: { code?: string | null; once?: boolean; children: ReactNode }) {
  const fx = props.code ? particles(props.code) : [];
  return (
    <span className={`celebration ${celebrationClass(props.code)}${props.once ? ' is-once' : ''}`}>
      {props.children}
      {fx.length > 0 && (
        <span className="celebration-fx" aria-hidden="true">
          {fx.map((style, i) => (
            <i key={i} style={style} />
          ))}
        </span>
      )}
    </span>
  );
}
