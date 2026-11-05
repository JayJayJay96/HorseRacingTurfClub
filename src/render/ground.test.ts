import { describe, expect, it } from 'vitest';
import { GROUND, groundPatches, hasTerrain, hurdleLines } from './ground.ts';
import { TRACKS } from './track.ts';

describe('ground', () => {
  it('plain tracks draw only the ribbon', () => {
    expect(hasTerrain(TRACKS.oval)).toBe(false);
    expect(hasTerrain(TRACKS.summit)).toBe(true);
  });

  it('covers the whole lap; hills get lighter bands, painted low to high', () => {
    const patches = groundPatches(TRACKS.summit, 20);
    expect(patches.reduce((n, p) => n + p.quads.length, 0)).toBe(TRACKS.summit.lap / 4);
    expect(patches.length).toBeGreaterThan(3);
  });

  it('sand and ice get their colours; hurdles span the lanes', () => {
    expect(groundPatches(TRACKS.seaside, 20).some((p) => p.color === GROUND.sand)).toBe(true);
    expect(groundPatches(TRACKS.ice, 20).every((p) => p.color === GROUND.ice)).toBe(true);
    expect(hurdleLines(TRACKS.steeple, 20)).toHaveLength(6);
  });
});
