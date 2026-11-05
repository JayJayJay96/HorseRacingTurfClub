import { BOX_ZONE, WEATHER, WEATHER_WEIGHTS } from './config.ts';
import { round2 } from './math.ts';
import type { Rng } from './rng.ts';
import type { BoxSpot, Puddle, Weather } from './types.ts';
import { pickOne, pickWeighted } from './weighted.ts';

/** The race's weather, rolled at odds lock (spec 2026-11-05). Off = always clear. */
export function rollWeather(rng: Rng, enabled: boolean): Weather {
  return enabled ? pickWeighted(rng, WEATHER_WEIGHTS) : 'clear';
}

/**
 * Wide puddles for a rain race. Each covers `WEATHER.puddleLanes` adjacent lanes (all lanes when
 * there are fewer). Every puddle goes over the least-covered lane, in the window round it with the
 * fewest puddles, so edge lanes get as many as the rest. `boxes` is per lane (lane = index).
 * A puddle that finds no free spot in `placeTries` draws is dropped.
 */
export function placePuddles(
  rng: Rng,
  lanes: number,
  boxes: readonly (readonly BoxSpot[])[],
  distance: number,
  perLane: number,
): Puddle[] {
  const span = Math.min(WEATHER.puddleLanes, lanes);
  const total = Math.ceil((lanes * perLane) / span);
  const len = WEATHER.puddleLengthM;
  const from = distance * BOX_ZONE.start;
  const room = distance * (BOX_ZONE.end - BOX_ZONE.start) - len;
  const count = new Array<number>(lanes).fill(0);
  const out: Puddle[] = [];
  const windowSum = (s: number) => count.slice(s, s + span).reduce((a, b) => a + b, 0);
  for (let k = 0; k < total; k++) {
    const least = Math.min(...count);
    const lane = pickOne(
      rng,
      count.flatMap((c, i) => (c === least ? [i] : [])),
    );
    const starts: number[] = [];
    for (let s = Math.max(0, lane - span + 1); s <= Math.min(lane, lanes - span); s++)
      starts.push(s);
    const best = Math.min(...starts.map(windowSum));
    const s0 = pickOne(
      rng,
      starts.filter((s) => windowSum(s) === best),
    );
    const covered: [number, number] = [s0, s0 + span - 1];
    for (let tries = 0; tries < WEATHER.placeTries; tries++) {
      const at = round2(from + (rng.nextInt(1_000_001) / 1_000_000) * room);
      const clash = (l: number) =>
        boxes[l]!.some(
          (b) => b.at >= at - WEATHER.boxClearM && b.at <= at + len + WEATHER.boxClearM,
        ) ||
        out.some((p) => p.lanes[0] <= l && l <= p.lanes[1] && p.at < at + len && at < p.at + len);
      let free = true;
      for (let l = covered[0]; l <= covered[1]; l++) if (clash(l)) free = false;
      if (!free) continue;
      out.push({ at, lanes: covered });
      for (let l = covered[0]; l <= covered[1]; l++) count[l]!++;
      break;
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
