import { describe, expect, it } from 'vitest';
import { MAX_HORSES } from '../sim/config.ts';
import {
  COAT_COLORS,
  SILK_COLORS,
  colorsByPlayer,
  colorsFor,
  colorsOf,
  contrastOf,
  horseColors,
} from './palette.ts';

describe('colorsOf', () => {
  it('gives every lane of a full field its own coat + silk', () => {
    const pairs = Array.from({ length: MAX_HORSES }, (_, lane) => {
      const c = colorsOf(lane);
      return `${c.coat}/${c.silk}`;
    });
    expect(new Set(pairs).size).toBe(MAX_HORSES);
  });
});

describe('colorsFor', () => {
  it('uses the member choice and falls back to the lane colours', () => {
    expect(colorsFor(3, { coat: null, silk: null })).toEqual(colorsOf(3));
    expect(colorsFor(3, { coat: 0, silk: 1 })).toEqual({
      coat: COAT_COLORS[0],
      mane: colorsOf(0).mane,
      silk: SILK_COLORS[1],
    });
    expect(colorsFor(4, undefined)).toEqual(colorsOf(4));
  });
});

describe('colorsByPlayer', () => {
  it('passes the worn pattern and trail through', () => {
    const colors = colorsByPlayer([
      { id: 'a', coat: 1, silk: 2, pattern: 'pattern:sash', trail: 'trail:dust' },
      { id: 'b', coat: null, silk: null, pattern: null, trail: null },
    ]);
    expect(colors('a', 0)).toMatchObject({ pattern: 'pattern:sash', trail: 'trail:dust' });
    expect(colors('b', 1)).toMatchObject({ pattern: null, trail: null });
    expect(colors('c', 2)).toEqual(colorsOf(2));
  });
  it('passes the worn cap and celebration through', () => {
    const colors = colorsByPlayer([
      { id: 'a', coat: 1, silk: 2, cap: 'cap:crown', celebration: 'celebration:spin' },
      { id: 'b', coat: null, silk: null, cap: null, celebration: null },
    ]);
    expect(colors('a', 0)).toMatchObject({ cap: 'cap:crown', celebration: 'celebration:spin' });
    expect(colors('b', 1)).toMatchObject({ cap: null, celebration: null });
    expect(horseColors([{ id: 'a', coat: null, silk: null, cap: 'cap:halo' }], [], 'a').cap).toBe(
      'cap:halo',
    );
  });
});

describe('contrastOf', () => {
  it('is dark on light silks and white on dark ones', () => {
    expect(contrastOf('#ffffff')).toBe('#1a1a1a');
    expect(contrastOf('#fdd835')).toBe('#1a1a1a');
    expect(contrastOf('#3949ab')).toBe('#ffffff');
    expect(contrastOf('#e53935')).toBe('#ffffff');
  });
});

describe('horseColors', () => {
  const players = [
    { id: 'a', coat: null, silk: null },
    { id: 'b', coat: 2, silk: 3, pattern: 'pattern:hoops' },
  ];
  it('uses the race lane when the horse is in the race', () => {
    expect(horseColors(players, ['b', 'a'], 'a')).toEqual(colorsOf(1));
    expect(horseColors(players, ['b', 'a'], 'b')).toEqual(colorsByPlayer(players)('b', 0));
  });
  it('off the race: the roster position; an unknown id gets lane 0', () => {
    expect(horseColors(players, [], 'a')).toEqual(colorsOf(0));
    expect(horseColors([{ id: 'z', coat: null, silk: null }, ...players], [], 'a')).toEqual(
      colorsOf(1),
    );
    expect(horseColors(players, [], 'x')).toEqual(colorsOf(0));
  });
  it('joined_at is compared as text, so microseconds count', () => {
    const p = (id: string, joined_at: string) => ({
      id,
      joined_at,
      ticked: true,
      coat: null,
      silk: null,
    });
    const roster = [
      p('a', '2026-01-01T00:00:00.000002+00:00'),
      p('b', '2026-01-01T00:00:00.000001+00:00'),
    ];
    expect(horseColors(roster, [], 'b')).toEqual(colorsOf(0));
    expect(horseColors(roster, [], 'a')).toEqual(colorsOf(1));
  });
  it('before odds lock a ticked horse gets the lane lock_odds_begin will give it', () => {
    const p = (id: string, joined_at: string, ticked: boolean) => ({
      id,
      joined_at,
      ticked,
      coat: null,
      silk: null,
    });
    const roster = [
      p('a', '2026-01-01T00:00:03Z', true),
      p('b', '2026-01-01T00:00:01Z', false),
      p('d', '2026-01-01T00:00:02Z', true),
      p('c', '2026-01-01T00:00:02Z', true),
    ];
    // ticked by (joined_at, id): c, d, a
    expect(horseColors(roster, [], 'c')).toEqual(colorsOf(0));
    expect(horseColors(roster, [], 'd')).toEqual(colorsOf(1));
    expect(horseColors(roster, [], 'a')).toEqual(colorsOf(2));
    // not ticked: roster position (1)
    expect(horseColors(roster, [], 'b')).toEqual(colorsOf(1));
    // once the race exists its lane wins
    expect(horseColors(roster, ['a', 'c', 'd'], 'a')).toEqual(colorsOf(0));
  });
});
