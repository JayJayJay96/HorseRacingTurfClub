import { ordinal } from '../betting/betting.ts';
import { HorseSprite } from '../render/HorseSprite.tsx';
import type { HorseColors } from '../render/palette.ts';

/** Top of the phone podium: your horse, your place (0-based, -1 = not racing) and winnings. */
export function ResultCard({
  colors,
  place,
  won,
}: {
  colors: HorseColors;
  place: number;
  won: number;
}) {
  return (
    <section className="panel result-card">
      <HorseSprite colors={colors} size="lg" />
      {place >= 0 && (
        <p className="result-place">
          You finished <strong>{ordinal(place + 1)}</strong>
        </p>
      )}
      <p className={won > 0 ? 'result-coins win' : 'result-coins'}>
        {won > 0 ? `+${won} coins` : 'No winnings this time'}
      </p>
    </section>
  );
}
