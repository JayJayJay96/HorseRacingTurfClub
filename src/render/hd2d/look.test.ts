import { describe, expect, it } from 'vitest';
import {
  EASE,
  FOV_DEG,
  PIXEL_M,
  PIXEL_SCALE,
  REFERENCE_HEIGHT,
  distanceForScale,
  easeFor,
} from './look.ts';

describe('look', () => {
  it('eases the same per second at any frame rate', () => {
    expect(easeFor(1 / 60)).toBeCloseTo(EASE, 10);
    expect(easeFor(0)).toBe(0);
    expect(easeFor(1 / 10)).toBeGreaterThan(easeFor(1 / 60));
    expect(easeFor(5)).toBe(easeFor(0.25));
  });

  it('fits the chase distance to the pixel target', () => {
    const d = distanceForScale();
    expect(d).toBeGreaterThan(70);
    expect(d).toBeLessThan(90);
    // One sprite pixel at that distance covers PIXEL_SCALE screen pixels at 1080p.
    const screenPx = (PIXEL_M * REFERENCE_HEIGHT) / (2 * d * Math.tan((FOV_DEG * Math.PI) / 360));
    expect(screenPx).toBeCloseTo(PIXEL_SCALE, 6);
  });

  it('gets closer for chunkier pixels', () => {
    expect(distanceForScale(6)).toBeLessThan(distanceForScale(4));
  });
});
