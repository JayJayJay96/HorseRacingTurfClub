import { BOX_ZONE, MYSTERY_PER_LANE } from './config.ts';
import { round2 } from './math.ts';
import type { Rng } from './rng.ts';
import type { BoxKind, BoxSpot, BoxType, HorseId } from './types.ts';

/** Fisher–Yates, in place. */
export function shuffle<T>(rng: Rng, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

/**
 * One even slot per box across the box zone, each box jittered inside its slot, so boxes never
 * bunch up. Bought boxes take random slots among the lane's mystery boxes.
 */
export function placeBoxes(
  rng: Rng,
  horses: readonly HorseId[],
  bought: Readonly<Record<HorseId, readonly BoxType[]>>,
  distance: number,
): Record<HorseId, BoxSpot[]> {
  const lanes: Record<HorseId, BoxSpot[]> = {};
  for (const id of horses) {
    const kinds: BoxKind[] = [
      ...Array.from({ length: MYSTERY_PER_LANE }, (): BoxKind => 'mystery'),
      ...(bought[id] ?? []),
    ];
    shuffle(rng, kinds);
    const start = distance * BOX_ZONE.start;
    const slot = (distance * (BOX_ZONE.end - BOX_ZONE.start)) / kinds.length;
    lanes[id] = kinds.map((kind, i) => ({
      kind,
      at: round2(start + slot * (i + 0.2 + rng.nextInt(601) / 1000)),
    }));
  }
  return lanes;
}
