import { describe, expect, it } from 'vitest';
import { fakeTimeline } from '../sim/testTimeline.ts';
import type { RaceEvent, Timeline } from '../sim/types.ts';
import { createCommentator } from './commentator.ts';

const name = (h: string) => h.toUpperCase();
/** A 100 m test track, so the "final stretch" is 30 m from the finish here. */
const opts = { finalStretchMetres: 30 };

/** b leads early, a overtakes at ~6.7 s and wins at 10 s; c trails. */
function overtake(events: RaceEvent[] = []): Timeline {
  const ticks = 251;
  const a = Array.from({ length: ticks }, (_, i) =>
    Math.min(100, i < 50 ? 0.6 * i : 30 + 1.4 * (i - 50)),
  );
  const b = Array.from({ length: ticks }, (_, i) => Math.min(100, 0.8 * i));
  const c = Array.from({ length: ticks }, (_, i) => Math.min(100, 0.4 * i));
  return {
    ...fakeTimeline({ a: 10, b: 8, c: 4 }, 100, events),
    progress: { a, b, c },
    finishOrder: ['a', 'b', 'c'],
    finishTimes: { a: 10, b: 12.5, c: 25 },
  };
}

describe('createCommentator', () => {
  it('opens, calls the lead change, the stretch and the finish, each once', () => {
    const com = createCommentator(overtake(), name, -Infinity, opts);
    expect(com.linesUpTo(-2)).toEqual([]);
    expect(com.linesUpTo(0.1)).toEqual(["And they're off!"]);
    expect(com.linesUpTo(2)).toEqual([]); // b leads early, but lead calls wait for 3 s
    expect(com.linesUpTo(8)).toEqual(['A takes the lead!', 'Into the final stretch!']);
    expect(com.linesUpTo(30)).toEqual(['A wins it! B second, C third.']);
    expect(com.linesUpTo(40)).toEqual([]);
  });

  it('calls big moments regardless of the gap', () => {
    const events: RaceEvent[] = [
      { t: 0.5, type: 'hit', horse: 'b', by: 'c', item: 'attack:leader' },
      { t: 0.6, type: 'pickup', horse: 'c', kind: 'mystery', item: 'attack:all' },
    ];
    const com = createCommentator(overtake(events), name, -Infinity, opts);
    expect(com.linesUpTo(1)).toEqual([
      "And they're off!",
      'Golden Lasso! C stops B!',
      'Thunderclap from C!',
    ]);
  });

  it('starting late (reload) says nothing about the past', () => {
    const com = createCommentator(overtake(), name, 15, opts);
    expect(com.linesUpTo(16)).toEqual([]);
    expect(com.linesUpTo(30)).toEqual([]);
  });
});
