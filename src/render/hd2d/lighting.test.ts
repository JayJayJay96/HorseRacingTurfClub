import { describe, expect, it } from 'vitest';
import { PRESETS, presetById, presetOf } from './lighting.ts';

describe('lighting', () => {
  it('picks the preset from seed % 3', () => {
    expect(presetOf(0).id).toBe('afternoon');
    expect(presetOf(1).id).toBe('sunset');
    expect(presetOf(2).id).toBe('night');
    expect(presetOf(3).id).toBe('afternoon');
    expect(presetOf(4_294_967_295).id).toBe('afternoon'); // 4294967295 % 3 === 0
  });

  it('is stable per seed and safe for negative seeds', () => {
    expect(presetOf(12345)).toBe(presetOf(12345));
    expect(presetOf(-1).id).toBe('night');
  });

  it('only night has floodlights and fireflies; only sunset has shafts', () => {
    expect(PRESETS.filter((p) => p.floodlights).map((p) => p.id)).toEqual(['night']);
    expect(presetById('night').motes).toBe('fireflies');
    expect(PRESETS.filter((p) => p.shafts).map((p) => p.id)).toEqual(['sunset']);
  });
});
