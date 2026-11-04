import { SILK_COLORS } from '../palette.ts';

export const MOTES = 120;
export const CONFETTI = 160;
export const CONFETTI_SECONDS = 4;

const hash = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** A floating mote around the camera target (offsets in metres, y up from the ground). */
export function moteAt(t: number, kind: 'dust' | 'fireflies', i: number) {
  const x = (hash(i, 1) - 0.5) * 60 + Math.sin(t * 0.3 + i) * 1.5;
  const y = 1 + hash(i, 2) * 12 + Math.sin(t * 0.5 + i * 2) * 0.5;
  const z = (hash(i, 3) - 0.5) * 60 + Math.cos(t * 0.27 + i) * 1.5;
  const alpha = kind === 'fireflies' ? (Math.sin(t * 3 + i * 1.7) + 1) / 2 : 0.5;
  return { x, y, z, alpha };
}

/**
 * Confetti offsets from the top of the finish post, `age` seconds after the first finish.
 * `y` never drops below the start height (it lands on an invisible shelf, then fades).
 */
export function confettiAt(age: number, i: number) {
  const vx = (hash(i, 4) - 0.5) * 6;
  const vy = 6 + hash(i, 5) * 6;
  const vz = (hash(i, 6) - 0.5) * 6;
  const g = 4;
  const y = Math.max(0, vy * age - 0.5 * g * age * age);
  const alpha = age >= CONFETTI_SECONDS ? 0 : age < 3 ? 1 : 1 - (age - 3) / (CONFETTI_SECONDS - 3);
  return { x: vx * age, y, z: vz * age, alpha, color: SILK_COLORS[i % SILK_COLORS.length]! };
}
