import { TRAIT_CODES } from '../sim/config.ts';
import type { Trait } from '../sim/types.ts';

/** Phone and board wording (spec D); no numbers, so tuning never changes the text. */
export const TRAIT_INFO: Readonly<Record<Trait, { icon: string; name: string; effect: string }>> = {
  normal: { icon: '⚖️', name: 'Normal', effect: 'no upside, no downside' },
  charmed: { icon: '🧿', name: 'Charmed', effect: 'fewer duds, no rare upgrades' },
  tough: { icon: '🛡️', name: 'Tough', effect: 'hits hurt less, boosts help less' },
  sprinter: { icon: '⚡', name: 'Sprinter', effect: 'fast start, weaker finish' },
  stayer: { icon: '🐢', name: 'Stayer', effect: 'slow start, strong finish' },
  mudder: { icon: '🌧️', name: 'Mudder', effect: 'loves rain, a bit slower when dry' },
};

export const traitLabel = (t: Trait) =>
  `${TRAIT_INFO[t].icon} ${TRAIT_INFO[t].name} · ${TRAIT_INFO[t].effect}`;

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
