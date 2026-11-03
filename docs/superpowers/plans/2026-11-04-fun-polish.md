# Fun Polish (commentator, random boxes, sprite angles) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three changes the owner asked for after Phase 7 (2026-11-04):
1. **A funnier commentator.** More varied lines, item jokes, drama calls, crowd reactions, an intro and podium banter. Plain English only, with no local slang.
2. **Fully random box spots.** Each lane gets its own spots, anywhere from 10% to 90% of the race, so every horse's powerups fire at different times.
3. **More sprite angles.** Besides the left and right side views, horses get a 3/4 view from behind (running away) and one from the front (running toward the camera), plus a gallop bob.

**Architecture:**
- **Boxes:** only `placeBoxes` (`src/sim/boxes.ts`) and `BOX_ZONE` (`src/sim/config.ts`) change. This changes race outcomes, so the 10,000-race balance suite must pass again.
- **Commentator:**
  - `createCommentator` gains line pools, picked with an injected `rand` so tests stay deterministic, plus new triggers.
  - A new pure `podiumLine` supplies the podium banter.
  - `useRaceAudio` passes in the odds, the prize and the recent cheer count.
- **Sprites:** a pure `poseOf(dx, dy)` picks the pose from the on-screen running direction, and `drawHorse` draws that pose.

**Tech Stack:** TypeScript, Canvas 2D, Web Speech, Vitest.

---

## Scope decisions

- **Boxes**
  - Spots are uniformly random in [10%, 90%] of the distance, sorted, with at least 3% of the distance between two boxes in the same lane.
  - The most boxes a lane can hold is 8, needing 7 gaps × 3% = 21%, which fits easily in the 80% zone.
  - Box kinds are still shuffled.
  - Every lane uses the same rule, so it stays fair; lanes differ only by chance.
- **Balance gate**
  - `npm run test:balance` must stay green: 3 bought Speed ≤ 18%, 3 Attack ≤ 13%, equal fields 10% ± 1%, plus the winner-time and finish checks.
  - If it fails, **stop and report the numbers**. Do not retune items without the owner.
- **Commentator tone:** playful and family-friendly. Each line is picked at random from its pool.
  - **Ordinary lines** respect the 4 s minimum gap: lead changes, item jokes, crowd and "neck and neck".
  - **Big moments** ignore the gap: Golden Lasso, Thunderclap, Stampede, the start, the stretch and the finish.
  - **New triggers:**
    - **Intro** at t = −4, only when the commentator was created before then.
    - **Outsider lead:** a horse with Win odds of 8× or more takes the lead.
    - **Item jokes** for these events:
      - Banana Peel, Horseshoe Toss, Dust Kick and Mud Cloud hits;
      - Hornet Swarm, said once per swarm;
      - Snack Break, Sleepy Jockey and Stumble pickups;
      - Thunder Hooves and Carrot pickups;
      - Mirror Saddle reflections;
      - Lucky Bubble and Shield blocks.
    - **Neck and neck:** said once, when the top two are within 1.5 m after 70% of the winner's time.
    - **Crowd:** when 3 or more cheers are on screen, at most once every 15 s.
    - **Winner prefixes:** "Photo finish!" and "From last to first!", using `raceAwards` from `src/sim/awards.ts`.
  - **Podium banter** comes from `podiumLine`. The big screen says it once, on the podium.
- **Sprite poses**
  - The four poses are `side-right`, `side-left`, `away` (3/4 from behind) and `toward` (3/4 from the front).
  - **How the pose is chosen:**
    - Take the screen-space step from the horse now to the point 1 m ahead.
    - If |dy| > |dx|, use `away` when dy < 0 (moving up the screen) and `toward` when dy > 0.
    - Otherwise use a side view facing the sign of dx.
  - **Gallop bob:** 1 px up on odd gallop frames, in every pose.
  - **Drawing:** all poses stay code-drawn, about 8–16 px wide by 14–17 px tall at size 1. The 2× size used when zoomed in still applies.

---

### Task 1: Random box spots

