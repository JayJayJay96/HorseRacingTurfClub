import { describe, expect, it } from 'vitest';
import { FOV_DEG, PIXEL_M, PIXEL_SCALE, REFERENCE_HEIGHT, distanceForScale } from './look.ts';

describe('look', () => {
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
