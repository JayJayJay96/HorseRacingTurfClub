import { KICK, TRAITS } from './config.ts';
import type { Trait } from './types.ts';

/** Tough (spec D): a slowdown m < 1 or boost m > 1 keeps only part of its strength. */
export function toughen(mult: number): number {
  if (mult < 1) return 1 - (1 - mult) * TRAITS.tough.hitFactor;
  if (mult > 1) return 1 + (mult - 1) * TRAITS.tough.boostFactor;
  return mult;
}

/** Pace factor while the horse is in the first third of the race. */
export const earlyPaceOf = (t: Trait): number =>
  t === 'sprinter' ? TRAITS.sprinter.earlyPace : t === 'stayer' ? TRAITS.stayer.earlyPace : 1;

/** Finishing-kick boost (KICK.boost for everyone but Sprinter and Stayer). */
export const kickBoostOf = (t: Trait): number =>
  t === 'sprinter'
    ? TRAITS.sprinter.kickBoost
    : t === 'stayer'
      ? TRAITS.stayer.kickBoost
      : KICK.boost;

/** Extra kick seconds (Stayer). */
export const kickExtraSecondsOf = (t: Trait): number =>
  t === 'stayer' ? TRAITS.stayer.kickExtraSeconds : 0;
