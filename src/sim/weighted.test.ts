import { describe, expect, it } from 'vitest';
import { createScriptedRng } from './rng.ts';
import { pickOne, pickWeighted } from './weighted.ts';

describe('pickWeighted', () => {
  it('maps the drawn integer onto cumulative weights in insertion order', () => {
    // total = 4: 0 -> a, 1..3 -> b
    expect(pickWeighted(createScriptedRng([0]), { a: 1, b: 3 })).toBe('a');
    expect(pickWeighted(createScriptedRng([1]), { a: 1, b: 3 })).toBe('b');
    expect(pickWeighted(createScriptedRng([3]), { a: 1, b: 3 })).toBe('b');
  });

  it('skips zero weights', () => {
    expect(pickWeighted(createScriptedRng([0]), { a: 0, b: 2 })).toBe('b');
  });

  it('throws when no weight is positive', () => {
    expect(() => pickWeighted(createScriptedRng([0]), { a: 0 })).toThrow(RangeError);
  });
});

describe('pickOne', () => {
  it('indexes the list with the drawn integer', () => {
    expect(pickOne(createScriptedRng([2]), ['x', 'y', 'z'])).toBe('z');
  });
});
