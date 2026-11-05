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

const FX_COLORS = ['#ffd54f', '#e53935', '#29b6f6', '#66bb6a', '#ffffff', '#d81b60'];

/** Particle start/offset: two firework bursts of 8, or a cannon fan of 14 to the upper right. */
function particles(code: string): CSSProperties[] {
  if (code === 'celebration:fireworks') {
    return Array.from({ length: 16 }, (_, i) => {
      const a = (i % 8) * (Math.PI / 4);
      return {
        left: i < 8 ? '25%' : '75%',
        top: i < 8 ? '10%' : '0%',
        '--dx': `${Math.round(Math.cos(a) * 40)}px`,
        '--dy': `${Math.round(Math.sin(a) * 40)}px`,
        background: FX_COLORS[i % FX_COLORS.length],
        animationDelay: i < 8 ? '0.3s' : '0.8s',
      } as CSSProperties;
    });
  }
  if (code === 'celebration:cannon') {
    return Array.from({ length: 14 }, (_, i) => {
      const a = ((-20 - i * 5) * Math.PI) / 180;
      const r = 80 + (i % 4) * 25;
      return {
        '--dx': `${Math.round(Math.cos(a) * r)}px`,
        '--dy': `${Math.round(Math.sin(a) * r)}px`,
        background: FX_COLORS[i % FX_COLORS.length],
        animationDelay: `${(i % 3) * 0.05}s`,
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
