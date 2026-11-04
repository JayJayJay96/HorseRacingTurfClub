import { describe, expect, it } from 'vitest';
import { CONFETTI, CONFETTI_SECONDS, MOTES, confettiAt, moteAt } from './ambient.ts';

describe('ambient', () => {
  it('motes are deterministic and fireflies pulse', () => {
    expect(moteAt(5, 'dust', 3)).toEqual(moteAt(5, 'dust', 3));
    const alphas = Array.from({ length: 20 }, (_, i) => moteAt(i * 0.1, 'fireflies', 1).alpha);
    expect(Math.max(...alphas) - Math.min(...alphas)).toBeGreaterThan(0.3);
    expect(MOTES).toBeGreaterThan(0);
  });

  it('confetti stays above its start height and fades out', () => {
    for (let i = 0; i < CONFETTI; i++) {
      for (const age of [0, 0.5, 1, 2, 3, 3.9]) {
        expect(confettiAt(age, i).y).toBeGreaterThanOrEqual(0);
      }
    }
    expect(confettiAt(CONFETTI_SECONDS, 0).alpha).toBe(0);
    expect(confettiAt(0.2, 0).alpha).toBe(1);
  });
});
