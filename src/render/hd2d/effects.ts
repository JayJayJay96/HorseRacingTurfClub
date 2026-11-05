import { EFFECTS } from '../../sim/config.ts';
import type { HorseId, ItemCode, RaceEvent } from '../../sim/types.ts';
import { ITEM_HOLD_SECONDS } from '../Pixel2DRenderer.ts';

export type EffectKind =
  | 'speed'
  | 'hit'
  | 'shield'
  | 'reflect'
  | 'dud'
  | 'box'
  | 'stampede'
  | 'thunder'
  | 'lasso'
  | 'swarm'
  | 'splash'
  | 'bonk';

/** The four special-item animations (spec 2026-11-05); the 2D view draws these too. */
export const SPECIAL_KINDS: ReadonlySet<EffectKind> = new Set([
  'stampede',
  'thunder',
  'lasso',
  'swarm',
]);

/** Full durations; a blocked or reflected special attack plays only MISS_SECONDS of it. */
export const EFFECT_SECONDS: Readonly<Record<EffectKind, number>> = {
  speed: 1.2,
  hit: 0.8,
  shield: 1,
  reflect: 0.6,
  dud: 1.5,
  box: 0.5,
  stampede: EFFECTS['speed:pass3'].seconds,
  thunder: EFFECTS['attack:all'].seconds,
  lasso: EFFECTS['attack:leader'].seconds + 0.4,
  swarm: EFFECTS['attack:top3'].seconds,
  splash: 0.9,
  bonk: 0.7,
};
const MISS_SECONDS = { thunder: 0.5, lasso: 0.5, swarm: 0.6 } as const;
/** The lasso rope and the swarm fly in for this long before they wrap the horse. */
export const INCOMING_SECONDS = 0.4;

const SPECIAL_ATTACK: Partial<Record<ItemCode, keyof typeof MISS_SECONDS>> = {
  'attack:all': 'thunder',
  'attack:leader': 'lasso',
  'attack:top3': 'swarm',
};

export interface Effect {
  readonly kind: EffectKind;
  readonly horse: HorseId;
  /** Race time it starts. */
  readonly t0: number;
  /** Overrides EFFECT_SECONDS[kind] (a special attack that was blocked). */
  readonly seconds?: number;
}

export const durationOf = (e: Effect) => e.seconds ?? EFFECT_SECONDS[e.kind];

/** Built once per race. A box opens when it is grabbed on screen (ITEM_HOLD_SECONDS early). */
export function effectsOf(events: readonly RaceEvent[]): Effect[] {
  const out: Effect[] = [];
  for (const e of events) {
    if (e.type === 'pickup') {
      out.push({ kind: 'box', horse: e.horse, t0: e.t - ITEM_HOLD_SECONDS });
      if (e.item?.startsWith('speed:')) out.push({ kind: 'speed', horse: e.horse, t0: e.t });
      if (e.item === 'speed:pass3') out.push({ kind: 'stampede', horse: e.horse, t0: e.t });
      if (e.item?.startsWith('dud:')) out.push({ kind: 'dud', horse: e.horse, t0: e.t });
      continue;
    }
    if (e.type === 'finish') continue;
    if (e.type === 'slip') {
      out.push({ kind: 'splash', horse: e.horse, t0: e.t });
      continue;
    }
    if (e.type === 'bump') {
      out.push({ kind: 'bonk', horse: e.horse, t0: e.t }, { kind: 'bonk', horse: e.with, t0: e.t });
      continue;
    }
    const special = SPECIAL_ATTACK[e.item];
    if (special) {
      const miss = e.type === 'hit' ? {} : { seconds: MISS_SECONDS[special] };
      out.push({ kind: special, horse: e.horse, t0: e.t, ...miss });
    }
    if (e.type === 'hit') out.push({ kind: 'hit', horse: e.horse, t0: e.t });
    else if (e.type === 'blocked') out.push({ kind: 'shield', horse: e.horse, t0: e.t });
    else out.push({ kind: 'reflect', horse: e.horse, t0: e.t });
  }
  return out;
}

