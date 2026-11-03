# Phase 4 — Playback + Podium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the host presses Start, the big screen plays the race on a pixel 2D oval: a countdown with the box spots, horses with live standings and item popups, and a camera that follows the pack. Phones show a mini oval with their own horse and live bet status. The podium then shows the top 3 and the biggest win. Private mode becomes fully playable.

**Architecture:**

- **Clients only play back the stored Timeline.** Both screens fetch `race_timelines` once per race, unpack it (`src/sim/pack.ts`), and compute every frame from `race time = now − (started_at + countdown)`. A reload mid-race resumes at the same point.
- **New pure code in `src/sim/playback.ts`** covers sampling, standings and the playback length. It lives in `src/sim` because the `start-race` Edge Function also needs `playbackSeconds`.
- **New `src/render/` folder:**
  - Track geometry, camera, item labels and palette are pure and unit-tested.
  - `Pixel2DRenderer` draws on a canvas and implements the spec's `RaceRenderer.play(timeline, track, startAtMs)`.
  - `RaceView` is the React wrapper.
- **Server change, one line:** `start-race` sets `ends_at` to cover countdown + race + finish hold. The big screen already moves the room to PODIUM at `ends_at`, so phones learn their payout only after the replay has shown the finish.

**Tech Stack:** React 19, TypeScript (strict, `erasableSyntaxOnly`, `noUncheckedIndexedAccess`), Canvas 2D, SVG, Vitest, Supabase local stack.

**Spec:** `docs/superpowers/specs/2026-10-29-horse-racing-turf-club-design.md` §4 (Timeline, renderer interface, track definition), §5 (RUNNING and PODIUM rows, refresh rule), §6 item codes, §11 Presentation, §12 phase 4.

---

## Scope decisions (read first)

- **Countdown:** 5 s between Start and the gun (`COUNTDOWN_SECONDS`). The box spots are on the track during it, as the Phase 3 plan promised.
- **Finish hold:** 4 s after the last horse finishes (`FINISH_HOLD_SECONDS`), so the final crossing is seen before the podium.
  - `start-race` passes `p_seconds = playbackSeconds(timeline)` = countdown + last finish time + hold.
  - No migration is needed: `start_race_finish` already sets `ends_at = now() + p_seconds`.
- **Track:** one stadium oval, 1200 m lap, 300 m straights. Short (1800 m) is 1.5 laps and Long (2700 m) is 2.25 laps.
  - The finish is mid home straight, in front of the stands.
  - Lanes are visual only (the sim has none), 2.5 m each, inner lane = lane 0 = first horse.
  - The spec's "3D centreline path" is simplified to an oval with a lap length. A generic path waits until there is a second map (Phase 9).
- **Pixel look:** the canvas is fixed at 640×360 and scaled up by CSS with `image-rendering: pixelated`.
  - The projection is an oblique 3/4 view: track-plane y is squashed by 0.55.
  - Sprites are side view, drawn in code with `fillRect`, palette-swapped per lane: 6 coats × 11 silks, so the first 22 lanes are all different.
- **Camera:** wide for the first 2 s. Then it follows the centroid of the top 3. Once the leader is within 150 m of the finish it holds on the finish line. It eases toward each target every frame.
- **Standings and the timer** are HTML next to the canvas, not drawn in it, so they stay crisp.
- **Phone:** an SVG mini oval with silk-coloured dots, your own horse bigger and outlined. Below it go your position and each of your bets with its horse's current place.
  - Results stay hidden until PODIUM, as now.
- **Podium:** the top 3 with silk swatches and finish times, plus a "Biggest win" line above the payout list. The phone's PODIUM panel is unchanged: own result and final balance.
- **Not in this phase** (record in PROJECT_STATUS deferred items):
  - **Cheers** (spec §5 RUNNING / §4 budget): a separate small feature with its own throttling. Do it in Phase 6 or as a follow-up.
  - **Sound** (Phase 7) and **HD-2D** (Phase 8).
  - **Server clock offset:** devices use their own clock against the DB's `started_at`. NTP-synced devices are within a second.
  - **Playwright E2E** (Phase 9).

## File structure

```
src/sim/playback.ts            NEW  COUNTDOWN_SECONDS, FINISH_HOLD_SECONDS, playbackSeconds, gunMs,
                                    progressAt, standingsAt, eventsBetween (pure; Deno-safe)
src/sim/playback.test.ts       NEW
src/sim/testTimeline.ts        NEW  fakeTimeline test helper
supabase/functions/start-race/index.ts   MOD  p_seconds = playbackSeconds(timeline)
tests/db/functions.test.ts     MOD  ends_at − started_at = playbackSeconds
src/render/track.ts            NEW  Track, TRACK, trackPoint, horsePoint, finishS, trackBounds
src/render/track.test.ts       NEW
src/render/camera.ts           NEW  Camera, WIDE, cameraAt
src/render/camera.test.ts      NEW
src/render/items.ts            NEW  ITEM_INFO, popupOf
src/render/items.test.ts       NEW
src/render/palette.ts          NEW  colorsOf(lane), BOX_COLOR
src/render/palette.test.ts     NEW
src/render/sprites.ts          NEW  drawHorse
src/render/Pixel2DRenderer.ts  NEW  RaceRenderer, VIEW, Pixel2DRenderer
src/render/useRaceTime.ts      NEW  race seconds, 4 updates/s
src/render/RaceView.tsx        NEW  canvas + standings; Silk swatch
src/app/Sandbox.tsx            MOD  local sim played with RaceView
src/app/app.css                MOD  .race, .standings, .silk, .mini
src/net/rooms.ts               MOD  fetchTimeline
src/net/useTimeline.ts         NEW  fetch + unpack once per race
src/track/TrackPage.tsx        MOD  RunningBoard plays the race; PodiumBoard swatches, times, biggest win
src/play/MiniOval.tsx          NEW  SVG mini oval
src/play/PlayPage.tsx          MOD  RunningPanel: countdown, mini oval, live bet status
README.md, PROJECT_STATUS.md   MOD
```

---

### Task 0: Branch

- [ ] **Step 1:** Branch `phase4-playback` already exists (cut from `master` at `dff1822`). Confirm with `git branch --show-current` → `phase4-playback`.
- [ ] **Step 2:** Add a Phase 4 checklist under Phase 3 in `PROJECT_STATUS.md`:

```markdown
## Phase 4 — Playback + podium (branch `phase4-playback`)

- [x] Task 0: Branch
- [ ] Task 1: Playback maths (pure)
- [ ] Task 2: Start covers countdown and finish hold
- [ ] Task 3: Track geometry
- [ ] Task 4: Camera
- [ ] Task 5: Item labels and palette
- [ ] Task 6: Pixel 2D renderer
- [ ] Task 7: RaceView and sandbox
- [ ] Task 8: Timeline loading
- [ ] Task 9: Big screen running and podium
- [ ] Task 10: Phone mini view
- [ ] Task 11: Smoke test and docs
```

