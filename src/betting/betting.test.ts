import { describe, expect, it } from 'vitest';
import {
  betOn,
  betWinning,
  boxesOf,
  canPlace,
  formatOdds,
  horseNameOf,
  nameOf,
  oddsOf,
  ordinal,
  potOf,
} from './betting.ts';

describe('betting helpers', () => {
  it('names horses by horse name when set, else by person', () => {
    const players = [
      { id: 'a', name: 'Ali', horse_name: 'Thunder' },
      { id: 'b', name: 'Bea', horse_name: null },
    ];
    expect(horseNameOf(players, 'a')).toBe('Thunder');
    expect(horseNameOf(players, 'b')).toBe('Bea');
    expect(horseNameOf(players, 'zz')).toBe('?');
  });

  it('lists a player’s boxes and the pot', () => {
    const purchases = [
      { player_id: 'a', box: 'speed' },
      { player_id: 'b', box: 'attack' },
      { player_id: 'a', box: 'defense' },
    ];
    expect(boxesOf(purchases, 'a')).toEqual(['speed', 'defense']);
    expect(potOf([{ stake: 10 }, { stake: 25 }])).toBe(35);
  });

  it('reads odds, names, and formats them', () => {
    expect(oddsOf(null)).toEqual({});
    expect(oddsOf({ odds: { a: { win: 2, place: 1.2 } } })).toEqual({ a: { win: 2, place: 1.2 } });
    expect(nameOf([{ id: 'a', name: 'Ali' }], 'a')).toBe('Ali');
    expect(nameOf([], 'x')).toBe('?');
    expect(formatOdds(1.05)).toBe('1.05×');
    expect(formatOdds(1.6)).toBe('1.6×');
    expect(formatOdds(undefined)).toBe('–');
  });

  it('allows Place bets only with more than 3 horses', () => {
    expect(canPlace(['a', 'b', 'c'])).toBe(false);
    expect(canPlace(['a', 'b', 'c', 'd'])).toBe(true);
  });

  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
  ])('ordinal(%i) = %s', (n, s) => {
    expect(ordinal(n)).toBe(s);
  });
});

describe('group bets', () => {
  const horses = ['a', 'b', 'c', 'd', 'e']; // #1..#5
  const bet = (kind: string, horse_id: string | null = null) => ({ kind, horse_id });

  it('labels horse and group bets', () => {
    const players = [{ id: 'a', name: 'Ann' }];
    expect(betOn(bet('win', 'a'), players)).toBe('Ann to win');
    expect(betOn(bet('odd'), players)).toBe('Odd numbers');
  });

  it("judges group bets on the winner's number", () => {
    const order = ['d', 'a', 'b', 'c', 'e']; // #4 leads
    expect(betWinning(bet('even'), order, horses)).toBe(true);
    expect(betWinning(bet('odd'), order, horses)).toBe(false);
    expect(betWinning(bet('high'), order, horses)).toBe(true); // 5 horses: low #1-#2, high #3-#5
    expect(betWinning(bet('low'), order, horses)).toBe(false);
    expect(betWinning(bet('place', 'b'), order, horses)).toBe(true);
    expect(betWinning(bet('win', 'a'), order, horses)).toBe(false);
  });
});
