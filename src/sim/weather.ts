import { BOX_ZONE, WEATHER, WEATHER_WEIGHTS } from './config.ts';
import { round2 } from './math.ts';
import type { Rng } from './rng.ts';
import type { BoxSpot, Puddle, Weather } from './types.ts';
import { pickWeighted } from './weighted.ts';

/** The race's weather, rolled at odds lock (spec 2026-11-05). Off = always clear. */
export function rollWeather(rng: Rng, enabled: boolean): Weather {
  return enabled ? pickWeighted(rng, WEATHER_WEIGHTS) : 'clear';
}

/**
 * Wide puddles for a rain race, tiled so every lane meets the same number. Each of `perLane` rounds
 * cuts the lanes into consecutive blocks of `WEATHER.puddleLanes` (all lanes when there are fewer)
 * from a random offset; edge blocks may be narrower. Each block becomes one puddle at a random spot
 * clear of boxes in its lanes and of other puddles there; a block that finds no free spot in
 * `placeTries` draws is dropped. `boxes` is per lane (lane = index).
 */
export function placePuddles(
  rng: Rng,
  lanes: number,
  boxes: readonly (readonly BoxSpot[])[],
  distance: number,
  perLane: number,
): Puddle[] {
  const span = Math.min(WEATHER.puddleLanes, lanes);
  const len = WEATHER.puddleLengthM;
  const from = distance * BOX_ZONE.start;
  const room = distance * (BOX_ZONE.end - BOX_ZONE.start) - len;
  const out: Puddle[] = [];
  for (let round = 0; round < perLane; round++) {
    const offset = lanes < WEATHER.puddleLanes ? 0 : rng.nextInt(span); // a tiny field is one block
    for (let start = offset - span; start < lanes; start += span) {
      const first = Math.max(0, start);
      const last = Math.min(lanes - 1, start + span - 1);
      if (first > last) continue;
      for (let tries = 0; tries < WEATHER.placeTries; tries++) {
        const at = round2(from + (rng.nextInt(1_000_001) / 1_000_000) * room);
        let free = true;
        for (let l = first; l <= last; l++) {
          const clash =
            boxes[l]!.some(
              (b) => b.at >= at - WEATHER.boxClearM && b.at <= at + len + WEATHER.boxClearM,
            ) ||
            out.some(
              (p) => p.lanes[0] <= l && l <= p.lanes[1] && p.at < at + len && at < p.at + len,
            );
          if (clash) free = false;
        }
        if (!free) continue;
        out.push({ at, lanes: [first, last] });
        break;
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Each lane's puddles, sorted by distance. */
export function puddlesByLane(puddles: readonly Puddle[], lanes: number): Puddle[][] {
  return Array.from({ length: lanes }, (_, lane) =>
    puddles.filter((p) => p.lanes[0] <= lane && lane <= p.lanes[1]),
  );
}
