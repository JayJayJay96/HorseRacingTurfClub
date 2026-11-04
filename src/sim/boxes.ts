import { BOX_MIN_GAP, BOX_ZONE } from './config.ts';
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
 * Spots are uniformly random inside the box zone, sorted, and at least BOX_MIN_GAP apart (draw
 * n offsets in the zone minus the gaps, sort, then add i gaps). Lanes are independent, so every
 * horse's boxes fire at different times. Bought boxes take random places among the `mystery` ones.
 */
export function placeBoxes(
  rng: Rng,
  horses: readonly HorseId[],
  bought: Readonly<Record<HorseId, readonly BoxType[]>>,
  distance: number,
  mystery: number,
): Record<HorseId, BoxSpot[]> {
  const lanes: Record<HorseId, BoxSpot[]> = {};
  const start = distance * BOX_ZONE.start;
  const span = distance * (BOX_ZONE.end - BOX_ZONE.start);
  const gap = distance * BOX_MIN_GAP;
  for (const id of horses) {
    const kinds: BoxKind[] = [
      ...Array.from({ length: mystery }, (): BoxKind => 'mystery'),
      ...(bought[id] ?? []),
    ];
    shuffle(rng, kinds);
    const free = span - gap * (kinds.length - 1);
    const offsets = kinds
      .map(() => (rng.nextInt(1_000_001) / 1_000_000) * free)
      .sort((x, y) => x - y);
    lanes[id] = kinds.map((kind, i) => ({ kind, at: round2(start + offsets[i]! + gap * i) }));
  }
  return lanes;
}
