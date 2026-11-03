import { describe, expect, it } from 'vitest';
import { fakeTimeline } from '../sim/testTimeline.ts';
import type { RaceEvent } from '../sim/types.ts';
import { raceCues } from './raceCues.ts';

const events: RaceEvent[] = [
  { t: 1, type: 'pickup', horse: 'a', kind: 'speed', item: 'speed:self1' },
  { t: 2, type: 'pickup', horse: 'b', kind: 'attack', item: null },
  { t: 3, type: 'hit', horse: 'a', by: 'b', item: 'attack:front1' },
  { t: 4, type: 'blocked', horse: 'a', by: 'b', item: 'attack:front1', reason: 'shield' },
  { t: 5, type: 'pickup', horse: 'a', kind: 'mystery', item: 'dud:trip' },
  { t: 10, type: 'finish', horse: 'a', place: 1 },
  { t: 20, type: 'finish', horse: 'b', place: 2 },
];
const tl = fakeTimeline({ a: 10, b: 5 }, 100, events);

describe('raceCues', () => {
  it('counts down 3-2-1 then go', () => {
    expect(raceCues(tl, -5, -0.5)).toEqual(['count', 'count', 'count']);
    expect(raceCues(tl, -0.5, 0)).toEqual(['go']);
  });

  it('maps events in (from, to] to sounds', () => {
    expect(raceCues(tl, 0, 5)).toEqual(['speed', 'fizzle', 'hit', 'shield', 'dud']);
    expect(raceCues(tl, 5, 25)).toEqual(['bell']);
  });

  it('collapses repeats so a burst stays short', () => {
    const many: RaceEvent[] = [1, 1.1, 1.2].map((t) => ({
      t,
      type: 'hit',
      horse: 'a',
      by: 'b',
      item: 'attack:all',
    }));
    expect(raceCues(fakeTimeline({ a: 10, b: 5 }, 100, many), 0, 2)).toEqual(['hit']);
  });
});
