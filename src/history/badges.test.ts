import { describe, expect, it } from 'vitest';
import { BADGES, formatForm } from './badges.ts';

describe('badges', () => {
  it('labels all 10 badges', () => {
    expect(Object.keys(BADGES)).toHaveLength(10);
    for (const b of Object.values(BADGES)) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.icon.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
    }
  });

  it('formats last-5 form newest first, places 10+ as 0', () => {
    expect(formatForm([1, 3, 2])).toBe('1-3-2');
    expect(formatForm([12, 1])).toBe('0-1');
    expect(formatForm([])).toBe('–');
  });
});
