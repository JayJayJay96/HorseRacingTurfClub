import { describe, expect, it } from 'vitest';
import { noteToFrequency, STEPS_PER_LOOP, THEMES } from './chiptune.ts';

describe('chiptune', () => {
  it('A4 is 440 Hz', () => {
    expect(noteToFrequency('A4')).toBeCloseTo(440);
    expect(noteToFrequency('A5')).toBeCloseTo(880);
  });

  it.each(Object.entries(THEMES))('%s has 64 steps per track and valid notes', (_name, t) => {
    for (const track of [t.lead, t.bass, t.drums]) expect(track).toHaveLength(STEPS_PER_LOOP);
    for (const n of [...t.lead, ...t.bass])
      if (n) expect(Number.isFinite(noteToFrequency(n))).toBe(true);
  });
});
