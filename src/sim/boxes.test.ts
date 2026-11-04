import { describe, expect, it } from 'vitest';
import { placeBoxes, shuffle } from './boxes.ts';
import { BOX_MIN_GAP, BOX_ZONE, DISTANCE, MAX_BOUGHT, MYSTERY_PER_LANE } from './config.ts';
import { createSeededRng } from './rng.ts';

const horses = ['a', 'b', 'c'];
const bought = { a: ['speed', 'attack', 'defense'] as const, b: ['attack'] as const };
const SHORT = MYSTERY_PER_LANE.short;

describe('placeBoxes', () => {
  it('gives every lane its mystery boxes plus its bought boxes, in order, inside the box zone', () => {
    const lanes = placeBoxes(createSeededRng(1), horses, bought, 1800, SHORT);
    expect(lanes.a).toHaveLength(SHORT + 3);
    expect(lanes.b).toHaveLength(SHORT + 1);
    expect(lanes.c).toHaveLength(SHORT);
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

  it('scales the mystery boxes with race length: 8 short, 12 long (about 4 a minute)', () => {
    expect(MYSTERY_PER_LANE).toEqual({ short: 8, long: 12 });
  });

  it('is deterministic per seed', () => {
    expect(placeBoxes(createSeededRng(9), horses, bought, 1800, SHORT)).toEqual(
      placeBoxes(createSeededRng(9), horses, bought, 1800, SHORT),
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

describe('placeBoxes spread', () => {
  it('keeps every box in 5-95% with at least BOX_MIN_GAP between neighbours, both lengths', () => {
    expect(BOX_ZONE).toEqual({ start: 0.05, end: 0.95 });
    const full = { a: ['speed', 'speed', 'speed'] as const };
    expect(full.a).toHaveLength(MAX_BOUGHT);
    for (const length of ['short', 'long'] as const) {
      const d = DISTANCE[length];
      for (let seed = 1; seed <= 200; seed++) {
        const lanes = placeBoxes(
          createSeededRng(seed),
          ['a', 'b'],
          full,
          d,
          MYSTERY_PER_LANE[length],
        );
        for (const lane of Object.values(lanes)) {
          const at = lane.map((s) => s.at);
          expect(Math.min(...at)).toBeGreaterThanOrEqual(d * 0.05);
          expect(Math.max(...at)).toBeLessThanOrEqual(d * 0.95);
          for (let i = 1; i < at.length; i++) {
            expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(d * BOX_MIN_GAP - 0.01);
          }
        }
      }
    }
  });

  it('really is random: first boxes land anywhere early, lanes differ', () => {
    const firsts: number[] = [];
    for (let seed = 1; seed <= 300; seed++) {
      const lanes = placeBoxes(createSeededRng(seed), horses, {}, 1800, SHORT);
      firsts.push(lanes.a![0]!.at);
      expect(lanes.a!.map((s) => s.at)).not.toEqual(lanes.b!.map((s) => s.at));
    }
    // With 8 boxes the first one still spreads well past a fixed early slot.
    expect(Math.max(...firsts)).toBeGreaterThan(1800 * 0.15);
  });
});
