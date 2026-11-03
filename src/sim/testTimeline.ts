import type { RaceEvent, Timeline } from './types.ts';

/** Horses at constant speed (m/s) over `distance`, sampled at 10 Hz like the engine. */
export function fakeTimeline(
  speeds: Record<string, number>,
  distance = 100,
  events: RaceEvent[] = [],
): Timeline {
  const horses = Object.keys(speeds);
  const slowest = Math.min(...Object.values(speeds));
  const ticks = Math.ceil((distance / slowest) * 10) + 1;
  const progress: Record<string, number[]> = {};
  const finishTimes: Record<string, number> = {};
  for (const h of horses) {
    const v = speeds[h]!;
    progress[h] = Array.from({ length: ticks }, (_, i) => Math.min(distance, (v * i) / 10));
    finishTimes[h] = distance / v;
  }
  const finishOrder = [...horses].sort((a, b) => finishTimes[a]! - finishTimes[b]!);
  return {
    seed: 1,
    length: 'short',
    distance,
    tickHz: 10,
    horses,
    boxes: {},
    progress,
    events,
    finishOrder,
    finishTimes,
  };
}
