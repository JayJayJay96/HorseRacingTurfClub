import { describe, expect, it } from 'vitest';
import { fakeTimeline } from '../sim/testTimeline.ts';
import type { RaceEvent, Timeline } from '../sim/types.ts';
import { createCommentator, podiumLine } from './commentator.ts';

const name = (h: string) => h.toUpperCase();
/** A 100 m test track, so the "final stretch" is 30 m from the finish here. */
const opts = { finalStretchMetres: 30, rand: () => 0 };

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
    expect(com.linesUpTo(-2)).toEqual(['Welcome to the Turf Club! 3 horses at the gate.']);
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

  it('introduces the field before the gun (only when listening from before -4 s)', () => {
    const com = createCommentator(overtake(), name, -Infinity, { ...opts, prize: 'Lunch' });
    expect(com.linesUpTo(-3.9)).toEqual([
      'Welcome to the Turf Club! 3 horses at the gate.',
      "Today's prize: Lunch!",
    ]);
    expect(createCommentator(overtake(), name, -3, opts).linesUpTo(1)).toEqual([
      "And they're off!",
    ]);
  });

  it('jokes about items, but respects the gap for ordinary lines', () => {
    const events: RaceEvent[] = [
      { t: 4, type: 'hit', horse: 'a', by: 'c', item: 'attack:behind1' },
      { t: 4.5, type: 'pickup', horse: 'b', kind: 'mystery', item: 'dud:stop' },
    ];
    const com = createCommentator(overtake(events), name, 0, opts);
    expect(com.linesUpTo(4.6)).toEqual(['A slips on a banana! Who left that there?']);
  });

  it('says a hornet swarm once', () => {
    const events: RaceEvent[] = [
      { t: 4, type: 'hit', horse: 'a', by: 'c', item: 'attack:top3' },
      { t: 4, type: 'hit', horse: 'b', by: 'c', item: 'attack:top3' },
    ];
    const com = createCommentator(overtake(events), name, 0, opts);
    expect(com.linesUpTo(4.1)).toEqual(['Hornets! The leaders are swatting for their lives!']);
  });

  it('calls an outsider taking the lead with its odds', () => {
    const com = createCommentator(overtake(), name, 0, { ...opts, odds: { a: { win: 12.4 } } });
    com.linesUpTo(2); // b leads first
    expect(com.linesUpTo(8)[0]).toBe('The 12-to-1 outsider A hits the front! Who saw that coming?');
  });

  it('calls neck and neck once, late in the race', () => {
    // a and b dead level all race; a wins at 10 s, so 70% is 7 s.
    const tl = overtake();
    const level = { ...tl, progress: { ...tl.progress, b: tl.progress.a! } };
    const com = createCommentator(level, name, 0, opts);
    expect(com.linesUpTo(6.9)).toEqual([]);
    expect(com.linesUpTo(7.1)).toEqual(['Neck and neck between A and B!']);
    expect(com.linesUpTo(9.9)).toEqual(['Into the final stretch!']); // no second neck call
  });

  it('reacts to the crowd at most every 15 s', () => {
    const com = createCommentator(overtake(), name, 0, opts);
    expect(com.linesUpTo(1, 3)).toContain('Listen to that crowd!');
    expect(com.linesUpTo(6, 5)).not.toContain('Listen to that crowd!');
  });

  it('podium banter', () => {
    const r = () => 0;
    expect(podiumLine([], 0, r)).toBe('No bets this time. Next race!');
    expect(podiumLine([], 3, r)).toBe('No winners! The bookie keeps it all!');
    expect(
      podiumLine(
        [
          { name: 'Cal', payout: 63 },
          { name: 'Ali', payout: 10 },
        ],
        4,
        r,
      ),
    ).toBe('Cal cashes in 63 coins!');
  });
});

describe('weather lines', () => {
  it('calls the weather at the gun', () => {
    const tl = { ...fakeTimeline({ a: 10, b: 5 }, 100), weather: 'rain' as const };
    const c = createCommentator(tl, (h) => h, -0.5, { rand: () => 0 });
    expect(c.linesUpTo(0.1)).toContain('Wet track today! Watch those puddles!');
  });

  it('jokes about slips and bumps', () => {
    const tl = fakeTimeline({ a: 10, b: 5 }, 100, [
      { t: 5, type: 'slip', horse: 'a' },
      { t: 15, type: 'bump', horse: 'a', with: 'b' },
    ]);
    const c = createCommentator(tl, (h) => h, 0, { rand: () => 0 });
    expect(c.linesUpTo(6)).toContain('Splash! a slips in a puddle!');
    expect(c.linesUpTo(16)).toContain('Bonk! a and b bump in the fog!');
  });
});