export function activeAt(effects: readonly Effect[], t: number) {
  return effects
    .map((effect) => ({ effect, age: t - effect.t0 }))
    .filter(({ effect, age }) => age >= 0 && age < durationOf(effect));
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
/** Special effects are drawn bigger and denser so they read from the follow camera. */
export const SPECIAL_PARTICLES = 24;
export const countOf = (kind: EffectKind) =>
  SPECIAL_KINDS.has(kind) ? SPECIAL_PARTICLES : PARTICLES;
/** Radius of the lasso loop round the horse, metres. */
export const LASSO_R = 2.4;

/** Deterministic 0..1 noise per particle index. */
const hash = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** `seconds` is the effect's own duration (durationOf), for the fade-out of a cut-short effect. */
export function particlesOf(
  kind: EffectKind,
  age: number,
  seconds = EFFECT_SECONDS[kind],
): Particle[] {
  const u = Math.min(1, Math.max(0, age / seconds));
  const fade = 1 - u;
  // Special effects hold full strength and fade over their last 0.3 s.
  const tail = Math.min(1, Math.max(0, (seconds - age) / 0.3));
  const n = countOf(kind);
  return Array.from({ length: n }, (_, i): Particle => {
    const h1 = hash(i, 1);
    const h2 = hash(i, 2);
    const ang = (i / n) * 2 * Math.PI;
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
      case 'splash': // water thrown up and out from the hooves
        return {
          ahead: Math.cos(ang) * (0.3 + u * 1.4),
          up: 0.1 + Math.sin(u * Math.PI) * (0.6 + h1 * 0.8),
          side: Math.sin(ang) * (0.3 + u * 1.4),
          color: i % 3 ? '#b3e5fc' : '#ffffff',
          alpha: fade,
        };
      case 'bonk': // a small yellow star beside the head
        return {
          ahead: Math.cos(ang) * (0.2 + u * 0.6),
          up: 1.8 + Math.sin(ang) * (0.2 + u * 0.6),
          side: 0.6,
          color: i % 2 ? '#fff176' : '#ffffff',
          alpha: fade,
        };
      case 'stampede': {
        // A dust storm rolling back from the hooves for the whole boost.
        const back = (h1 * 9 + age * 7) % 9;
        return {
          ahead: -(1 + back),
          up: 0.2 + h2 * 0.9 + back * 0.08,
          side: (hash(i, 3) - 0.5) * (1 + back * 0.25),
          color: i % 3 ? '#d7b98e' : '#fff3c4',
          alpha: tail * (1 - back / 9) * 0.8,
        };
      }
      case 'thunder': {
        // A bolt drops from the sky in 0.15 s, zigzagging, then sparks scatter off the horse.
        const strike = 0.15;
        if (age < strike + 0.25) {
          const up = 16 - (i / (n - 1)) * 15;
          const reached = up >= 16 - (age / strike) * 16;
          return {
            ahead: (i % 2 ? 0.5 : -0.5) * (0.5 + h1),
            up,
            side: 0,
            color: i % 3 ? '#fff9c4' : '#ffffff',
            alpha: reached ? tail : 0,
          };
        }
        const s = Math.min(1, (age - strike) / 0.8);
        return {
          ahead: Math.cos(ang) * s * 1.6,
          up: 1.6 + Math.sin(ang) * s * 1.6,
          side: (h1 - 0.5) * 0.6,
          color: i % 2 ? '#fff176' : '#ffffff',
          alpha: tail * (1 - s * 0.6),
        };
      }
      case 'lasso': {
        if (age < INCOMING_SECONDS) {
          // The rope flies in from behind: the leading part of an arc onto the horse's head.
          const s = age / INCOMING_SECONDS;
          const along = (i / (n - 1)) * s;
          return {
            ahead: -12 + along * 12,
            up: 2.4 + Math.sin(along * Math.PI) * 3,
            side: 0,
            color: i % 2 ? '#ffd54f' : '#ffb300',
            alpha: tail,
          };
        }
        // The loop spins round the horse while it is held.
        const spin = ang + age * 6;
        return {
          ahead: Math.cos(spin) * LASSO_R,
          up: 1.6 + Math.sin(2 * spin) * 0.15,
          side: Math.sin(spin) * LASSO_R,
          color: i % 2 ? '#ffd54f' : '#ffb300',
          alpha: tail,
        };
      }
      case 'swarm': {
        // Hornets fly in from behind, then buzz round the head.
        const s = Math.min(1, age / INCOMING_SECONDS);
        const spin = ang * 1.3 + age * (9 + h1 * 4);
        const r = 0.8 + h2 * 0.8;
        return {
          ahead: (1 - s) * -(8 + h1 * 4) + Math.cos(spin) * r * s,
          up: 2.3 + Math.sin(age * 20 + i) * 0.25 + (1 - s) * h2 * 2,
          side: Math.sin(spin) * r * s + (1 - s) * (h2 - 0.5) * 2,
          color: i % 3 ? '#ffeb3b' : '#ff9800',
          alpha: tail,
        };
      }
    }
  });
}
