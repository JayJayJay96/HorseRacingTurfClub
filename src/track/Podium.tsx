import { nameOf } from '../betting/betting.ts';
import { HorseSprite } from '../render/HorseSprite.tsx';
import { horseColors, SILK_COLORS } from '../render/palette.ts';

type Person = {
  id: string;
  name: string;
  coat: number | null;
  silk: number | null;
  pattern?: string | null;
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
