import { describe, expect, it } from 'vitest';
import { placeBoxes, shuffle } from './boxes.ts';
import { BOX_ZONE, MYSTERY_PER_LANE } from './config.ts';
import { createSeededRng } from './rng.ts';

const horses = ['a', 'b', 'c'];
const bought = { a: ['speed', 'attack', 'defense'] as const, b: ['attack'] as const };

describe('placeBoxes', () => {
  it('gives every lane 5 mystery boxes plus its bought boxes, in order, inside the box zone', () => {
    const lanes = placeBoxes(createSeededRng(1), horses, bought, 1800);
    expect(lanes.a).toHaveLength(MYSTERY_PER_LANE + 3);
    expect(lanes.b).toHaveLength(MYSTERY_PER_LANE + 1);
    expect(lanes.c).toHaveLength(MYSTERY_PER_LANE);
    expect(
      lanes
        .a!.filter((s) => s.kind !== 'mystery')
        .map((s) => s.kind)
        .sort(),
    ).toEqual(['attack', 'defense', 'speed']);
    for (const lane of Object.values(lanes)) {
      const spots = lane.map((s) => s.at);
      expect(spots).toEqual([...spots].sort((x, y) => x - y));
      expect(Math.min(...spots)).toBeGreaterThanOrEqual(1800 * BOX_ZONE.start);
      expect(Math.max(...spots)).toBeLessThanOrEqual(1800 * BOX_ZONE.end);
    }
  });

  it('is deterministic per seed', () => {
    expect(placeBoxes(createSeededRng(9), horses, bought, 1800)).toEqual(
      placeBoxes(createSeededRng(9), horses, bought, 1800),
    );
  });
});

describe('shuffle', () => {
  it('permutes in place without losing items', () => {
    const items = [1, 2, 3, 4, 5, 6];
    shuffle(createSeededRng(3), items);
    expect([...items].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
