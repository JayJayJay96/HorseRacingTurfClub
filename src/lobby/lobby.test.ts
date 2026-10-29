import { describe, expect, it } from 'vitest';
import { canOpenShop, joinUrl, normalizeCode } from './lobby.ts';

describe('normalizeCode', () => {
  it('upper-cases and trims valid codes', () => {
    expect(normalizeCode(' ab2c ')).toBe('AB2C');
  });
  it('rejects wrong length and look-alike characters', () => {
    expect(normalizeCode('ABC')).toBeNull();
    expect(normalizeCode('ABCDE')).toBeNull();
    expect(normalizeCode('AB0C')).toBeNull(); // 0, 1, I, L, O are never used
    expect(normalizeCode('ABIC')).toBeNull();
  });
});

describe('joinUrl', () => {
  it('points phones at /play with the code', () => {
    expect(joinUrl('https://turf.example', 'AB2C')).toBe('https://turf.example/play?code=AB2C');
  });
});

describe('canOpenShop', () => {
  it('needs at least 2 ticked horses', () => {
    expect(canOpenShop([{ ticked: true }, { ticked: false }])).toBe(false);
    expect(canOpenShop([{ ticked: true }, { ticked: true }])).toBe(true);
  });
});