- [ ] **Step 3:** Commit: `git add PROJECT_STATUS.md docs/superpowers/plans/2026-10-30-phase4-playback-podium.md && git commit -m "docs: Phase 4 plan"`

---

### Task 1: Playback maths (pure)

**Files:**
- Create: `src/sim/playback.ts`, `src/sim/testTimeline.ts` (test helper)
- Test: `src/sim/playback.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_SECONDS,
  FINISH_HOLD_SECONDS,
  eventsBetween,
  gunMs,
  playbackSeconds,
  progressAt,
  standingsAt,
} from './playback.ts';
import { fakeTimeline } from './testTimeline.ts';
import type { RaceEvent } from './types.ts';

describe('playback', () => {
  it('lasts countdown + last finish + hold', () => {
    expect(playbackSeconds(fakeTimeline({ a: 10, b: 5 }))).toBe(
      COUNTDOWN_SECONDS + 20 + FINISH_HOLD_SECONDS,
    );
  });

  it('fires the gun COUNTDOWN_SECONDS after Start', () => {
    const start = '2026-10-30T12:00:00.000Z';
    expect(gunMs(start)).toBe(Date.parse(start) + COUNTDOWN_SECONDS * 1000);
  });

  it('interpolates progress between ticks and clamps both ends', () => {
    const tl = fakeTimeline({ a: 10, b: 5 });
    expect(progressAt(tl, 'a', -3)).toBe(0);
    expect(progressAt(tl, 'a', 0.55)).toBeCloseTo(5.5);
    expect(progressAt(tl, 'a', 99)).toBe(100);
    expect(progressAt(tl, 'nobody', 1)).toBe(0);
  });

  it('orders finished horses by place, then runners by distance, lane order on ties', () => {
    const tl = fakeTimeline({ a: 10, b: 5, c: 5, d: 8 });
    expect(standingsAt(tl, 0)).toEqual(['a', 'b', 'c', 'd']);
    expect(standingsAt(tl, 5)).toEqual(['a', 'd', 'b', 'c']);
    expect(standingsAt(tl, 30)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('lists events in (from, to]', () => {
    const events: RaceEvent[] = [
      { t: 1, type: 'finish', horse: 'a', place: 1 },
      { t: 2, type: 'finish', horse: 'b', place: 2 },
    ];
    const tl = fakeTimeline({ a: 10, b: 5 }, 100, events);
    expect(eventsBetween(tl, 1, 2)).toEqual([events[1]]);
    expect(eventsBetween(tl, 0, 1)).toEqual([events[0]]);
  });
});
```

Also create the shared test helper `src/sim/testTimeline.ts` (test-only, like `testStats.ts`; the camera test reuses it):

```ts
import type { RaceEvent, Timeline } from './types.ts';

/** Horses at constant speed (m/s) over `distance`, sampled at 10 Hz like the engine. */
export function fakeTimeline(
  speeds: Record<string, number>,
  distance = 100,
  events: RaceEvent[] = [],
): Timeline {
  const horses = Object.keys(speeds);
  const slowest = Math.min(...Object.values(speeds));
  const ticks = Math.ceil((distance / slowest) * 10) + 1;
  const progress: Record<string, number[]> = {};
  const finishTimes: Record<string, number> = {};
  for (const h of horses) {
    const v = speeds[h]!;
    progress[h] = Array.from({ length: ticks }, (_, i) => Math.min(distance, (v * i) / 10));
    finishTimes[h] = distance / v;
  }
  const finishOrder = [...horses].sort((a, b) => finishTimes[a]! - finishTimes[b]!);
  return {
    seed: 1,
    length: 'short',
    distance,
    tickHz: 10,
    horses,
    boxes: {},
    progress,
    events,
    finishOrder,
    finishTimes,
  };
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/sim/playback.test.ts`
Expected: FAIL, `Failed to resolve import "./playback.ts"`.

- [ ] **Step 3: Implement**

```ts
import type { HorseId, Timeline } from './types.ts';

/** Seconds between Start and the gun; the box spots are shown meanwhile. */
export const COUNTDOWN_SECONDS = 5;
/** Seconds the final standings stay up after the last horse finishes. */
export const FINISH_HOLD_SECONDS = 4;

/** Start to podium: countdown, the race itself, then the hold. `start-race` sets ends_at from it. */
export const playbackSeconds = (timeline: Pick<Timeline, 'finishTimes'>) =>
  COUNTDOWN_SECONDS + Math.max(...Object.values(timeline.finishTimes)) + FINISH_HOLD_SECONDS;

/** Epoch ms of the gun (race time 0) for a race started at `startedAt` (ISO). */
export const gunMs = (startedAt: string) => Date.parse(startedAt) + COUNTDOWN_SECONDS * 1000;

/** Metres from the start at race time `t` (seconds), linear between ticks. */
export function progressAt(timeline: Timeline, horse: HorseId, t: number): number {
  const samples = timeline.progress[horse];
  if (!samples || samples.length === 0) return 0;
  const i = Math.max(0, t * timeline.tickHz);
  const last = samples.length - 1;
  if (i >= last) return samples[last]!;
  const k = Math.floor(i);
  return samples[k]! + (samples[k + 1]! - samples[k]!) * (i - k);
}

/** Running order at `t`: finished horses by place, then the rest by distance (lane order on ties). */
export function standingsAt(timeline: Timeline, t: number): HorseId[] {
  const done = timeline.finishOrder.filter((h) => timeline.finishTimes[h]! <= t);
  const running = timeline.horses
    .filter((h) => !done.includes(h))
    .map((h) => ({ h, m: progressAt(timeline, h, t) }))
    .sort((a, b) => b.m - a.m)
    .map((x) => x.h);
  return [...done, ...running];
}

/** Events with from < t <= to, in simulation order. */
export const eventsBetween = (timeline: Timeline, from: number, to: number) =>
  timeline.events.filter((e) => e.t > from && e.t <= to);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/sim/playback.test.ts`
Expected: PASS (5 tests). Then `npm run typecheck && npm run lint`, both clean.

- [ ] **Step 5: Commit**

```bash
git add src/sim/playback.ts src/sim/playback.test.ts src/sim/testTimeline.ts
git commit -m "feat(sim): playback clock, sampling and standings"
```

---

### Task 2: Start covers countdown and finish hold

**Files:**
- Modify: `supabase/functions/start-race/index.ts`
- Modify: `tests/db/functions.test.ts` (the "runs a whole race" test)

Needs the local stack: `npx supabase start` (Edge Functions hot-reload).

