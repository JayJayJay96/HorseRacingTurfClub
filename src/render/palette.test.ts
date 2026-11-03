import { describe, expect, it } from 'vitest';
import { MAX_HORSES } from '../sim/config.ts';
import {
  COAT_COLORS,
  SILK_COLORS,
  colorsByPlayer,
  colorsFor,
  colorsOf,
  contrastOf,
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
});

describe('contrastOf', () => {
  it('is dark on light silks and white on dark ones', () => {
    expect(contrastOf('#ffffff')).toBe('#1a1a1a');
    expect(contrastOf('#fdd835')).toBe('#1a1a1a');
    expect(contrastOf('#3949ab')).toBe('#ffffff');
    expect(contrastOf('#e53935')).toBe('#ffffff');
  });
});
