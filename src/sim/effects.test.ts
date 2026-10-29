import { describe, expect, it } from 'vitest';
import { resolveHit, type Defenses } from './effects.ts';

const open: Defenses = { immuneUntil: 0, held: null, stampeding: false };

describe('resolveHit', () => {
  it('lands on an unprotected horse', () => {
    expect(resolveHit(open, 50, true)).toBe('hit');
  });

  it('immunity (Bubble, Thunder Hooves) blocks while it lasts', () => {
    expect(resolveHit({ ...open, immuneUntil: 60 }, 59, true)).toBe('immune');
    expect(resolveHit({ ...open, immuneUntil: 60 }, 60, true)).toBe('hit');
  });

  it('a stampeding horse is immune', () => {
    expect(resolveHit({ ...open, stampeding: true }, 50, true)).toBe('immune');
  });

  it('immunity wins over a held Shield, so the Shield is kept', () => {
    expect(resolveHit({ ...open, immuneUntil: 60, held: 'defense:block1' }, 50, true)).toBe('immune');
  });

  it('a held Shield blocks', () => {
    expect(resolveHit({ ...open, held: 'defense:block1' }, 50, true)).toBe('shield');
  });

  it('a held Mirror reflects, but never a reflected attack', () => {
    expect(resolveHit({ ...open, held: 'defense:reflect' }, 50, true)).toBe('reflect');
    expect(resolveHit({ ...open, held: 'defense:reflect' }, 50, false)).toBe('hit');
  });
});
