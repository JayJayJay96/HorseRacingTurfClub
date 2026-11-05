import { describe, expect, it } from 'vitest';
import { EFFECTS, HOT } from './config.ts';
import { buffOf, effectSeconds, HOT_ELIGIBLE } from './hot.ts';
import type { HotItem } from './types.ts';

const HOT_LIST: readonly HotItem[] = [
  { item: 'attack:leader', buff: 'extended' },
  { item: 'speed:self1', buff: 'lucky' },
  { item: 'speed:self3', buff: 'extended' },
];

describe('hot items', () => {
  it('lists the 14 non-dud items', () => {
    expect(HOT_ELIGIBLE).toHaveLength(14);
    expect(HOT_ELIGIBLE.some((i) => i.startsWith('dud:'))).toBe(false);
    expect(HOT_ELIGIBLE).toContain('speed:pass3');
    expect(HOT_ELIGIBLE).toContain('attack:all');
    expect(HOT_ELIGIBLE).toContain('defense:reflect');
  });

  it('Extended items last 1.5x; Lucky and cold items keep their seconds', () => {
    expect(effectSeconds('attack:leader', HOT_LIST)).toBe(
      EFFECTS['attack:leader'].seconds * HOT.extendedFactor,
    );
    expect(effectSeconds('attack:leader', HOT_LIST)).toBe(3);
    expect(effectSeconds('speed:self3', HOT_LIST)).toBe(2.25); // each Golden Carrot burst
    expect(effectSeconds('speed:self1', HOT_LIST)).toBe(2);
    expect(effectSeconds('speed:star', HOT_LIST)).toBe(3.5);
    expect(effectSeconds('speed:star')).toBe(3.5);
  });

  it('buffOf finds the buff of a hot item only', () => {
    expect(buffOf(HOT_LIST, 'speed:self1')).toBe('lucky');
    expect(buffOf(HOT_LIST, 'attack:leader')).toBe('extended');
    expect(buffOf(HOT_LIST, 'speed:star')).toBeUndefined();
    expect(buffOf(HOT_LIST, null)).toBeUndefined();
  });
});
