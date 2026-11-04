import { describe, expect, it } from 'vitest';
import { TRACKS, trackBounds } from '../track.ts';
import { SCENERY_MARGIN, placeScenery, standsRect } from './scenery.ts';

describe('placeScenery', () => {
  for (const track of Object.values(TRACKS)) {
    it(`${track.id}: deterministic, off the track and out of the stands`, () => {
      const lanes = 12;
      const a = placeScenery(track, lanes, 42);
      expect(placeScenery(track, lanes, 42)).toEqual(a);
      expect(placeScenery(track, lanes, 43)).not.toEqual(a);
      expect(a.length).toBe(90);
      const { halfWidth, halfHeight } = trackBounds(track, lanes);
      const s = standsRect(track, lanes);
      for (const item of a) {
        const offTrack =
          Math.abs(item.x) > halfWidth + SCENERY_MARGIN ||
          Math.abs(item.y) > halfHeight + SCENERY_MARGIN;
        expect(offTrack).toBe(true);
        const inStands = item.x > s.x0 && item.x < s.x1 && item.y > s.y0 && item.y < s.y1;
        expect(inStands).toBe(false);
        expect(['tree', 'bush', 'flag']).toContain(item.kind);
      }
    });
  }
});
