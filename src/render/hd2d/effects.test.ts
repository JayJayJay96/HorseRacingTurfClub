import { describe, expect, it } from 'vitest';
import type { RaceEvent } from '../../sim/types.ts';
import { ITEM_HOLD_SECONDS } from '../Pixel2DRenderer.ts';
import { EFFECT_SECONDS, PARTICLES, activeAt, effectsOf, particlesOf } from './effects.ts';

const events: RaceEvent[] = [
  { t: 10, type: 'pickup', horse: 'a', kind: 'speed', item: 'speed:self1' },
  { t: 12, type: 'pickup', horse: 'b', kind: 'mystery', item: 'dud:slow' },
  { t: 13, type: 'pickup', horse: 'c', kind: 'attack', item: null },
  { t: 14, type: 'hit', horse: 'd', by: 'a', item: 'attack:behind1' },
  { t: 15, type: 'blocked', horse: 'e', by: 'a', item: 'attack:front1', reason: 'immune' },
  { t: 16, type: 'reflected', horse: 'f', by: 'a', item: 'attack:front1' },
  { t: 20, type: 'finish', horse: 'a', place: 1 },
];

describe('effects', () => {
  it('maps events to effect kinds; every pickup opens its box when it is grabbed', () => {
    const fx = effectsOf(events);
    expect(fx.map((f) => `${f.kind}:${f.horse}`)).toEqual([
      'box:a',
      'speed:a',
      'box:b',
      'dud:b',
      'box:c',
      'hit:d',
      'shield:e',
      'reflect:f',
    ]);
    expect(fx[0]!.t0).toBeCloseTo(10 - ITEM_HOLD_SECONDS);
    expect(fx[1]!.t0).toBe(10);
  });

  it('is active only within its duration', () => {
    const fx = effectsOf(events);
    expect(
      activeAt(fx, 10 - ITEM_HOLD_SECONDS + EFFECT_SECONDS.box / 2).map((a) => a.effect.kind),
    ).toEqual(['box']);
    const late = activeAt(fx, 10 + EFFECT_SECONDS.speed + 0.01);
    expect(late.some((a) => a.effect.kind === 'speed')).toBe(false);
    expect(activeAt(fx, 100)).toEqual([]);
  });

  it('particles are a pure function of kind and age', () => {
    for (const kind of Object.keys(EFFECT_SECONDS) as (keyof typeof EFFECT_SECONDS)[]) {
      const a = particlesOf(kind, 0.3);
      expect(a).toHaveLength(PARTICLES);
      expect(particlesOf(kind, 0.3)).toEqual(a);
      for (const p of a) {
        expect(p.alpha).toBeGreaterThanOrEqual(0);
        expect(p.alpha).toBeLessThanOrEqual(1);
      }
      const end = particlesOf(kind, EFFECT_SECONDS[kind] * 0.999);
      expect(Math.max(...end.map((p) => p.alpha))).toBeLessThan(0.05);
    }
  });
});
