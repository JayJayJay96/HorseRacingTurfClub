import { ordinal } from '../betting/betting.ts';
import { standingsAt } from '../sim/playback.ts';
import type { HorseId, Timeline } from '../sim/types.ts';

/** Seconds between big-screen standings announcements. */
export const ANNOUNCE_EVERY_S = 10;

const PHASE_TEXT: Record<string, string> = {
  LOBBY: 'Back in the lobby',
  SHOP: 'Shop is open',
  ODDS_LOCKED: 'Shop is closed, calculating odds',
  BETTING: 'Betting is open',
  RUNNING: 'Race started',
};

/**
 * Phone live-region text: the phase, or at the podium the player's own result.
 * `place` is 0-based (-1 when the player didn't race); `won` is the sum of their payouts.
 */
export function phoneAnnouncement(phase: string, place: number, won: number): string {
  if (phase !== 'PODIUM') return PHASE_TEXT[phase] ?? '';
  const finished = place >= 0 ? `You finished ${ordinal(place + 1)}` : '';
  if (won <= 0) return finished || 'Results are in';
  return finished ? `${finished} and won ${won} coins` : `You won ${won} coins`;
}

/**
 * Big-screen live-region text: the top 3 sampled every ANNOUNCE_EVERY_S seconds, then the result.
 * The text only changes at those moments, so the region can't chatter.
 */
export function raceAnnouncement(
  timeline: Timeline,
  t: number,
  names: Readonly<Record<HorseId, string>>,
): string {
  const last = Math.max(...Object.values(timeline.finishTimes));
  const done = t >= last;
  const at = done ? last : Math.floor(t / ANNOUNCE_EVERY_S) * ANNOUNCE_EVERY_S;
  if (at <= 0) return '';
  const top3 = standingsAt(timeline, at)
    .slice(0, 3)
    .map((h, i) => `${ordinal(i + 1)} ${names[h] ?? '?'}`)
    .join(', ');
  return `${done ? 'Result' : 'Leading'}: ${top3}`;
}
