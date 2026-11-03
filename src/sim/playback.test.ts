import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_SECONDS,
  FINISH_HOLD_SECONDS,
  eventsBetween,
  gunMs,
  playbackSeconds,
  progressAt,
  standingsAt,
} from './playback.ts';
import { fakeTimeline } from './testTimeline.ts';
import type { RaceEvent } from './types.ts';

describe('playback', () => {
  it('lasts countdown + last finish + hold', () => {
    expect(playbackSeconds(fakeTimeline({ a: 10, b: 5 }))).toBe(
      COUNTDOWN_SECONDS + 20 + FINISH_HOLD_SECONDS,
    );
  });

  it('fires the gun COUNTDOWN_SECONDS after Start', () => {
    const start = '2026-10-30T12:00:00.000Z';
    expect(gunMs(start)).toBe(Date.parse(start) + COUNTDOWN_SECONDS * 1000);
  });

  it('interpolates progress between ticks and clamps both ends', () => {
    const tl = fakeTimeline({ a: 10, b: 5 });
    expect(progressAt(tl, 'a', -3)).toBe(0);
    expect(progressAt(tl, 'a', 0.55)).toBeCloseTo(5.5);
    expect(progressAt(tl, 'a', 99)).toBe(100);
    expect(progressAt(tl, 'nobody', 1)).toBe(0);
  });

  it('orders finished horses by place, then runners by distance, lane order on ties', () => {
    const tl = fakeTimeline({ a: 10, b: 5, c: 5, d: 8 });
    expect(standingsAt(tl, 0)).toEqual(['a', 'b', 'c', 'd']);
    expect(standingsAt(tl, 5)).toEqual(['a', 'd', 'b', 'c']);
    expect(standingsAt(tl, 30)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('lists events in (from, to]', () => {
    const events: RaceEvent[] = [
      { t: 1, type: 'finish', horse: 'a', place: 1 },
      { t: 2, type: 'finish', horse: 'b', place: 2 },
    ];
    const tl = fakeTimeline({ a: 10, b: 5 }, 100, events);
    expect(eventsBetween(tl, 1, 2)).toEqual([events[1]]);
    expect(eventsBetween(tl, 0, 1)).toEqual([events[0]]);
  });
});
