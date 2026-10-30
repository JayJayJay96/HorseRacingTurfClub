import { describe, expect, it } from 'vitest';
import { balanceOf, boxesOf, formatOdds, nameOf, oddsOf, ordinal, potOf } from './betting.ts';

describe('betting helpers', () => {
  it('sums one player’s ledger rows', () => {
    const ledger = [
      { player_id: 'a', amount: 100 },
      { player_id: 'b', amount: 100 },
      { player_id: 'a', amount: -60 },
    ];
    expect(balanceOf(ledger, 'a')).toBe(40);
    expect(balanceOf(ledger, 'z')).toBe(0);
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