**Files:**
- Modify `src/sim/config.ts`, `src/sim/boxes.ts`, `src/sim/boxes.test.ts`.
- Possibly modify seed-dependent tests in `src/sim/*.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `src/sim/boxes.test.ts` (import `BOX_MIN_GAP` from `./config.ts`):

```ts
describe('placeBoxes spread', () => {
  it('keeps every box in 10-90% with at least BOX_MIN_GAP between neighbours', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const lanes = placeBoxes(createSeededRng(seed), horses, bought, 1800);
      for (const lane of Object.values(lanes)) {
        const at = lane.map((s) => s.at);
        expect(Math.min(...at)).toBeGreaterThanOrEqual(1800 * 0.1);
        expect(Math.max(...at)).toBeLessThanOrEqual(1800 * 0.9);
        for (let i = 1; i < at.length; i++) {
          expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(1800 * BOX_MIN_GAP - 0.01);
        }
      }
    }
  });

  it('really is random: first boxes land anywhere early, lanes differ', () => {
    const firsts: number[] = [];
    for (let seed = 1; seed <= 300; seed++) {
      const lanes = placeBoxes(createSeededRng(seed), horses, {}, 1800);
      firsts.push(lanes.a![0]!.at);
      expect(lanes.a!.map((s) => s.at)).not.toEqual(lanes.b!.map((s) => s.at));
    }
    // Even slots kept lane a's first box inside ~10-17% of the race; now it spreads much wider.
    expect(Math.max(...firsts)).toBeGreaterThan(1800 * 0.3);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/sim/boxes.test.ts`. It should FAIL.
- [ ] **Step 3: Implement.** In `src/sim/config.ts`:

```ts
/** Boxes sit between these fractions of the race distance (owner 2026-11-04: 10-90%, fully random). */
export const BOX_ZONE = { start: 0.1, end: 0.9 } as const;
/** Minimum spacing between two boxes in one lane, as a share of the distance. */
export const BOX_MIN_GAP = 0.03;
```

  In `src/sim/boxes.ts`, replace the placement. Import `BOX_MIN_GAP` too.

```ts
/**
 * Spots are uniformly random inside the box zone, sorted, and at least BOX_MIN_GAP apart (draw
 * n offsets in the zone minus the gaps, sort, then add i gaps). Lanes are independent, so every
 * horse's boxes fire at different times. Bought boxes take random places among the mystery ones.
 */
export function placeBoxes(
  rng: Rng,
  horses: readonly HorseId[],
  bought: Readonly<Record<HorseId, readonly BoxType[]>>,
  distance: number,
): Record<HorseId, BoxSpot[]> {
  const lanes: Record<HorseId, BoxSpot[]> = {};
  const start = distance * BOX_ZONE.start;
  const span = distance * (BOX_ZONE.end - BOX_ZONE.start);
  const gap = distance * BOX_MIN_GAP;
  for (const id of horses) {
    const kinds: BoxKind[] = [
      ...Array.from({ length: MYSTERY_PER_LANE }, (): BoxKind => 'mystery'),
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
```

- [ ] **Step 4:** Run `npm test`. Tests that pin outcomes to a specific seed may now fail, because the random draws changed.
  - Update a failing test only by re-finding a seed that reproduces the same *scenario*, such as a seed where a Golden Lasso happens.
  - Never loosen what a test asserts.
- [ ] **Step 5: Balance gate.**
  - Run `npm run test:balance`. It takes minutes, so run it in the background and wait.
  - It must pass 8/8.
  - Record the reported shares for both lengths: equal field, 3 Speed, 3 Attack and winner time.
  - If anything fails, STOP and report the numbers. Don't change item values.
- [ ] **Step 6:**
  - Run `npm run test:db`. These tests use the real sim through the Edge Functions, which hot-reload.
  - Then `git add src/sim && git commit -m "feat(sim): fully random box spots between 10% and 90%"`

---

### Task 2: A funnier commentator

**Files:**
- Create `src/audio/lines.ts`.
- Modify `src/audio/commentator.ts`, `src/audio/commentator.test.ts`, `src/audio/useRaceAudio.ts`, `src/track/TrackPage.tsx`.

- [ ] **Step 1: Line pools.** Create `src/audio/lines.ts`:

```ts
/** Commentary lines (owner 2026-11-04: fun, plain English). Index 0 of each pool is what tests pick. */
export const LINES = {
  intro: [
    'Welcome to the Turf Club! {n} horses at the gate.',
    'Ladies and gentlemen, {n} runners are ready to go!',
    '{n} horses, one big prize. Here we go!',
  ],
  prize: ["Today's prize: {p}!", 'They are racing for {p}!'],
  off: ["And they're off!", "The gates open and they're away!", 'Here we go! The race is on!'],
  lead: [
    '{h} takes the lead!',
    '{h} hits the front!',
    "And now it's {h} in front!",
    '{h} has had enough of the view from behind!',
    '{h} grabs the lead!',
  ],
  outsider: [
    'The {o}-to-1 outsider {h} hits the front! Who saw that coming?',
    'Long shot alert! {h} at {o}-to-1 leads the field!',
  ],
  lasso: [
    'Golden Lasso! {by} stops {v}!',
    'Yee-haw! {by} lassoes the leader, and {v} is going nowhere!',
    'Golden Lasso from {by}! {v} grinds to a halt!',
  ],
  thunderclap: ['Thunderclap from {h}!', 'Ka-boom! {h} rattles the whole field!'],
  stampede: [
    '{h} stampedes through the field!',
    'Make way! {h} is charging through!',
    'Stampede! {h} bulldozes past the pack!',
  ],
  banana: ['{v} slips on a banana! Who left that there?', 'Banana peel! {v} goes for a skid!'],
  horseshoe: ['A horseshoe bounces off {v}! Ouch!', '{by} lobs a horseshoe at {v}!'],
  mess: ['{by} kicks up a storm!', 'Mud everywhere! {by} makes a mess of it!'],
  hornets: [
    'Hornets! The leaders are swatting for their lives!',
    'Here come the hornets! Bad day to be in front!',
  ],
  snack: ['{h} stops for a snack! Priorities!', 'Snack break for {h}! Right now? Really?'],
  sleepy: ["{h}'s jockey is nodding off!", "Wake up! {h}'s jockey is half asleep!"],
  trip: ['{h} trips over absolutely nothing!', 'Whoops! {h} stumbles!'],
  thunderHooves: ['Thunder Hooves! {h} takes off!', '{h} finds another gear!'],
  carrot: ['{h} munches a carrot and speeds up!', 'Carrot power for {h}!'],
  reflect: ['Mirror Saddle! {h} bounces it straight back at {by}!', 'Return to sender! {h} sends it back to {by}!'],
  bubble: ['{h} is safe in the Lucky Bubble!', "It bounces right off {h}'s bubble!"],
  shield: ['Shield up! {h} shrugs it off!', 'Blocked! {h} saw that coming!'],
  neck: ['Neck and neck between {a} and {b}!', 'Nothing in it! {a} and {b} side by side!'],
  crowd: ['Listen to that crowd!', 'The office is on its feet!', 'What an atmosphere in here!'],
  stretch: ['Into the final stretch!', 'Here comes the home straight!', 'They turn for home!'],
  photo: ['Photo finish! '],
  comeback: ['From last to first! '],
  win: ['{w} wins it!', '{w} takes the crown!', "And it's {w}! What a race!"],
  podiumRest: [' {b} second, {c} third.'],
  noBets: ['No bets this time. Next race!'],
  noWinners: ['No winners! The bookie keeps it all!', 'Ouch, nobody backed that one!'],
  bigWin: ['{h} cashes in {n} coins!', 'Big winner: {h} with {n} coins!'],
} as const;

export type Rand = () => number;

/** A random line from `pool` with {key} placeholders filled. */
export function line(pool: readonly string[], vars: Record<string, string | number>, rand: Rand): string {
  const text = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}
```

- [ ] **Step 2: Failing tests.** Update `src/audio/commentator.test.ts`.
  - Every `createCommentator` call passes `rand: () => 0`, which picks index 0 of each pool.
  - Keep the existing scenarios. Where a test now listens from before −4 s, add the intro lines to its expectations.
  - Add:

```ts
  it('introduces the field before the gun (only when listening from before -4 s)', () => {
    const com = createCommentator(overtake(), name, -Infinity, { ...opts, rand: () => 0, prize: 'Lunch' });
    expect(com.linesUpTo(-3.9)).toEqual(['Welcome to the Turf Club! 3 horses at the gate.', "Today's prize: Lunch!"]);
  });

  it('jokes about items, but respects the gap for ordinary lines', () => {
    const events: RaceEvent[] = [
      { t: 4, type: 'hit', horse: 'a', by: 'c', item: 'attack:behind1' },
      { t: 4.5, type: 'pickup', horse: 'b', kind: 'mystery', item: 'dud:stop' },
    ];
    const com = createCommentator(overtake(events), name, 0, { ...opts, rand: () => 0 });
    expect(com.linesUpTo(4.6)).toEqual(['A slips on a banana! Who left that there?']);
  });

  it('calls an outsider taking the lead with its odds', () => {
    const com = createCommentator(overtake(), name, 0, { ...opts, rand: () => 0, odds: { a: { win: 12 } } });
    expect(com.linesUpTo(8)[0]).toBe('The 12-to-1 outsider A hits the front! Who saw that coming?');
  });

  it('reacts to the crowd at most every 15 s', () => {
    const com = createCommentator(overtake(), name, 0, { ...opts, rand: () => 0 });
    expect(com.linesUpTo(1, 3)).toContain('Listen to that crowd!');
    expect(com.linesUpTo(6, 5)).not.toContain('Listen to that crowd!');
  });

  it('podium banter', () => {
    const r = () => 0;
    expect(podiumLine([], 0, r)).toBe('No bets this time. Next race!');
    expect(podiumLine([], 3, r)).toBe('No winners! The bookie keeps it all!');
    expect(podiumLine([{ name: 'Cal', payout: 63 }, { name: 'Ali', payout: 10 }], 4, r)).toBe('Cal cashes in 63 coins!');
  });
```

  About the `overtake()` fixture: b leads early, a passes at about 6.7 s and wins at 10 s, and c trails. Item jokes need `t - lastLineAt >= 4`. With `startT = 0`, nothing has been said yet, so the banana is said and the snack 0.5 s later isn't. If a sample time is off by a tick, fix the time, not the rules.

- [ ] **Step 3: Implement** in `src/audio/commentator.ts`.
  - The signature becomes `createCommentator(timeline, name, startT = -Infinity, opts)`, where `opts` is `{ finalStretchMetres?, rand? = Math.random, odds?: Readonly<Record<HorseId, { win: number } | undefined>>, prize? }`. The method becomes `linesUpTo(t, cheersOnScreen = 0)`.
  - **Rules** are as in the scope decisions:
    - Every sentence comes from `LINES` via `line(...)`.
    - Outsider odds are rounded to whole numbers.
    - `raceAwards(timeline)` is computed once, for the photo and comeback prefixes.
    - A hornet swarm (all `attack:top3` hits at the same `t`) is said once.
  - Export `podiumLine(winners: { name: string; payout: number }[], betCount: number, rand: Rand = Math.random)`, with `winners` sorted by payout descending.
- [ ] **Step 4: Wiring.**
  - **`useRaceAudio`:** its opts gain `odds`, `prize` and `cheers?: () => number`, all read through the existing `optsRef`. Pass them to `createCommentator`, and call `linesUpTo(t, optsRef.current.cheers?.() ?? 0)`.
  - **`TrackPage` `RunningBoard`:** pass `odds: oddsOf(race)`, `prize: race?.prize ?? ''` and `cheers: () => shownRef.current.length`, keeping a ref to the shown cheers.
  - **`PodiumBoard`:** in a `useEffect` keyed on the race id, wait about 3 s so it doesn't talk over the winner line. Then call `soundEngine().say(podiumLine(...))` once, with the winners sorted by payout and `bets.length`, and clear the timer on unmount.
- [ ] **Step 5:**
  - Run `npm test`, typecheck, lint and build.
  - Then `git add src/audio src/track && git commit -m "feat(audio): a funnier commentator with varied lines, item jokes and podium banter"`

---

### Task 3: More sprite angles

**Files:** Modify `src/render/sprites.ts`, `src/render/Pixel2DRenderer.ts`. Create `src/render/sprites.test.ts`.

- [ ] **Step 1: Failing test** `src/render/sprites.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { poseOf } from './sprites.ts';

describe('poseOf', () => {
  it('uses side views when running mostly sideways', () => {
    expect(poseOf(5, 1)).toBe('side-right');
    expect(poseOf(-5, -1)).toBe('side-left');
  });
  it('uses 3/4 views when running mostly up or down the screen', () => {
    expect(poseOf(1, -5)).toBe('away');
    expect(poseOf(-1, 5)).toBe('toward');
  });
});
```

- [ ] **Step 2:** Run it. It should FAIL.
- [ ] **Step 3: Implement** in `src/render/sprites.ts`:

```ts
export type Pose = 'side-right' | 'side-left' | 'away' | 'toward';

/** Pose from the on-screen running direction (y grows downward). */
export function poseOf(dx: number, dy: number): Pose {
  if (Math.abs(dy) > Math.abs(dx)) return dy < 0 ? 'away' : 'toward';
  return dx >= 0 ? 'side-right' : 'side-left';
}
```

  `drawHorse(ctx, x, y, colors, frame, facing, size)` becomes `drawHorse(ctx, x, y, colors, frame, pose, size)`.
  - **Side views:** keep the current drawing. `side-left` mirrors it, as `facing = -1` did.
  - **Gallop bob:** in all poses the sprite rises 1 px on odd frames.
  - **`away`** (3/4 rear, hooves at y = 0, `lift = frame % 2`):

```ts
px(-3, -4 + lift, 1, 4 - lift, coat);            // near hind leg
px(2, -3 - lift, 1, 3 + lift, coat);             // far hind leg (alternates)
px(-3, -9, 7, 5, coat);                          // rump and back
px(0, -8, 1, 4, mane);                           // tail
px(-2, -13, 5, 4, silk);                         // jockey's back
px(-1, -15, 3, 2, silk);                         // cap
```

  - **`toward`** (3/4 front):

```ts
px(-3, -4 + lift, 1, 4 - lift, coat);            // forelegs (alternate)
px(2, -3 - lift, 1, 3 + lift, coat);
px(-3, -9, 7, 5, coat);                          // chest and shoulders
px(-1, -13, 3, 4, coat);                         // head facing us
px(-1, -14, 3, 1, mane);                         // forelock
px(-3, -15, 7, 3, silk);                         // jockey behind the head
px(-1, -17, 3, 2, silk);                         // cap
```

  These are starting points. Tune the pixels until they read clearly at size 1 and 2 in `/sandbox`.
- [ ] **Step 4: Renderer.** In `Pixel2DRenderer.ts`, where `facing` is computed:
  - Use the screen-space points `screen(here)` and `screen(ahead)`, call `poseOf(sx2 - sx1, sy2 - sy1)`, and pass the pose to `drawHorse`.
  - Horses coasting past the line use the same rule.
  - If a horse flips between poses near the threshold, add hysteresis: keep the previous pose unless the new ratio clears it by 20%, in a per-horse map on the renderer.
- [ ] **Step 5:**
  - Run `npm test`, typecheck, lint and build.
  - Check the sprites visually: run `npm run dev`, open `/sandbox` and watch a race. The bends should show the rear and front views and the straights the side views, with no flicker. Stop the server afterwards.
  - Then `git add src/render && git commit -m "feat(render): 3/4 rear and front horse views on the bends, gallop bob"`

---

### Task 4: Docs and deploy

- [ ] **`PROJECT_STATUS.md`:** add a 2026-11-04 "Fun polish" entry covering:
  - what changed;
  - the new balance numbers next to the old ones, for both lengths;
  - review fixes and checks.
- [ ] **Commit** `docs: fun polish status`.
- [ ] **Deploy** after merge, with the owner's go-ahead.
  - `start-race` and `lock-odds` import `src/sim`, so **redeploy both functions first**: `npx supabase functions deploy lock-odds start-race`. That way the odds and the race use the new box placement.
  - Then push `master`. There are no migrations.
