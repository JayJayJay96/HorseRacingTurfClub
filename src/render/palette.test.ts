import { describe, expect, it } from 'vitest';
import { MAX_HORSES } from '../sim/config.ts';
import { colorsOf } from './palette.ts';

describe('colorsOf', () => {
  it('gives every lane of a full field its own coat + silk', () => {
    const pairs = Array.from({ length: MAX_HORSES }, (_, lane) => {
      const c = colorsOf(lane);
      return `${c.coat}/${c.silk}`;
    });
    expect(new Set(pairs).size).toBe(MAX_HORSES);
  });
});
