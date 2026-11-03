import { standingsAt } from './playback.ts';
import type { HorseId, RaceEvent, Timeline } from './types.ts';

/** Spec §9 badges only the race itself can tell; the rest come from results, bets and coins in SQL. */
export const EVENT_BADGES = [
  'photo_finish',
  'comeback',
  'banana_king',
  'untouchable',
  'sniper',
] as const;
export type EventBadge = (typeof EVENT_BADGES)[number];

export const PHOTO_FINISH_SECONDS = 0.2;
export const BANANA_KING_MIN_HITS = 2;

type Hit = Extract<RaceEvent, { type: 'hit' }>;
const isHit = (e: RaceEvent): e is Hit => e.type === 'hit';

export function raceAwards(timeline: Timeline): Record<EventBadge, HorseId[]> {
  const awards: Record<EventBadge, HorseId[]> = {
    photo_finish: [],
    comeback: [],
    banana_king: [],
    untouchable: [],
    sniper: [],
  };
  const [winner, second] = timeline.finishOrder;
  if (winner === undefined) return awards;
  const won = timeline.finishTimes[winner]!;
  if (second !== undefined && timeline.finishTimes[second]! - won < PHOTO_FINISH_SECONDS) {
    awards.photo_finish.push(winner);
  }
  // "Last at halfway" uses half the winner's time, not half the distance: simple and close enough.
  const atHalf = standingsAt(timeline, won / 2);
  if (atHalf.length > 1 && atHalf[atHalf.length - 1] === winner) awards.comeback.push(winner);

  const hits = timeline.events.filter(isHit);
  if (!hits.some((e) => e.horse === winner)) awards.untouchable.push(winner);
  const landed = new Map<HorseId, number>();
  for (const e of hits) landed.set(e.by, (landed.get(e.by) ?? 0) + 1);
  const most = Math.max(0, ...landed.values());
  if (most >= BANANA_KING_MIN_HITS) {
    for (const [horse, n] of landed) if (n === most) awards.banana_king.push(horse);
  }
  for (const e of hits) {
    if (e.item === 'attack:leader' && !awards.sniper.includes(e.by)) awards.sniper.push(e.by);
  }
  return awards;
}
