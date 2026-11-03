import type { HorseId, Timeline } from './types.ts';

/** Seconds between Start and the gun; the box spots are shown meanwhile. */
export const COUNTDOWN_SECONDS = 5;
/** Seconds the final standings stay up after the last horse finishes. */
export const FINISH_HOLD_SECONDS = 4;

/** Start to podium: countdown, the race itself, then the hold. `start-race` sets ends_at from it. */
export const playbackSeconds = (timeline: Pick<Timeline, 'finishTimes'>) =>
  COUNTDOWN_SECONDS + Math.max(...Object.values(timeline.finishTimes)) + FINISH_HOLD_SECONDS;

/** Epoch ms of the gun (race time 0) for a race started at `startedAt` (ISO). */
export const gunMs = (startedAt: string) => Date.parse(startedAt) + COUNTDOWN_SECONDS * 1000;

/** Metres from the start at race time `t` (seconds), linear between ticks. */
export function progressAt(timeline: Timeline, horse: HorseId, t: number): number {
  const samples = timeline.progress[horse];
  if (!samples || samples.length === 0) return 0;
  const i = Math.max(0, t * timeline.tickHz);
  const last = samples.length - 1;
  if (i >= last) return samples[last]!;
  const k = Math.floor(i);
  return samples[k]! + (samples[k + 1]! - samples[k]!) * (i - k);
}

/** Running order at `t`: finished horses by place, then the rest by distance (lane order on ties). */
export function standingsAt(timeline: Timeline, t: number): HorseId[] {
  const done = timeline.finishOrder.filter((h) => timeline.finishTimes[h]! <= t);
  const running = timeline.horses
    .filter((h) => !done.includes(h))
    .map((h) => ({ h, m: progressAt(timeline, h, t) }))
    .sort((a, b) => b.m - a.m)
    .map((x) => x.h);
  return [...done, ...running];
}

/** Events with from < t <= to, in simulation order. */
export const eventsBetween = (timeline: Timeline, from: number, to: number) =>
  timeline.events.filter((e) => e.t > from && e.t <= to);
