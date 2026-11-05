import { describe, expect, it } from 'vitest';
import type { RaceEvent } from '../../sim/types.ts';
import { ITEM_HOLD_SECONDS } from '../Pixel2DRenderer.ts';
import {
  EFFECT_SECONDS,
  INCOMING_SECONDS,
  LASSO_R,
  countOf,
  SPECIAL_KINDS,
  activeAt,
  durationOf,
  effectsOf,
  particlesOf,
} from './effects.ts';

const events: RaceEvent[] = [
  { t: 10, type: 'pickup', horse: 'a', kind: 'speed', item: 'speed:self1' },
  { t: 12, type: 'pickup', horse: 'b', kind: 'mystery', item: 'dud:slow' },
  { t: 13, type: 'pickup', horse: 'c', kind: 'attack', item: null },
  { t: 14, type: 'hit', horse: 'd', by: 'a', item: 'attack:behind1' },
  { t: 15, type: 'blocked', horse: 'e', by: 'a', item: 'attack:front1', reason: 'immune' },
  { t: 16, type: 'reflected', horse: 'f', by: 'a', item: 'attack:front1' },
  { t: 20, type: 'finish', horse: 'a', place: 1 },
];

describe('special effects', () => {
  const special: RaceEvent[] = [
    { t: 5, type: 'pickup', horse: 'a', kind: 'mystery', item: 'speed:pass3' },
    { t: 6, type: 'hit', horse: 'b', by: 'c', item: 'attack:leader' },
    { t: 7, type: 'blocked', horse: 'b', by: 'c', item: 'attack:top3', reason: 'shield' },
    { t: 8, type: 'reflected', horse: 'd', by: 'c', item: 'attack:all' },
    { t: 8, type: 'hit', horse: 'c', by: 'd', item: 'attack:all' },
  ];

  it('adds stampede, lasso, swarm and thunder; a blocked one only plays its incoming part', () => {
    const fx = effectsOf(special).filter((f) => SPECIAL_KINDS.has(f.kind));
    expect(fx.map((f) => `${f.kind}:${f.horse}:${durationOf(f)}`)).toEqual([
      `stampede:a:${EFFECT_SECONDS.stampede}`,
      `lasso:b:${EFFECT_SECONDS.lasso}`,
      'swarm:b:0.6',
      'thunder:d:0.5',
      `thunder:c:${EFFECT_SECONDS.thunder}`,
    ]);
    // The existing shield / mirror / hit effects still follow.
    expect(
      effectsOf(special)
        .filter((f) => !SPECIAL_KINDS.has(f.kind))
        .map((f) => f.kind),
    ).toEqual(['box', 'speed', 'hit', 'shield', 'reflect', 'hit']);
  });

  it('a cut-short effect fades out by its own end', () => {
    const end = particlesOf('swarm', 0.599, 0.6);
    expect(Math.max(...end.map((p) => p.alpha))).toBeLessThan(0.05);
    expect(activeAt(effectsOf(special), 7.7).some((a) => a.effect.kind === 'swarm')).toBe(false);
  });

  it('lasso flies in from behind, then circles the horse', () => {
    const incoming = particlesOf('lasso', INCOMING_SECONDS / 2);
    expect(Math.min(...incoming.map((p) => p.ahead))).toBeLessThan(-5);
    const loop = particlesOf('lasso', 1);
    for (const p of loop) expect(Math.hypot(p.ahead, p.side)).toBeCloseTo(LASSO_R);
  });

  it('thunder strikes from high above', () => {
    const bolt = particlesOf('thunder', 0.2);
    expect(Math.max(...bolt.map((p) => p.up))).toBeGreaterThan(10);
    for (const p of [...bolt, ...particlesOf('stampede', 3), ...particlesOf('swarm', 2)]) {
      expect(Number.isFinite(p.ahead + p.up + p.side)).toBe(true);
    }
  });
});

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
      expect(a).toHaveLength(countOf(kind));
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

describe('weather effects', () => {
  it('splashes the slipper and bonks both bumped horses', () => {
    const fx = effectsOf([
      { t: 2, type: 'slip', horse: 'a' },
      { t: 3, type: 'bump', horse: 'a', with: 'b' },
    ]);
    expect(fx).toEqual([
      { kind: 'splash', horse: 'a', t0: 2 },
      { kind: 'bonk', horse: 'a', t0: 3 },
      { kind: 'bonk', horse: 'b', t0: 3 },
    ]);
  });

  it('weather particles are finite', () => {
    for (const kind of ['splash', 'bonk'] as const) {
      for (const age of [0, 0.2, 0.5, 0.9]) {
        for (const p of particlesOf(kind, age)) {
          expect(Number.isFinite(p.ahead + p.up + p.side + p.alpha)).toBe(true);
        }
      }
    }
  });
});

describe('Extended hot items on screen', () => {
  const events: RaceEvent[] = [
    { t: 5, type: 'pickup', horse: 'a', kind: 'mystery', item: 'speed:pass3', hot: 'extended' },
    { t: 6, type: 'hit', horse: 'b', by: 'c', item: 'attack:leader' },
    { t: 7, type: 'blocked', horse: 'b', by: 'c', item: 'attack:leader', reason: 'shield' },
    { t: 8, type: 'hit', horse: 'd', by: 'c', item: 'attack:top3' },
  ];
  const hot = [
    { item: 'speed:pass3', buff: 'extended' },
    { item: 'attack:leader', buff: 'extended' },
  ] as const;

  it('special effects last as long as the Extended item does in the sim', () => {
    const fx = effectsOf(events, hot).filter((f) => SPECIAL_KINDS.has(f.kind));
    expect(fx.map((f) => `${f.kind}:${durationOf(f)}`)).toEqual([
      `stampede:${EFFECT_SECONDS.stampede + 4}`, // 8 s -> 12 s
      `lasso:${EFFECT_SECONDS.lasso + 1}`, // 2 s -> 3 s
      'lasso:0.5', // a blocked one still plays only its miss
      `swarm:${EFFECT_SECONDS.swarm}`, // not hot
    ]);
  });

  it('without hot items nothing changes', () => {
    expect(effectsOf(events)).toEqual(effectsOf(events, []));
    expect(durationOf(effectsOf(events).find((f) => f.kind === 'stampede')!)).toBe(
      EFFECT_SECONDS.stampede,
    );
  });
});
