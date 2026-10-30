import { describe, expect, it } from 'vitest';
import { PACK_HZ, packTimeline, unpackTimeline } from './pack.ts';
import { simulateRace } from './simulate.ts';

const horses = Array.from({ length: 10 }, (_, i) => `h${i}`);

describe('packTimeline', () => {
  it.each(['short', 'long'] as const)(
    'round-trips progress within 3 m and everything else exactly (%s)',
    (length) => {
      for (let seed = 1; seed <= 5; seed++) {
        const timeline = simulateRace({ seed, horses, bought: { h0: ['speed'] }, length });
        const { progress, ...rest } = timeline;
        const { progress: back, ...backRest } = unpackTimeline(packTimeline(timeline));
        expect(backRest).toEqual(rest);
        for (const h of horses) {
          const original = progress[h]!;
          const restored = back[h]!;
          expect(restored).toHaveLength(original.length);
          const worst = Math.max(...original.map((x, i) => Math.abs(restored[i]! - x)));
          expect(worst).toBeLessThanOrEqual(3);
          expect(restored.at(-1)).toBeCloseTo(original.at(-1)!, 1);
        }
      }
    },
  );

  it('keeps PACK_HZ samples in integer decimetres, well under half the size', () => {
    const timeline = simulateRace({ seed: 1, horses, bought: {}, length: 'short' });
    const packed = packTimeline(timeline);
    const dm = packed.progressDm.h0!;
    expect(dm.every(Number.isInteger)).toBe(true);
    const step = timeline.tickHz / PACK_HZ;
    expect(dm).toHaveLength(Math.ceil((timeline.progress.h0!.length - 1) / step) + 1);
    expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify(timeline).length * 0.4);
  });
});
