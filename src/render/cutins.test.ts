import { describe, expect, it } from 'vitest';
import type { ItemCode, RaceEvent, Timeline } from '../sim/types.ts';
import { CUTIN_COOLDOWN, CUTIN_SECONDS, cutinAt, cutinsOf } from './cutins.ts';

const pick = (t: number, horse: string, item: ItemCode | null): RaceEvent => ({
  t,
  type: 'pickup',
  horse,
  kind: 'mystery',
  item,
});
const race = (events: RaceEvent[]) => ({ events }) as unknown as Timeline;

describe('cutinsOf', () => {
  it('ignores ordinary items and an empty race', () => {
    expect(cutinsOf(race([]))).toEqual([]);
    expect(
      cutinsOf(
        race([pick(5, 'a', 'attack:top3'), pick(6, 'a', 'speed:self1'), pick(7, 'a', null)]),
      ),
    ).toEqual([]);
  });

  it('keeps one cut-in per cooldown; skipped moments are dropped', () => {
    const out = cutinsOf(
      race([
        pick(10, 'a', 'speed:pass3'),
        pick(15, 'b', 'attack:all'), // inside the cooldown: no band
        pick(10 + CUTIN_COOLDOWN, 'c', 'speed:pass3'),
      ]),
    );
    expect(out.map((c) => `${c.t}:${c.horse}`)).toEqual(['10:a', `${10 + CUTIN_COOLDOWN}:c`]);
  });

  it('lets a rarer item within 1 s take the slot; earliest wins among equals', () => {
    const out = cutinsOf(
      race([
        pick(20, 'a', 'speed:pass3'),
        pick(20.5, 'b', 'attack:leader'),
        pick(20.8, 'c', 'attack:leader'),
        pick(21.5, 'd', 'attack:all'), // past the window
      ]),
    );
    expect(out).toEqual([{ t: 20.5, horse: 'b', item: 'attack:leader' }]);
  });

  it('sorts by time and is memoised per timeline', () => {
    const tl = race([pick(40, 'b', 'attack:all'), pick(5, 'a', 'speed:pass3')]);
    expect(cutinsOf(tl).map((c) => c.t)).toEqual([5, 40]);
    expect(cutinsOf(tl)).toBe(cutinsOf(tl));
  });
});

describe('cutinAt', () => {
  it('shows a band for CUTIN_SECONDS from its start', () => {
    const list = cutinsOf(race([pick(8, 'a', 'attack:all')]));
    expect(cutinAt(list, 7.9)).toBeUndefined();
    expect(cutinAt(list, 8)?.horse).toBe('a');
    expect(cutinAt(list, 8 + CUTIN_SECONDS - 0.01)?.horse).toBe('a');
    expect(cutinAt(list, 8 + CUTIN_SECONDS)).toBeUndefined();
  });
});