- [ ] **Step 1: Write the failing assertion.** In `tests/db/functions.test.ts`, add these imports:

```ts
import type { PackedTimeline } from '../../src/sim/pack.ts';
import { playbackSeconds } from '../../src/sim/playback.ts';
```

Then append to the end of the "runs a whole race" test, after the existing `expect(stored.timeline.finishOrder)...` line:

```ts
    const span = (Date.parse(done.ends_at) - Date.parse(done.started_at)) / 1000;
    expect(span).toBeCloseTo(playbackSeconds(stored.timeline as PackedTimeline), 2);
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --config vitest.db.config.ts tests/db/functions.test.ts`
Expected: FAIL. The span is the last finish time, about 9 s short.

- [ ] **Step 3: Implement.** In `supabase/functions/start-race/index.ts`:
  - add the import `import { playbackSeconds } from '../../../src/sim/playback.ts';`
  - replace `p_seconds: Math.max(...Object.values(timeline.finishTimes)),` with:

```ts
    // ends_at covers the countdown, the race and the finish hold, so PODIUM comes after the replay.
    p_seconds: playbackSeconds(timeline),
```

- [ ] **Step 4: Run tests**

Run: `npm run test:db`
Expected: all 54 pass (no new tests; the realtime test may need one rerun right after a `db reset`).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/start-race/index.ts tests/db/functions.test.ts
git commit -m "feat(start-race): ends_at covers countdown and finish hold"
```

---

### Task 3: Track geometry

**Files:**
- Create: `src/render/track.ts`
- Test: `src/render/track.test.ts`

Coordinates are metres on the track plane seen from above: x right, y down (like the screen). The home straight is at the bottom (positive y), run left to right; the stands sit below it.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { TRACK, finishS, horsePoint, trackBounds, trackPoint } from './track.ts';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('track', () => {
  it('is a 1200 m lap with 300 m straights', () => {
    expect(TRACK.lap).toBe(1200);
    expect(2 * TRACK.straight + 2 * Math.PI * TRACK.radius).toBeCloseTo(1200);
  });

  it('is continuous and arc-length parametrised along lane 0', () => {
    for (let s = 0; s < TRACK.lap; s += 0.5) {
      expect(dist(trackPoint(TRACK, s, 0), trackPoint(TRACK, s + 0.5, 0))).toBeCloseTo(0.5, 2);
    }
  });

  it('wraps every lap, including negative distances', () => {
    for (const s of [0, 123, 777]) {
      const p = trackPoint(TRACK, s, 3);
      expect(dist(p, trackPoint(TRACK, s + TRACK.lap, 3))).toBeCloseTo(0);
      expect(dist(p, trackPoint(TRACK, s - TRACK.lap, 3))).toBeCloseTo(0);
    }
  });

  it('puts the finish mid home straight, in front of the stands', () => {
    expect(finishS(TRACK)).toBe(150);
    const p = horsePoint(TRACK, 1800, 1800, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(TRACK.radius + TRACK.laneWidth / 2);
  });

  it('starts a race `distance` metres before the finish', () => {
    // Short = 1.5 laps: the start is mid back straight.
    const start = horsePoint(TRACK, 1800, 0, 0);
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(-(TRACK.radius + TRACK.laneWidth / 2));
  });

  it('puts higher lanes further out', () => {
    const centre = (s: number, lane: number) => {
      const p = horsePoint(TRACK, 1800, s, lane);
      return Math.hypot(Math.max(Math.abs(p.x) - TRACK.straight / 2, 0), p.y);
    };
    for (const s of [0, 300, 700, 1100]) expect(centre(s, 5)).toBeGreaterThan(centre(s, 0));
  });

  it('bounds the whole track for a field', () => {
    const b = trackBounds(TRACK, 10);
    expect(b.halfWidth).toBeCloseTo(150 + TRACK.radius + 25);
    expect(b.halfHeight).toBeCloseTo(TRACK.radius + 25);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/render/track.test.ts`
Expected: FAIL, cannot resolve `./track.ts`.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/render/track.test.ts`
Expected: PASS (7 tests). `npm run typecheck && npm run lint` clean.

- [ ] **Step 5: Commit**

```bash
git add src/render/track.ts src/render/track.test.ts
git commit -m "feat(render): oval track geometry"
```

---

### Task 4: Camera

**Files:**
- Create: `src/render/camera.ts`
- Test: `src/render/camera.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { fakeTimeline } from '../sim/testTimeline.ts';
import { FINISH_SHOT_METRES, FINISH_ZOOM, FOLLOW_ZOOM, WIDE, cameraAt } from './camera.ts';
import { TRACK, horsePoint } from './track.ts';

