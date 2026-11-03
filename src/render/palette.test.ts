import { describe, expect, it } from 'vitest';
import { MAX_HORSES } from '../sim/config.ts';
import { COAT_COLORS, SILK_COLORS, colorsFor, colorsOf } from './palette.ts';

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
