import { describe, expect, it } from 'vitest';
import { raceAwards } from './awards.ts';
import { fakeTimeline } from './testTimeline.ts';
import type { ItemCode, RaceEvent, Timeline } from './types.ts';

const hit = (t: number, by: string, horse: string, item: ItemCode): RaceEvent => ({
  t,
  type: 'hit',
  by,
  horse,
  item,
});

describe('raceAwards', () => {
  it('photo finish: won by less than 0.2 s', () => {
    expect(raceAwards(fakeTimeline({ a: 10, b: 9.95 })).photo_finish).toEqual(['a']);
    expect(raceAwards(fakeTimeline({ a: 10, b: 5 })).photo_finish).toEqual([]);
  });

  it('untouchable: the winner was never hit', () => {
    expect(raceAwards(fakeTimeline({ a: 10, b: 5 })).untouchable).toEqual(['a']);
    const hitWinner = fakeTimeline({ a: 10, b: 5 }, 100, [hit(1, 'b', 'a', 'attack:front1')]);
    expect(raceAwards(hitWinner).untouchable).toEqual([]);
  });

  it('banana king: most hits landed, at least 2, ties share it', () => {
    const events = [
      hit(1, 'b', 'a', 'attack:front1'),
      hit(2, 'b', 'c', 'attack:behind1'),
      hit(3, 'c', 'a', 'attack:front1'),
    ];
    expect(raceAwards(fakeTimeline({ a: 10, b: 9, c: 8 }, 100, events)).banana_king).toEqual(['b']);
    const tie = [...events, hit(4, 'c', 'b', 'attack:front1')];
    expect(raceAwards(fakeTimeline({ a: 10, b: 9, c: 8 }, 100, tie)).banana_king.sort()).toEqual([
      'b',
      'c',
    ]);
    const one = [hit(1, 'b', 'a', 'attack:front1')];
    expect(raceAwards(fakeTimeline({ a: 10, b: 9 }, 100, one)).banana_king).toEqual([]);
  });

  it('sniper: landed a Golden Lasso', () => {
    const events = [hit(1, 'c', 'a', 'attack:leader'), hit(2, 'c', 'b', 'attack:leader')];
    expect(raceAwards(fakeTimeline({ a: 10, b: 9, c: 8 }, 100, events)).sniper).toEqual(['c']);
  });

  it('comeback: the winner was last at half its finish time', () => {
    // a crawls for 5 s, then sprints; b runs steadily and finishes second.
    const ticks = 106;
    const a = Array.from({ length: ticks }, (_, i) => {
      const t = i / 10;
      return Math.min(100, t < 5 ? 2 * t : 10 + 18 * (t - 5));
    });
    const b = Array.from({ length: ticks }, (_, i) => Math.min(100, 9.6 * (i / 10)));
    const tl: Timeline = {
      ...fakeTimeline({ a: 10, b: 9.6 }),
      progress: { a, b },
      finishOrder: ['a', 'b'],
      finishTimes: { a: 10, b: 100 / 9.6 },
    };
    expect(raceAwards(tl).comeback).toEqual(['a']);
    expect(raceAwards(fakeTimeline({ a: 10, b: 5 })).comeback).toEqual([]);
  });
});