describe('cameraAt', () => {
  const speeds = { a: 10, b: 9, c: 8, d: 7 };
  const tl = fakeTimeline(speeds, 1000);

  it('is wide during the countdown and the first 2 s', () => {
    expect(cameraAt(TRACK, tl, -4)).toEqual(WIDE);
    expect(cameraAt(TRACK, tl, 1.9)).toEqual(WIDE);
  });

  it('follows the centroid of the top 3', () => {
    const t = 30;
    const pts = [speeds.a, speeds.b, speeds.c].map((v, lane) =>
      horsePoint(TRACK, 1000, v * t, lane),
    );
    const cam = cameraAt(TRACK, tl, t);
    expect(cam.zoom).toBe(FOLLOW_ZOOM);
    expect(cam.x).toBeCloseTo((pts[0]!.x + pts[1]!.x + pts[2]!.x) / 3);
    expect(cam.y).toBeCloseTo((pts[0]!.y + pts[1]!.y + pts[2]!.y) / 3);
  });

  it('holds on the finish line once the leader is close', () => {
    const t = (1000 - FINISH_SHOT_METRES) / 10;
    const finish = horsePoint(TRACK, 1000, 1000, 0);
    expect(cameraAt(TRACK, tl, t)).toEqual({ x: finish.x, y: finish.y, zoom: FINISH_ZOOM });
    expect(cameraAt(TRACK, tl, 500)).toEqual({ x: finish.x, y: finish.y, zoom: FINISH_ZOOM });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/render/camera.test.ts`
Expected: FAIL, cannot resolve `./camera.ts`.

- [ ] **Step 3: Implement**

```ts
import { progressAt, standingsAt } from '../sim/playback.ts';
import type { Timeline } from '../sim/types.ts';
import { horsePoint, type Point, type Track } from './track.ts';

/** Centre in track metres; zoom 1 fits the whole track. */
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export const WIDE: Camera = { x: 0, y: 0, zoom: 1 };
export const FOLLOW_ZOOM = 2.5;
export const FINISH_ZOOM = 1.8;
/** The camera moves to the finish line once the leader is this close. */
export const FINISH_SHOT_METRES = 150;
const WIDE_SECONDS = 2;

/** Where the camera wants to be at race time `t`; the renderer eases toward it. */
export function cameraAt(track: Track, timeline: Timeline, t: number): Camera {
  if (t < WIDE_SECONDS) return WIDE;
  const { distance, horses } = timeline;
  const order = standingsAt(timeline, t);
  if (progressAt(timeline, order[0]!, t) >= distance - FINISH_SHOT_METRES) {
    const p = horsePoint(track, distance, distance, 0);
    return { x: p.x, y: p.y, zoom: FINISH_ZOOM };
  }
  const pack = order
    .slice(0, 3)
    .map((h) => horsePoint(track, distance, progressAt(timeline, h, t), horses.indexOf(h)));
  const mean = (f: (p: Point) => number) => pack.reduce((sum, p) => sum + f(p), 0) / pack.length;
  return { x: mean((p) => p.x), y: mean((p) => p.y), zoom: FOLLOW_ZOOM };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/render/camera.test.ts`
Expected: PASS (3 tests). Typecheck and lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/render/camera.ts src/render/camera.test.ts
git commit -m "feat(render): race camera"
```

---

### Task 5: Item labels and palette

**Files:**
- Create: `src/render/items.ts`, `src/render/palette.ts`
- Test: `src/render/items.test.ts`, `src/render/palette.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/render/items.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EFFECTS } from '../sim/config.ts';
import type { ItemCode } from '../sim/types.ts';
import { ITEM_INFO, popupOf } from './items.ts';

describe('items', () => {
  it('names and icons every item code', () => {
    for (const code of Object.keys(EFFECTS) as ItemCode[]) {
      expect(ITEM_INFO[code].name.length).toBeGreaterThan(0);
      expect(ITEM_INFO[code].icon.length).toBeGreaterThan(0);
    }
    expect(ITEM_INFO['attack:leader'].name).toBe('Golden Lasso');
  });

  it('words each event as a short popup', () => {
    expect(popupOf({ t: 1, type: 'pickup', horse: 'a', kind: 'speed', item: 'speed:self1' })).toBe(
      '🥕 Carrot',
    );
    expect(popupOf({ t: 1, type: 'pickup', horse: 'a', kind: 'attack', item: null })).toBe(
      '💨 Fizzled',
    );
    expect(popupOf({ t: 1, type: 'hit', horse: 'a', by: 'b', item: 'attack:top3' })).toBe(
      '🐝 Hit!',
    );
    expect(
      popupOf({ t: 1, type: 'blocked', horse: 'a', by: 'b', item: 'attack:front1', reason: 'immune' }),
    ).toBe('🫧 Immune');
    expect(
      popupOf({ t: 1, type: 'blocked', horse: 'a', by: 'b', item: 'attack:front1', reason: 'shield' }),
    ).toBe('🛡️ Blocked');
    expect(popupOf({ t: 1, type: 'reflected', horse: 'a', by: 'b', item: 'attack:front1' })).toBe(
      '🪞 Reflected!',
    );
    expect(popupOf({ t: 1, type: 'finish', horse: 'a', place: 2 })).toBe('🏁 2nd');
  });
});
```

`src/render/palette.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_HORSES } from '../sim/config.ts';
import { colorsOf } from './palette.ts';

describe('colorsOf', () => {
  it('gives every lane of a full field its own coat + silk', () => {
    const pairs = Array.from({ length: MAX_HORSES }, (_, lane) => {
      const c = colorsOf(lane);
      return `${c.coat}/${c.silk}`;
    });
    expect(new Set(pairs).size).toBe(MAX_HORSES);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/render/items.test.ts src/render/palette.test.ts`
Expected: FAIL, cannot resolve the modules.

- [ ] **Step 3: Implement**

`src/render/items.ts` (names from spec §6):

```ts
import { ordinal } from '../betting/betting.ts';
import type { ItemCode, RaceEvent } from '../sim/types.ts';

export const ITEM_INFO: Readonly<Record<ItemCode, { name: string; icon: string }>> = {
  'speed:self1': { name: 'Carrot', icon: '🥕' },
  'speed:self3': { name: 'Golden Carrot', icon: '✨' },
  'speed:star': { name: 'Thunder Hooves', icon: '⚡' },
  'speed:pass3': { name: 'Stampede', icon: '🐎' },
  'attack:behind1': { name: 'Banana Peel', icon: '🍌' },
  'attack:behind3': { name: 'Dust Kick', icon: '💨' },
  'attack:front1': { name: 'Horseshoe Toss', icon: '🧲' },
  'attack:front3': { name: 'Mud Cloud', icon: '🌫️' },
  'attack:leader': { name: 'Golden Lasso', icon: '🪢' },
  'attack:top3': { name: 'Hornet Swarm', icon: '🐝' },
  'attack:all': { name: 'Thunderclap', icon: '🌩️' },
  'defense:block1': { name: 'Horseshoe Shield', icon: '🛡️' },
  'defense:immune': { name: 'Lucky Bubble', icon: '🫧' },
  'defense:reflect': { name: 'Mirror Saddle', icon: '🪞' },
  'dud:stop': { name: 'Snack Break', icon: '🍩' },
  'dud:slow': { name: 'Sleepy Jockey', icon: '😴' },
  'dud:trip': { name: 'Stumble', icon: '🤕' },
};

/** Text that floats above `event.horse`. */
export function popupOf(event: RaceEvent): string {
  switch (event.type) {
    case 'pickup':
      return event.item
        ? `${ITEM_INFO[event.item].icon} ${ITEM_INFO[event.item].name}`
        : '💨 Fizzled';
    case 'hit':
      return `${ITEM_INFO[event.item].icon} Hit!`;
    case 'blocked':
      return event.reason === 'immune' ? '🫧 Immune' : '🛡️ Blocked';
    case 'reflected':
      return '🪞 Reflected!';
    case 'finish':
      return `🏁 ${ordinal(event.place)}`;
  }
}
```

`src/render/palette.ts`:

```ts
import type { BoxKind } from '../sim/types.ts';

const COATS = ['#8b4a2b', '#b5651d', '#2b2b2b', '#9e9e9e', '#d8b26e', '#efe8dc'];
const MANES = ['#2b1a10', '#6e3510', '#111111', '#e0e0e0', '#f3e2b0', '#b9b0a0'];
const SILKS = [
  '#e53935', '#1e88e5', '#fdd835', '#43a047', '#8e24aa', '#fb8c00',
  '#00acc1', '#d81b60', '#ffffff', '#3949ab', '#7cb342',
];

export interface HorseColors {
  readonly coat: string;
  readonly mane: string;
  readonly silk: string;
}

/** 6 coats × 11 silks (coprime), so the first 66 lanes all differ. */
export function colorsOf(lane: number): HorseColors {
  const c = lane % COATS.length;
  return { coat: COATS[c]!, mane: MANES[c]!, silk: SILKS[lane % SILKS.length]! };
}

export const BOX_COLOR: Readonly<Record<BoxKind, string>> = {
  mystery: '#ffd54f',
  speed: '#29b6f6',
  defense: '#66bb6a',
  attack: '#ef5350',
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/render`
Expected: PASS. Typecheck and lint clean. Then run Prettier on these four files only (it may rewrap `SILKS`):
`npx prettier --write src/render/palette.ts src/render/items.ts src/render/items.test.ts src/render/palette.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/render/items.ts src/render/items.test.ts src/render/palette.ts src/render/palette.test.ts
git commit -m "feat(render): item popups and lane colours"
```

---

### Task 6: Pixel 2D renderer

**Files:**
- Create: `src/render/sprites.ts`, `src/render/Pixel2DRenderer.ts`

Canvas drawing has no unit test; Task 7's sandbox is its visual check. Keep all maths in the tested modules above.

- [ ] **Step 1: Sprites.** `src/render/sprites.ts`:

```ts
import type { HorseColors } from './palette.ts';

/** Leg swing (px) for the front/back pairs in each of the 4 gallop frames. */
const LEGS = [
  [0, 2],
  [1, 1],
  [2, 0],
  [1, 1],
] as const;

/**
 * Side-view horse and jockey, ~16×14 px, hooves at (x, y). Facing +1 runs right, −1 left.
 * `frame` picks the gallop pose; pass a value that only changes while the horse moves.
 */
export function drawHorse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colors: HorseColors,
  frame: number,
  facing: 1 | -1,
) {
  const px = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(dx, dy, w, h);
  };
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(facing, 1);
  const [a, b] = LEGS[frame % LEGS.length]!;
  for (const [lx, swing] of [
    [-4, a],
    [-2, b],
    [2, a],
    [4, b],
  ] as const) {
    px(lx + swing - 1, -4, 1, 4, colors.coat);
  }
  px(-5, -8, 10, 4, colors.coat); // body
  px(-7, -8, 2, 3, colors.mane); // tail
  px(4, -11, 3, 4, colors.coat); // neck
  px(6, -12, 3, 2, colors.coat); // head
  px(4, -12, 2, 1, colors.mane); // mane
  px(-1, -12, 3, 4, colors.silk); // jockey
  px(0, -14, 2, 2, colors.silk); // cap
  ctx.restore();
}
```

- [ ] **Step 2: Renderer.** `src/render/Pixel2DRenderer.ts`:

```ts
import { eventsBetween, progressAt } from '../sim/playback.ts';
import type { HorseId, Timeline } from '../sim/types.ts';
import { WIDE, cameraAt, type Camera } from './camera.ts';
import { popupOf } from './items.ts';
import { BOX_COLOR, colorsOf } from './palette.ts';
import { drawHorse } from './sprites.ts';
import { finishS, horsePoint, trackBounds, trackPoint, type Point, type Track } from './track.ts';

/** Spec §4: every renderer plays the same Timeline on the same track. */
export interface RaceRenderer {
  /** `startAtMs` is the epoch ms of the gun (race time 0); earlier times show the countdown. */
  play(timeline: Timeline, track: Track, startAtMs: number): void;
  stop(): void;
}

/** Internal resolution; CSS scales it up with `image-rendering: pixelated`. */
export const VIEW = { width: 640, height: 360, tilt: 0.55 } as const;

const GRASS = '#3d7a3a';
const DIRT = '#b98a5a';
const RAIL = '#f5f5f5';
const STANDS = '#5d5d6e';
const EASE = 0.06;
const POPUP_SECONDS = 2;

export class Pixel2DRenderer implements RaceRenderer {
  private readonly canvas: HTMLCanvasElement;
  /** Read every frame, so renamed or late-loaded names show up without restarting. */
  private readonly names: () => Readonly<Record<HorseId, string>>;
  private raf = 0;
  private camera: Camera = WIDE;

  constructor(canvas: HTMLCanvasElement, names: () => Readonly<Record<HorseId, string>>) {
    this.canvas = canvas;
    this.names = names;
  }

  play(timeline: Timeline, track: Track, startAtMs: number) {
    this.stop();
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    this.camera = WIDE;
    const frame = () => {
      this.draw(ctx, timeline, track, (Date.now() - startAtMs) / 1000);
      this.raf = requestAnimationFrame(frame);
    };
    frame();
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  private draw(ctx: CanvasRenderingContext2D, timeline: Timeline, track: Track, t: number) {
    const target = cameraAt(track, timeline, t);
    const c = this.camera;
    this.camera = {
      x: c.x + (target.x - c.x) * EASE,
      y: c.y + (target.y - c.y) * EASE,
      zoom: c.zoom + (target.zoom - c.zoom) * EASE,
    };
    const lanes = timeline.horses.length;
    const outer = lanes * track.laneWidth;
    const scale =
      (VIEW.width / (2 * trackBounds(track, lanes).halfWidth + 20)) * this.camera.zoom;
    const screen = (p: Point): Point => ({
      x: (p.x - this.camera.x) * scale + VIEW.width / 2,
      y: (p.y - this.camera.y) * scale * VIEW.tilt + VIEW.height / 2,
    });

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // Track ribbon between the rails.
    const ring = (offset: number) => {
      for (let s = 0; s <= track.lap; s += 4) {
        const p = screen(trackPoint(track, s, offset));
        if (s === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    };
    ctx.beginPath();
    ring(outer + 2);
    ring(-2);
    ctx.fillStyle = DIRT;
    ctx.fill('evenodd');
    ctx.strokeStyle = RAIL;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ring(-2);
    ctx.stroke();
    ctx.beginPath();
    ring(outer + 2);
    ctx.stroke();

    // Stands below the home straight, then the finish line.
    const s0 = screen({ x: -track.straight / 2, y: track.radius + outer + 8 });
    const s1 = screen({ x: track.straight / 2, y: track.radius + outer + 40 });
    ctx.fillStyle = STANDS;
    ctx.fillRect(s0.x, s0.y, s1.x - s0.x, s1.y - s0.y);
    const f0 = screen(trackPoint(track, finishS(track), -2));
    const f1 = screen(trackPoint(track, finishS(track), outer + 2));
    ctx.strokeStyle = RAIL;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(f0.x, f0.y);
    ctx.lineTo(f1.x, f1.y);
    ctx.stroke();

    // Unopened boxes: a horse passes its lane's boxes in order, one pickup each.
    timeline.horses.forEach((horse, lane) => {
      const opened = timeline.events.filter(
        (e) => e.type === 'pickup' && e.horse === horse && e.t <= t,
      ).length;
      const boxes = [...(timeline.boxes[horse] ?? [])].sort((a, b) => a.at - b.at);
      for (const box of boxes.slice(opened)) {
        const p = screen(horsePoint(track, timeline.distance, box.at, lane));
        ctx.fillStyle = BOX_COLOR[box.kind];
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
      }
    });

    // Horses, back to front.
    const where = new Map<HorseId, Point>();
    const drawn = timeline.horses
      .map((horse, lane) => {
        const m = progressAt(timeline, horse, t);
        const here = horsePoint(track, timeline.distance, m, lane);
        const ahead = horsePoint(track, timeline.distance, m + 1, lane);
        const p = screen(here);
        where.set(horse, p);
        return { horse, lane, m, p, facing: (ahead.x >= here.x ? 1 : -1) as 1 | -1 };
      })
      .sort((a, b) => a.p.y - b.p.y);
    const names = this.names();
    ctx.textAlign = 'center';
    for (const h of drawn) {
      drawHorse(ctx, h.p.x, h.p.y, colorsOf(h.lane), Math.floor(h.m / 1.5), h.facing);
      if (this.camera.zoom > 1.5) {
        ctx.font = '8px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(names[h.horse] ?? '?', h.p.x, h.p.y - 17);
      }
    }

    // Item popups float up for POPUP_SECONDS.
    ctx.font = '10px sans-serif';
    for (const e of eventsBetween(timeline, t - POPUP_SECONDS, t)) {
      const p = where.get(e.horse);
      if (!p) continue;
      ctx.fillStyle = '#fff';
      ctx.fillText(popupOf(e), p.x, p.y - 26 - (t - e.t) * 8);
    }

    // Countdown, then GO!
    if (t < 1) {
      ctx.font = 'bold 64px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(t < 0 ? String(Math.ceil(-t)) : 'GO!', VIEW.width / 2, VIEW.height / 2 + 20);
    }
  }
}
```

- [ ] **Step 3: Check**

Run: `npm run typecheck && npm run lint && npm test`
Expected: clean; all unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/render/sprites.ts src/render/Pixel2DRenderer.ts
git commit -m "feat(render): pixel 2D race renderer"
```

---

### Task 7: RaceView and sandbox

**Files:**
- Create: `src/render/useRaceTime.ts`, `src/render/RaceView.tsx`
- Modify: `src/app/Sandbox.tsx`, `src/app/app.css`

- [ ] **Step 1: Race clock hook.** `src/render/useRaceTime.ts`:

```ts
import { useEffect, useState } from 'react';

/** Seconds since the gun at `startAtMs` (negative during the countdown), updated 4 times a second. */
export function useRaceTime(startAtMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return (now - startAtMs) / 1000;
}
```

- [ ] **Step 2: RaceView.** `src/render/RaceView.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { standingsAt } from '../sim/playback.ts';
import type { HorseId, Timeline } from '../sim/types.ts';
import { colorsOf } from './palette.ts';
import { Pixel2DRenderer, VIEW } from './Pixel2DRenderer.ts';
import { TRACK } from './track.ts';
import { useRaceTime } from './useRaceTime.ts';

/** A lane's silk colour as a small square. */
export function Silk({ lane }: { lane: number }) {
  return <span className="silk" style={{ background: colorsOf(lane).silk }} />;
}

type Props = {
  timeline: Timeline;
  /** Epoch ms of the gun (`gunMs(race.started_at)`). */
  startAtMs: number;
  names: Readonly<Record<HorseId, string>>;
};

/** Big-screen race: the pixel track plus live standings. */
export function RaceView({ timeline, startAtMs, names }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const namesRef = useRef(names);
  useEffect(() => {
    namesRef.current = names;
  });
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const renderer = new Pixel2DRenderer(el, () => namesRef.current);
    renderer.play(timeline, TRACK, startAtMs);
    return () => renderer.stop();
  }, [timeline, startAtMs]);

  const t = useRaceTime(startAtMs);
  return (
    <div className="race">
      <canvas ref={canvas} width={VIEW.width} height={VIEW.height} />
      <ol className="standings">
        {standingsAt(timeline, t).map((h) => {
          const time = timeline.finishTimes[h]!;
          return (
            <li key={h}>
              <Silk lane={timeline.horses.indexOf(h)} /> {names[h] ?? '?'}
              {time <= t && ` · ${time.toFixed(2)} s`}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

- [ ] **Step 3: Sandbox.** Replace `src/app/Sandbox.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { RaceView } from '../render/RaceView.tsx';
import { COUNTDOWN_SECONDS } from '../sim/playback.ts';
import { createCryptoRng } from '../sim/rng.ts';
import { simulateRace } from '../sim/simulate.ts';
import type { RaceLength, Timeline } from '../sim/types.ts';

const SAMPLE_HORSES = [
  'Nasi Lemak Express',
  'Teh Tarik Turbo',
  'Roti Canai Rocket',
  'Kopi O Kid',
  'Satay Sprinter',
  'Durian Dasher',
];

/** Runs the engine locally with a crypto seed and plays it back; no Supabase needed. */
export function Sandbox() {
  const [run, setRun] = useState<{ timeline: Timeline; gun: number } | null>(null);
  const names = useMemo(() => Object.fromEntries(SAMPLE_HORSES.map((h) => [h, h])), []);
  const start = (length: RaceLength) =>
    setRun({
      timeline: simulateRace({
        seed: createCryptoRng().nextInt(2 ** 32),
        horses: SAMPLE_HORSES,
        bought: { [SAMPLE_HORSES[0]!]: ['speed', 'attack', 'defense'] },
        length,
      }),
      gun: Date.now() + COUNTDOWN_SECONDS * 1000,
    });

  return (
    <main className="track">
      <h1>Horse Racing Turf Club · sandbox</h1>
      <p>
        <button type="button" onClick={() => start('short')}>
          Run short race
        </button>{' '}
        <button type="button" onClick={() => start('long')}>
          Run long race
        </button>
        {run && ` Seed ${run.timeline.seed} · ${run.timeline.events.length} events`}
      </p>
      {run && (
        <RaceView key={run.gun} timeline={run.timeline} startAtMs={run.gun} names={names} />
      )}
    </main>
  );
}
```

- [ ] **Step 4: CSS.** Append to `src/app/app.css`:

```css
.race {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 16px;
  align-items: start;
}
.race canvas {
  width: 100%;
  image-rendering: pixelated;
  background: #3d7a3a;
}
.standings {
  margin: 0;
  padding-left: 1.5em;
  font-size: 1rem;
}
.silk {
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  border-radius: 2px;
  vertical-align: middle;
  outline: 1px solid color-mix(in srgb, currentColor 40%, transparent);
}
.mini {
  width: 100%;
  height: auto;
}
@media (max-width: 700px) {
  .race {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Visual check.** Run `npm run dev`, open `http://localhost:5173/sandbox`, press **Run short race**. Check each of these:
  1. A 5-4-3-2-1 countdown, then GO!, with coloured box dots in every lane.
  2. Horses gallop, face the way they run (they flip at the bends), and the camera eases from wide to the pack.
  3. Item popups float above horses.
  4. Standings reorder live; finished horses show times.
  5. The camera holds on the finish line in front of the grey stands, and the leader crosses there.
  6. No console errors.

  Run a long race too. Fix any drawing bug in `Pixel2DRenderer.ts` / `sprites.ts` before committing.

- [ ] **Step 6: Check and commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`, all clean.

```bash
git add src/render/useRaceTime.ts src/render/RaceView.tsx src/app/Sandbox.tsx src/app/app.css
git commit -m "feat(render): RaceView with standings; sandbox plays races"
```

---

### Task 8: Timeline loading

**Files:**
- Modify: `src/net/rooms.ts`
- Create: `src/net/useTimeline.ts`

`race_timelines` is readable by room members (RLS from Phase 3). It is fetched once per race, never in the room refetch loop.

- [ ] **Step 1: Fetch.** In `src/net/rooms.ts`:
  - change the types import to `import type { BoxType, RaceLength, Timeline } from '../sim/types.ts';`
  - add `import { unpackTimeline, type PackedTimeline } from '../sim/pack.ts';`
  - add this function after `fetchRoom`:

```ts
/** The race's stored Timeline, unpacked; null until Start has written it. */
export async function fetchTimeline(raceId: string): Promise<Timeline | null> {
  const row = await call(
    supabase.from('race_timelines').select('timeline').eq('race_id', raceId).maybeSingle(),
  );
  return row ? unpackTimeline(row.timeline as unknown as PackedTimeline) : null;
}
```

- [ ] **Step 2: Hook.** `src/net/useTimeline.ts`:

```ts
import { useEffect, useState } from 'react';
import type { Timeline } from '../sim/types.ts';
import { errorText, fetchTimeline } from './rooms.ts';

const RETRY_MS = 2000;

/** Loads a race's Timeline once (pass null to skip). Retries while it fails or isn't written yet. */
export function useTimeline(raceId: string | null) {
  const [loaded, setLoaded] = useState<{ raceId: string; timeline: Timeline } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!raceId) return;
    let live = true;
    let timer = 0;
    const load = () =>
      fetchTimeline(raceId).then(
        (timeline) => {
          if (!live) return;
          if (timeline) setLoaded({ raceId, timeline });
          else timer = window.setTimeout(load, RETRY_MS);
        },
        (e: unknown) => {
          if (!live) return;
          setError(errorText(e));
          timer = window.setTimeout(load, RETRY_MS);
        },
      );
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [raceId]);
  const timeline = loaded?.raceId === raceId ? loaded.timeline : null;
  return { timeline, error: timeline ? null : error };
}
```

- [ ] **Step 3: Check and commit**

Run: `npm run typecheck && npm run lint && npm test`, clean. (Exercised end to end in Tasks 9–11.)

```bash
git add src/net/rooms.ts src/net/useTimeline.ts
git commit -m "feat(net): load a race timeline once"
```

---

### Task 9: Big screen running and podium

**Files:**
- Modify: `src/track/TrackPage.tsx` (`RunningBoard`, `PodiumBoard`, imports)

- [ ] **Step 1: RunningBoard.** Replace the function, keeping the auto-finish effect as is:

```tsx
function RunningBoard({ room, players, race, act, busy }: BoardProps) {
  const left = useSecondsLeft(race?.ends_at ?? null);
  const { timeline, error } = useTimeline(race?.id ?? null);
  const names = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p.name])), [players]);
  const asked = useRef(false);
  useEffect(() => {
    if (left > 0 || asked.current) return;
    asked.current = true;
    // The browser clock can run ahead of the DB: retry while the server says not yet.
    const tryFinish = () =>
      act(() =>
        finishRace(room.id).catch((e: unknown) => {
          if (!(e instanceof Error && e.message === 'race_not_finished')) throw e;
          setTimeout(tryFinish, 2000);
        }),
      );
    tryFinish();
  }, [left, act, room.id]);
  return (
    <section>
      {timeline && race?.started_at ? (
        <RaceView timeline={timeline} startAtMs={gunMs(race.started_at)} names={names} />
      ) : (
        <p>{error ?? 'Loading the race…'}</p>
      )}
      {left === 0 && (
        <button type="button" disabled={busy} onClick={() => act(() => finishRace(room.id))}>
          Show results
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 2: PodiumBoard.** Add silk swatches, finish times and a biggest-win line:

```tsx
function PodiumBoard({ room, players, race, bets, act, busy }: BoardProps) {
  const { timeline } = useTimeline(race?.id ?? null);
  const top3 = (race?.finish_order ?? []).slice(0, 3);
  const winners = bets
    .filter((b) => (b.payout ?? 0) > 0)
    .sort((a, b) => (b.payout ?? 0) - (a.payout ?? 0));
  const best = winners[0];
  return (
    <section>
      <h1>Results</h1>
      <ol className="podium">
        {top3.map((id) => (
          <li key={id}>
            <Silk lane={(race?.horses ?? []).indexOf(id)} /> {nameOf(players, id)}
            {timeline && ` · ${timeline.finishTimes[id]?.toFixed(2)} s`}
          </li>
        ))}
      </ol>
      {race?.prize && top3.length > 0 && (
        <p>
          🏆 {nameOf(players, top3[0])}: {race.prize}
        </p>
      )}
      <h2>Payouts</h2>
      {best && (
        <p>
          🎉 Biggest win: {nameOf(players, best.player_id)} won {best.payout} on{' '}
          {nameOf(players, best.horse_id)}
        </p>
      )}
      {winners.length === 0 ? (
        <p>No winning bets.</p>
      ) : (
        <ul>
          {winners.map((b) => (
            <li key={b.id}>
              {nameOf(players, b.player_id)} won {b.payout} on {nameOf(players, b.horse_id)} (
              {b.kind})
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => act(() => setPhase(room.id, 'LOBBY'))}
      >
        Next race
      </button>
    </section>
  );
}
```

- [ ] **Step 3: Imports.** In `TrackPage.tsx`, add `useMemo` to the React import, and add:

```ts
import { useTimeline } from '../net/useTimeline.ts';
import { RaceView, Silk } from '../render/RaceView.tsx';
import { gunMs } from '../sim/playback.ts';
```

- [ ] **Step 4: Check and commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`, all clean.

```bash
git add src/track/TrackPage.tsx
git commit -m "feat(track): play the race and dress the podium"
```

---

### Task 10: Phone mini view

**Files:**
- Create: `src/play/MiniOval.tsx`
- Modify: `src/play/PlayPage.tsx` (`RunningPanel`, its call site, imports)

- [ ] **Step 1: MiniOval.** `src/play/MiniOval.tsx`:

```tsx
import { colorsOf } from '../render/palette.ts';
import { TRACK, finishS, horsePoint, trackBounds, trackPoint } from '../render/track.ts';
import { progressAt } from '../sim/playback.ts';
import type { HorseId, Timeline } from '../sim/types.ts';

const PAD = 10;

/** Top-down dots on the oval; `mine` is drawn last, bigger and outlined. */
export function MiniOval({ timeline, t, mine }: { timeline: Timeline; t: number; mine: HorseId }) {
  const lanes = timeline.horses.length;
  const width = lanes * TRACK.laneWidth;
  const { halfWidth, halfHeight } = trackBounds(TRACK, lanes);
  const path = Array.from({ length: 121 }, (_, i) =>
    trackPoint(TRACK, (i / 120) * TRACK.lap, width / 2),
  )
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const f0 = trackPoint(TRACK, finishS(TRACK), 0);
  const f1 = trackPoint(TRACK, finishS(TRACK), width);
  const dots = timeline.horses
    .map((id, lane) => ({
      id,
      lane,
      p: horsePoint(TRACK, timeline.distance, progressAt(timeline, id, t), lane),
    }))
    .sort((a, b) => Number(a.id === mine) - Number(b.id === mine));
  return (
    <svg
      className="mini"
      viewBox={`${-halfWidth - PAD} ${-halfHeight - PAD} ${2 * (halfWidth + PAD)} ${2 * (halfHeight + PAD)}`}
      role="img"
      aria-label="Race positions"
    >
      <path d={path} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={width + 4} />
      <line x1={f0.x} y1={f0.y} x2={f1.x} y2={f1.y} stroke="currentColor" strokeWidth={3} />
      {dots.map(({ id, lane, p }) => (
        <circle
          key={id}
          cx={p.x}
          cy={p.y}
          r={id === mine ? 14 : 8}
          fill={colorsOf(lane).silk}
          stroke={id === mine ? 'currentColor' : 'none'}
          strokeWidth={4}
        />
      ))}
    </svg>
  );
}
```

- [ ] **Step 2: RunningPanel.** Replace it in `PlayPage.tsx`:

```tsx
function RunningPanel({ players, race, bets, mine }: PanelProps) {
  const { timeline, error } = useTimeline(race?.id ?? null);
  const t = useRaceTime(race?.started_at ? gunMs(race.started_at) : 0);
  if (!timeline || !race?.started_at) return <p>{error ?? 'Loading the race…'}</p>;
  const order = standingsAt(timeline, t);
  const last = Math.max(...Object.values(timeline.finishTimes));
  const myBets = bets.filter((b) => b.player_id === mine.id);
  return (
    <>
      <p>
        {t < 0
          ? `🏁 Starting in ${Math.ceil(-t)}…`
          : t > last
            ? 'All home! Results in a moment…'
            : "🏇 And they're off!"}
      </p>
      <MiniOval timeline={timeline} t={t} mine={mine.id} />
      {t >= 0 && timeline.horses.includes(mine.id) && (
        <p>You: {ordinal(order.indexOf(mine.id) + 1)}</p>
      )}
      {t >= 0 && myBets.length > 0 && (
        <ul>
          {myBets.map((b) => {
            const place = order.indexOf(b.horse_id);
            const winning = b.kind === 'win' ? place === 0 : place < 3;
            return (
              <li key={b.id}>
                {winning ? '✅' : '⏳'} {b.stake} on {nameOf(players, b.horse_id)} to {b.kind}:{' '}
                {ordinal(place + 1)} now
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
```

Change the call site to `{room.phase === 'RUNNING' && <RunningPanel {...props} />}`.

- [ ] **Step 3: Imports.** Add to `PlayPage.tsx`:

```ts
import { useTimeline } from '../net/useTimeline.ts';
import { useRaceTime } from '../render/useRaceTime.ts';
import { gunMs, standingsAt } from '../sim/playback.ts';
import { MiniOval } from './MiniOval.tsx';
```

Remove the `useSecondsLeft` import if nothing else in the file uses it (typecheck reports it as unused).

- [ ] **Step 4: Check and commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`, all clean. Run Prettier on the touched files only: `npx prettier --write src/play/MiniOval.tsx src/play/PlayPage.tsx`.

```bash
git add src/play/MiniOval.tsx src/play/PlayPage.tsx
git commit -m "feat(play): mini oval and live bet status while racing"
```

---

### Task 11: Multi-device smoke test and docs

- [ ] **Step 1: Smoke test (4 origins, Short race).** Same setup as Phase 3:
  - big screen on `http://localhost:5173`
  - phones Ali, Bea and Cal on `127.0.0.1`, `a.localhost` and `b.localhost`
  - plus a host-typed horse, Siti, so 4 horses race and Place is offered

  Play: Ali buys a Speed box, lock odds, Cal bets Win on Siti and Place on Ali, then Start. Check each of these:
  1. Big screen: countdown with box dots, then the race plays to the finish line in front of the stands. Standings and popups are live.
  2. Phones: "Starting in…", the mini oval with their own dot outlined, live bet lines (✅/⏳), and "All home!" after the last finish.
  3. **Reload a phone mid-race:** it resumes at the same point (positions match the big screen within ~1 s).
  4. **Reload the big screen mid-race:** it resumes; no second Start happens.
  5. PODIUM arrives only after the hold, and no phone shows a payout before it.
  6. Podium: silk swatches, finish times, prize line, biggest win; phones show their result and balance.
  7. Next race → LOBBY → Open shop works again; a 3-horse race still plays (no Place offered).
  8. No console errors on any origin.
- [ ] **Step 2: Full checks:** `npm test`, `npm run test:db`, `npm run typecheck`, `npm run lint`, `npm run build`.
- [ ] **Step 3: Docs.**
  - `README.md` Layout: add `render/` (track, camera, renderer; canvas + SVG) and note `/sandbox` plays a local race.
  - `PROJECT_STATUS.md`: tick Phase 4 tasks. Add a 2026-10-30 log entry with decisions, check counts and smoke-test results. Add deferred items: cheers, server clock offset, generic track path, and that the result is readable in the DB during RUNNING (UI-only spoiler guard, from Phase 3). Set "Next: Phase 5 (Office mode)".
- [ ] **Step 4: Commit**

```bash
git add README.md PROJECT_STATUS.md
git commit -m "docs: Phase 4 status and notes"
```
