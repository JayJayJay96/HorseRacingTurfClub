import { describe, expect, it } from 'vitest';
import { fakeTimeline } from '../sim/testTimeline.ts';
import type { RaceEvent } from '../sim/types.ts';
import { prioritise, raceCues } from './raceCues.ts';

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

describe('raceCues cut-in', () => {
  it('queues the cut-in sting when a band starts, and prioritise keeps it', () => {
    const lasso = fakeTimeline({ a: 10, b: 5 }, 100, [
      { t: 2, type: 'pickup', horse: 'b', kind: 'mystery', item: 'attack:leader' },
      { t: 2, type: 'hit', horse: 'a', by: 'b', item: 'attack:leader' },
    ]);
    const cues = raceCues(lasso, 1, 3);
    expect(cues).toEqual(['attack', 'hit', 'cutin']);
    expect(prioritise(['speed', 'hit', 'shield', 'cutin'], 3)).toContain('cutin');
  });
});

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

describe('prioritise', () => {
  it('keeps go/bell/count ahead of earlier hits', () => {
    expect(prioritise(['hit', 'speed', 'attack', 'count', 'bell', 'go'], 3)).toEqual([
      'go',
      'bell',
      'count',
    ]);
  });
  it('keeps the order of the rest', () => {
    expect(prioritise(['hit', 'speed', 'go', 'attack'], 3)).toEqual(['go', 'hit', 'speed']);
  });
});

describe('raceCues weather', () => {
  it('splashes on a slip and bonks on a bump', () => {
    const wet = fakeTimeline({ a: 10, b: 5 }, 100, [
      { t: 2, type: 'slip', horse: 'a' },
      { t: 3, type: 'bump', horse: 'a', with: 'b' },
    ]);
    expect(raceCues(wet, 1, 4)).toEqual(['splash', 'bonk']);
  });

  it('keeps a rain bed going every 3 s while a rain race runs', () => {
    const rain = { ...fakeTimeline({ a: 10, b: 5 }, 100), weather: 'rain' as const };
    expect(raceCues(rain, -0.1, 0)).toEqual(['go', 'rain']);
    expect(raceCues(rain, 0, 2.9)).toEqual([]);
    expect(raceCues(rain, 2.9, 3)).toEqual(['rain']);
    expect(raceCues(fakeTimeline({ a: 10 }, 100), 2.9, 3)).toEqual([]);
    expect(prioritise(['hit', 'speed', 'shield', 'rain'], 3)).not.toContain('rain');
  });
});
