import type { HorseId, RaceEvent } from '../../sim/types.ts';
import { ITEM_HOLD_SECONDS } from '../Pixel2DRenderer.ts';

export type EffectKind = 'speed' | 'hit' | 'shield' | 'reflect' | 'dud' | 'box';

export const EFFECT_SECONDS: Readonly<Record<EffectKind, number>> = {
  speed: 1.2,
  hit: 0.8,
  shield: 1,
  reflect: 0.6,
  dud: 1.5,
  box: 0.5,
};

export interface Effect {
  readonly kind: EffectKind;
  readonly horse: HorseId;
  /** Race time it starts. */
  readonly t0: number;
}

/** Built once per race. A box opens when it is grabbed on screen (ITEM_HOLD_SECONDS early). */
export function effectsOf(events: readonly RaceEvent[]): Effect[] {
  const out: Effect[] = [];
  for (const e of events) {
    if (e.type === 'pickup') {
      out.push({ kind: 'box', horse: e.horse, t0: e.t - ITEM_HOLD_SECONDS });
      if (e.item?.startsWith('speed:')) out.push({ kind: 'speed', horse: e.horse, t0: e.t });
      if (e.item?.startsWith('dud:')) out.push({ kind: 'dud', horse: e.horse, t0: e.t });
    } else if (e.type === 'hit') out.push({ kind: 'hit', horse: e.horse, t0: e.t });
    else if (e.type === 'blocked') out.push({ kind: 'shield', horse: e.horse, t0: e.t });
    else if (e.type === 'reflected') out.push({ kind: 'reflect', horse: e.horse, t0: e.t });
  }
  return out;
}

export function activeAt(effects: readonly Effect[], t: number) {
  return effects
    .map((effect) => ({ effect, age: t - effect.t0 }))
    .filter(({ effect, age }) => age >= 0 && age < EFFECT_SECONDS[effect.kind]);
}

/**
 * Horse-local metres: `ahead` along the running direction, `up`, `side` to the horse's left.
 * `color` is a CSS hex; the renderer multiplies it by `alpha` (additive blending fades it out).
 */
export interface Particle {
  readonly ahead: number;
  readonly up: number;
  readonly side: number;
  readonly color: string;
  readonly alpha: number;
}

export const PARTICLES = 12;

/** Deterministic 0..1 noise per particle index. */
const hash = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function particlesOf(kind: EffectKind, age: number): Particle[] {
  const u = Math.min(1, Math.max(0, age / EFFECT_SECONDS[kind]));
  const fade = 1 - u;
  return Array.from({ length: PARTICLES }, (_, i): Particle => {
    const h1 = hash(i, 1);
    const h2 = hash(i, 2);
    const ang = (i / PARTICLES) * 2 * Math.PI;
    switch (kind) {
      case 'speed': // streaks and dust flying back
        return {
          ahead: -(0.3 + (i % 4) * 0.4 + u * 2.5),
          up: 0.3 + h1 * 1.8,
          side: (h2 - 0.5) * 0.8,
          color: i % 3 ? '#ffd54f' : '#ffffff',
          alpha: fade,
        };
      case 'hit': // flash and stars bursting from the head
        return {
          ahead: Math.cos(ang) * u * 1.5,
          up: 1.8 + Math.sin(ang) * u * 1.5,
          side: (h1 - 0.5) * 0.4,
          color: i % 2 ? '#ffffff' : '#fff176',
          alpha: fade,
        };
      case 'shield': // a turning bubble
        return {
          ahead: Math.cos(ang + u * 3) * 1.4,
          up: 1.2 + Math.sin(ang + u * 3) * 1.4,
          side: Math.sin(2 * ang) * 0.3,
          color: '#81d4fa',
          alpha: fade * 0.8,
        };
      case 'reflect': // sparks shooting up
        return {
          ahead: (h1 - 0.5) * 1,
          up: 1.5 + u * 2 * (0.5 + h2),
          side: (hash(i, 3) - 0.5) * 1,
          color: '#e1f5fe',
          alpha: fade,
        };
      case 'dud': // dizzy swirl over the head, fading over its last fifth
        return {
          ahead: Math.cos(ang + u * 6) * 0.5,
          up: 2.6 + (i % 3) * 0.15,
          side: Math.sin(ang + u * 6) * 0.5,
          color: i % 2 ? '#ce93d8' : '#fff59d',
          alpha: u < 0.8 ? 1 : (1 - u) / 0.2,
        };
      case 'box': // a puff where the box was
        return {
          ahead: Math.cos(ang) * (0.3 + u * 1.2),
          up: 0.4 + u * 0.8,
          side: Math.sin(ang) * (0.3 + u * 1.2),
          color: '#ffffff',
          alpha: fade,
        };
    }
  });
}
