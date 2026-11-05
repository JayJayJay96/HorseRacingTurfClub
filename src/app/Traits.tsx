import { TRAIT_CODES } from '../sim/config.ts';
import type { Trait } from '../sim/types.ts';

/**
 * Phone, board and Guide wording (spec 2026-11-06 A): what it does well, what it gives up.
 * No numbers, so tuning never changes the text.
 */
export const TRAIT_INFO: Readonly<
  Record<Trait, { icon: string; name: string; plus: string; minus: string }>
> = {
  normal: { icon: '⚖️', name: 'Normal', plus: 'No weak spots', minus: 'No special edge' },
  charmed: {
    icon: '🧿',
    name: 'Charmed',
    plus: 'Mystery boxes give fewer bad items',
    minus: 'Never gets the rare Stampede or Thunderclap',
  },
  tough: {
    icon: '🛡️',
    name: 'Tough',
    plus: 'Attacks, bad items and bumps slow you less',
    minus: 'Speed items boost you less',
  },
  sprinter: {
    icon: '⚡',
    name: 'Sprinter',
    plus: 'Faster over the first third of the race',
    minus: 'Weaker final sprint',
  },
  stayer: {
    icon: '🐢',
    name: 'Stayer',
    plus: 'Longer, stronger final sprint',
    minus: 'Slower over the first third of the race',
  },
  mudder: {
    icon: '🌧️',
    name: 'Mudder',
    plus: 'Faster in rain or fog, rarely slips or bumps',
    minus: 'Slower on a clear day',
  },
  closer: {
    icon: '🏹',
    name: 'Closer',
    plus: 'Faster while in the back of the pack',
    minus: 'Slower while near the front',
  },
  frontrunner: {
    icon: '🚩',
    name: 'Front-runner',
    plus: 'Faster while near the front',
    minus: 'Slower while in the back of the pack',
  },
  gambler: {
    icon: '🎲',
    name: 'Gambler',
    plus: 'Rare Stampede and Thunderclap far more likely',
    minus: 'Mystery boxes give more bad items',
  },
  brawler: {
    icon: '🥊',
    name: 'Brawler',
    plus: 'Your attacks slow rivals for longer',
    minus: 'Your speed items wear off sooner',
  },
};

/** One line: "🛡️ Tough · ✅ … · ⚠️ …". */
export const traitLabel = (t: Trait) =>
  `${TRAIT_INFO[t].icon} ${TRAIT_INFO[t].name} · ✅ ${TRAIT_INFO[t].plus} · ⚠️ ${TRAIT_INFO[t].minus}`;

export const TRAIT_LEGEND = TRAIT_CODES.map(
  (t) => `${TRAIT_INFO[t].icon} ${TRAIT_INFO[t].name}`,
).join(' · ');

/** A stored trait code; anything unknown or missing is Normal. */
export const asTrait = (value: unknown): Trait =>
  (TRAIT_CODES as readonly unknown[]).includes(value) ? (value as Trait) : 'normal';

/** `races.traits` (Json) or `timeline.traits`: this horse's trait. */
export const traitOf = (traits: unknown, id: string): Trait =>
  asTrait(
    traits && typeof traits === 'object' ? (traits as Record<string, unknown>)[id] : undefined,
  );

export function TraitIcon({ trait }: { trait: Trait }) {
  return (
    <span title={TRAIT_INFO[trait].name}>
      <span aria-hidden="true">{TRAIT_INFO[trait].icon}</span>
      <span className="visually-hidden">{TRAIT_INFO[trait].name}</span>
    </span>
  );
}
