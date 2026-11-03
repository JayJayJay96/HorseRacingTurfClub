import { describe, expect, it } from 'vitest';
import { poseOf } from './sprites.ts';

describe('poseOf', () => {
  it('uses side views when running mostly sideways', () => {
    expect(poseOf(5, 1)).toBe('side-right');
    expect(poseOf(-5, -1)).toBe('side-left');
  });
  it('uses 3/4 views when running mostly up or down the screen', () => {
    expect(poseOf(1, -5)).toBe('away');
    expect(poseOf(-1, 5)).toBe('toward');
  });
});
