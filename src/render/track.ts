/**
 * Stadium oval in metres, seen from above: x right, y down. The home straight is at the bottom
 * and run left to right; the stands are below it. Lanes are visual only (the sim has none).
 */
export interface Track {
  readonly straight: number;
  readonly radius: number;
  readonly laneWidth: number;
  readonly lap: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

const oval = (lap: number, straight: number, laneWidth: number): Track => ({
  straight,
  radius: (lap - 2 * straight) / (2 * Math.PI),
  laneWidth,
  lap,
});

/** The MVP track: Short (1800 m) is 1.5 laps, Long (2700 m) 2.25. */
export const TRACK = oval(1200, 300, 2.5);

/** `s` metres along the inner rail from the start of the home straight, `offset` metres outward. */
export function trackPoint(track: Track, s: number, offset: number): Point {
  const { straight: S, radius: R, lap } = track;
  const r = R + offset;
  const bend = Math.PI * R;
  const u = ((s % lap) + lap) % lap;
  if (u < S) return { x: -S / 2 + u, y: r };
  if (u < S + bend) {
    const th = Math.PI / 2 - (u - S) / R;
    return { x: S / 2 + r * Math.cos(th), y: r * Math.sin(th) };
  }
  if (u < 2 * S + bend) return { x: S / 2 - (u - S - bend), y: -r };
  const th = -Math.PI / 2 - (u - 2 * S - bend) / R;
  return { x: -S / 2 + r * Math.cos(th), y: r * Math.sin(th) };
}

/** The finish line: mid home straight, in front of the stands. */
export const finishS = (track: Track) => track.straight / 2;

/** Where a horse in `lane` is after `metres` of a race over `distance`. */
export const horsePoint = (track: Track, distance: number, metres: number, lane: number) =>
  trackPoint(track, finishS(track) - distance + metres, (lane + 0.5) * track.laneWidth);

/** Half extents of the track with `lanes` lanes, for fitting it on screen. */
export function trackBounds(track: Track, lanes: number) {
  const out = track.radius + lanes * track.laneWidth;
  return { halfWidth: track.straight / 2 + out, halfHeight: out };
}
