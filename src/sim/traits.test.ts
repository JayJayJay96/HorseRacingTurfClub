import { describe, expect, it } from 'vitest';
import { KICK, TRAITS } from './config.ts';
import { earlyPaceOf, kickBoostOf, kickExtraSecondsOf, toughen } from './traits.ts';

describe('toughen', () => {
  it('weakens slowdowns and boosts by the Tough factors', () => {
    expect(toughen(0)).toBeCloseTo(1 - TRAITS.tough.hitFactor); // Golden Lasso 0 -> 0.3
    expect(toughen(0.5)).toBeCloseTo(1 - 0.5 * TRAITS.tough.hitFactor); // a rain slip
    expect(toughen(0.7)).toBeCloseTo(1 - 0.3 * TRAITS.tough.hitFactor); // a fog bump
    expect(toughen(1.2)).toBeCloseTo(1 + 0.2 * TRAITS.tough.boostFactor); // Carrot
    expect(toughen(1.8)).toBeCloseTo(1 + 0.8 * TRAITS.tough.boostFactor); // Stampede
    expect(toughen(1)).toBe(1);
  });
});

describe('pace and kick by trait', () => {
  it('Normal (and the traits that do not touch pace) are exactly the old numbers', () => {
    for (const t of ['normal', 'charmed', 'tough', 'mudder'] as const) {
      expect(earlyPaceOf(t)).toBe(1);
      expect(kickBoostOf(t)).toBe(KICK.boost);
      expect(kickExtraSecondsOf(t)).toBe(0);
    }
  });

  it('Sprinter starts fast and kicks less; Stayer the opposite, with a longer kick', () => {
    expect(earlyPaceOf('sprinter')).toBe(TRAITS.sprinter.earlyPace);
    expect(kickBoostOf('sprinter')).toBe(TRAITS.sprinter.kickBoost);
    expect(kickExtraSecondsOf('sprinter')).toBe(0);
    expect(earlyPaceOf('stayer')).toBe(TRAITS.stayer.earlyPace);
    expect(kickBoostOf('stayer')).toBe(TRAITS.stayer.kickBoost);
    expect(kickExtraSecondsOf('stayer')).toBe(TRAITS.stayer.kickExtraSeconds);
  });
});

describe('toughen at the real item strengths', () => {
  it('keeps slowdowns and boosts proportional', () => {
    expect(toughen(0.5)).toBeGreaterThan(0.5);
    expect(toughen(0.5)).toBeLessThan(1);
    expect(toughen(1.8)).toBeCloseTo(1 + 0.8 * TRAITS.tough.boostFactor); // Stampede
    expect(toughen(1.8)).toBeLessThan(1.8);
    expect(toughen(1.8)).toBeGreaterThan(1);
  });
});

describe('kickBoostOf', () => {
  it('Normal keeps KICK.boost; Sprinter kicks less and Stayer more', () => {
    expect(kickBoostOf('normal')).toBe(KICK.boost);
    expect(kickBoostOf('sprinter')).toBeLessThan(KICK.boost);
    expect(kickBoostOf('stayer')).toBeGreaterThan(KICK.boost);
  });
});
