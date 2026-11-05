# Hot Items and Horse Traits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every race buffs 3 random powerups ("hot items": 🍀 Lucky = 2× as likely from its box, ⏱️ Extended = lasts 50 % longer), rolled when the shop opens, and every phone player picks one of six horse traits for this race in the shop. Both are priced into the odds, shown on every screen, and the hot items have an office on/off switch.

**Architecture:** Two new optional sim inputs, `RaceInput.hot` and `RaceInput.traits`. With no hot items and all-Normal traits the engine makes exactly the same RNG draws as today (fingerprint test), so old replays are bit-identical. Hot items are rolled in SQL when `set_phase` opens the shop (`races.hot_items`); traits live on `room_players.trait` and are snapshotted onto `races.traits` when `lock_odds_begin` closes the shop. `private.race_input` returns both, `lock-odds` and `start-race` pass them to the sim, and the timeline records them for playback and replays.

**Tech Stack:** TypeScript strict (`.ts` imports, `noUncheckedIndexedAccess`), Vitest, Supabase (Postgres migrations, Deno Edge Functions bundling `src/sim`), React 19, Three.js 0.187 (HD-2D), Canvas 2D.

**Specs:** `docs/superpowers/specs/2026-11-05-hot-items-design.md` (sub-project C), `docs/superpowers/specs/2026-11-05-horse-traits-design.md` (sub-project D). One plan, one migration, one deploy.

**Commands:** `npm test` (unit), `npm run test:balance` (the slow 10,000-race suites), `npm run typecheck`, `npm run lint`, `npm run test:db` (needs `npx supabase start`), `npm run build`. Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not `prettier --write` whole folders (it rewrites line endings on unrelated files); format only files you touched.

**Fingerprint:** `src/sim/simulate.test.ts` already pins today's clear race at `2438717223` (helper `fingerprint`, five seeds, 12 horses, `bought: { h0: ['speed', 'attack'] }`, short). Every determinism test below reuses that literal.

---

## File structure

| File | Responsibility |
|---|---|
| `src/sim/types.ts` (modify) | `HotBuff`, `HotItem`, `Trait`; optional `RaceInput.hot/traits`, `Timeline.hot/traits`, pickup `hot` flag |
| `src/sim/config.ts` (modify) | `HOT`, `TRAIT_CODES`, `TRAITS` numbers |
| `src/sim/hot.ts` (create) | `HOT_ELIGIBLE`, `effectSeconds`, `buffOf` (pure, shared by sim and render) |
| `src/sim/traits.ts` (create) | `toughen`, `kickBoostOf`, `kickExtraSecondsOf`, `earlyPaceOf` (pure) |
| `src/sim/items.ts` (modify) | Lucky weights in `rollBox`/`rollAttack`; Charmed dud re-roll and no rare upgrades |
| `src/sim/simulate.ts` (modify) | validation, Extended durations, pickup flag, Tough / Sprinter / Stayer / Mudder |
| `src/sim/odds.ts` (modify) | `simulateShares` averages only horses with the same boxes **and** trait |
| `src/sim/balance.slow.test.ts` (modify) | trait win shares within ±15 % of Normal's |
| `supabase/migrations/20261105000021_hot_items_traits.sql` (create) | columns, `private.roll_hot_items`, `set_phase` v6, `lock_odds_begin` v2, `race_input` v4, `set_trait`, `admin_set_hot_items`, `admin_overview` v3 |
| `tests/db/hotTraits.test.ts` (create), `tests/db/functions.test.ts` (modify) | DB and Edge Function tests |
| `src/net/database.types.ts` (regenerated) | new columns and RPCs |
| `supabase/functions/_shared/http.ts`, `lock-odds/index.ts`, `start-race/index.ts`, `admin/index.ts` (modify) | pass `hot`/`traits`; admin action `hot_items` |
| `src/app/HotItems.tsx` (create) | `hotOf`, `hotText`, `hotBoxTypes`, `HotStrip` |
| `src/app/Traits.tsx` (create) | `TRAIT_INFO`, `traitLabel`, `asTrait`, `traitOf`, `TRAIT_LEGEND`, `TraitIcon` |
| `src/play/TraitPicker.tsx` (create) | the phone's "Your trait" buttons |
| `src/net/rooms.ts`, `src/play/PlayPage.tsx`, `src/app/app.css` (modify) | `setTrait`, strip, 🔥 buttons, picker, read-only trait |
| `src/track/TrackPage.tsx`, `src/admin/AdminPage.tsx`, `src/render/RaceView.tsx`, `src/history/StatsPage.tsx` (modify) | boards, admin switch, standings icons, replay strip |
| `src/render/items.ts`, `Pixel2DRenderer.ts`, `hd2d/HD2DRenderer.ts`, `hd2d/effects.ts` (modify) | 🔥 popups and held icons, Extended effect durations |
| `src/audio/lines.ts`, `commentator.ts` (modify) | hot-pickup and trait lines |
| `src/app/Sandbox.tsx` (modify) | hot-items picker, lane-1 trait picker |

---

### Task 1: Types, config and the pure hot/trait helpers

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/config.ts`
- Create: `src/sim/hot.ts`, `src/sim/traits.ts`
- Test: `src/sim/hot.test.ts`, `src/sim/traits.test.ts`

- [ ] **Step 1: Add the types** in `src/sim/types.ts`.

After `export type Weather = 'clear' | 'rain' | 'fog';` add:

```ts
/** Hot-item buffs (spec 2026-11-05 C): 2× as likely from its box, or 50 % longer. */
export type HotBuff = 'lucky' | 'extended';
/** Horse traits (spec 2026-11-05 D), picked per race on the phone. */
export type Trait = 'normal' | 'charmed' | 'tough' | 'sprinter' | 'stayer' | 'mudder';
```

After the `ItemCode` union (before `export interface RaceInput`) add:

```ts
export interface HotItem {
  readonly item: ItemCode;
  readonly buff: HotBuff;
}
```

In `RaceInput`, after `readonly weather?: Weather;` add:

```ts
  /** Spec C: up to 3 buffed items; missing or empty = none (no extra RNG draws). */
  readonly hot?: readonly HotItem[];
  /** Spec D: per-horse trait; a horse missing from the map (or no map) runs Normal. */
  readonly traits?: Readonly<Record<HorseId, Trait>>;
```

In the `RaceEvent` union replace the pickup member

```ts
  | { t: number; type: 'pickup'; horse: HorseId; kind: BoxKind; item: ItemCode | null }
```

with

```ts
  /** `hot` is set only when the picked item is one of the race's hot items. */
  | { t: number; type: 'pickup'; horse: HorseId; kind: BoxKind; item: ItemCode | null; hot?: HotBuff }
```

In `Timeline`, after `readonly puddles?: readonly Puddle[];` add:

```ts
  /** Missing on timelines stored before hot items / traits existed: read as [] / all Normal. */
  readonly hot?: readonly HotItem[];
  readonly traits?: Readonly<Record<HorseId, Trait>>;
```

- [ ] **Step 2: Add the numbers** at the end of `src/sim/config.ts` (add `Trait` to its type import from `./types.ts`):

```ts
/** Hot items (spec 2026-11-05 C). Rolled in SQL (private.roll_hot_items) with the same rules. */
export const HOT = { count: 3, maxPerType: 2, luckyWeight: 2, extendedFactor: 1.5 } as const;

export const TRAIT_CODES = [
  'normal',
  'charmed',
  'tough',
  'sprinter',
  'stayer',
  'mudder',
] as const satisfies readonly Trait[];

/** Horse traits (spec 2026-11-05 D). Tuned by the balance test (Task 7); final values in PROJECT_STATUS. */
export const TRAITS = {
  /** This share of a Charmed horse's dud type rolls is rolled again without the dud (50 = half the duds). */
  charmed: { rerollPercent: 50 },
  /** Slowdowns keep `hitFactor` of their strength, boosts `boostFactor`; durations unchanged. */
  tough: { hitFactor: 0.7, boostFactor: 0.7 },
  /** `earlyPace` applies while progress < distance / 3; `kickBoost` replaces KICK.boost. */
  sprinter: { earlyPace: 1.04, kickBoost: 0.05 },
  stayer: { earlyPace: 0.97, kickBoost: 0.15, kickExtraSeconds: 1 },
  /** `bumpFactor` per Mudder in a fog pair; `clearPace` all race on a clear day. */
  mudder: { slipChancePercent: 5, bumpFactor: 0.5, clearPace: 0.985 },
} as const;
```

- [ ] **Step 3: Write the failing tests.**

`src/sim/hot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EFFECTS, HOT } from './config.ts';
import { buffOf, effectSeconds, HOT_ELIGIBLE } from './hot.ts';
import type { HotItem } from './types.ts';

const HOT_LIST: readonly HotItem[] = [
  { item: 'attack:leader', buff: 'extended' },
  { item: 'speed:self1', buff: 'lucky' },
  { item: 'speed:self3', buff: 'extended' },
];

describe('hot items', () => {
  it('lists the 14 non-dud items', () => {
    expect(HOT_ELIGIBLE).toHaveLength(14);
    expect(HOT_ELIGIBLE.some((i) => i.startsWith('dud:'))).toBe(false);
    expect(HOT_ELIGIBLE).toContain('speed:pass3');
    expect(HOT_ELIGIBLE).toContain('attack:all');
    expect(HOT_ELIGIBLE).toContain('defense:reflect');
  });

  it('Extended items last 1.5x; Lucky and cold items keep their seconds', () => {
    expect(effectSeconds('attack:leader', HOT_LIST)).toBe(
      EFFECTS['attack:leader'].seconds * HOT.extendedFactor,
    );
    expect(effectSeconds('attack:leader', HOT_LIST)).toBe(3);
    expect(effectSeconds('speed:self3', HOT_LIST)).toBe(2.25); // each Golden Carrot burst
    expect(effectSeconds('speed:self1', HOT_LIST)).toBe(2);
    expect(effectSeconds('speed:star', HOT_LIST)).toBe(3.5);
    expect(effectSeconds('speed:star')).toBe(3.5);
  });

  it('buffOf finds the buff of a hot item only', () => {
    expect(buffOf(HOT_LIST, 'speed:self1')).toBe('lucky');
    expect(buffOf(HOT_LIST, 'attack:leader')).toBe('extended');
    expect(buffOf(HOT_LIST, 'speed:star')).toBeUndefined();
    expect(buffOf(HOT_LIST, null)).toBeUndefined();
  });
});
```

`src/sim/traits.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KICK, TRAITS } from './config.ts';
import { earlyPaceOf, kickBoostOf, kickExtraSecondsOf, toughen } from './traits.ts';

describe('toughen', () => {
  it('weakens slowdowns and boosts by the Tough factors', () => {
    expect(toughen(0)).toBeCloseTo(1 - TRAITS.tough.hitFactor); // Golden Lasso 0 -> 0.3
    expect(toughen(0.5)).toBeCloseTo(1 - 0.5 * TRAITS.tough.hitFactor); // a rain slip
    expect(toughen(0.7)).toBeCloseTo(1 - 0.3 * TRAITS.tough.hitFactor); // a fog bump
    expect(toughen(1.2)).toBeCloseTo(1 + 0.2 * TRAITS.tough.boostFactor); // Carrot
    expect(toughen(1.8)).toBeCloseTo(1 + 0.8 * TRAITS.tough.boostFactor); // Stampede
    expect(toughen(1)).toBe(1);
  });
});

describe('pace and kick by trait', () => {
  it('Normal (and the traits that do not touch pace) are exactly the old numbers', () => {
    for (const t of ['normal', 'charmed', 'tough', 'mudder'] as const) {
      expect(earlyPaceOf(t)).toBe(1);
      expect(kickBoostOf(t)).toBe(KICK.boost);
      expect(kickExtraSecondsOf(t)).toBe(0);
    }
  });

  it('Sprinter starts fast and kicks less; Stayer the opposite, with a longer kick', () => {
    expect(earlyPaceOf('sprinter')).toBe(TRAITS.sprinter.earlyPace);
    expect(kickBoostOf('sprinter')).toBe(TRAITS.sprinter.kickBoost);
    expect(kickExtraSecondsOf('sprinter')).toBe(0);
    expect(earlyPaceOf('stayer')).toBe(TRAITS.stayer.earlyPace);
    expect(kickBoostOf('stayer')).toBe(TRAITS.stayer.kickBoost);
    expect(kickExtraSecondsOf('stayer')).toBe(TRAITS.stayer.kickExtraSeconds);
  });
});
```

- [ ] **Step 4: Run to see them fail**

Run: `npx vitest run src/sim/hot.test.ts src/sim/traits.test.ts`
Expected: FAIL, cannot resolve `./hot.ts` / `./traits.ts`.

- [ ] **Step 5: Implement.**

`src/sim/hot.ts`:

```ts
import { EFFECTS, HOT } from './config.ts';
import type { HotBuff, HotItem, ItemCode } from './types.ts';

/** The 14 items that can be hot: every non-dud item (spec C). Mirrored in private.roll_hot_items. */
export const HOT_ELIGIBLE: readonly ItemCode[] = (Object.keys(EFFECTS) as ItemCode[]).filter(
  (i) => !i.startsWith('dud:'),
);

/** The race's buff on `item`, if it is hot. */
export const buffOf = (hot: readonly HotItem[], item: ItemCode | null): HotBuff | undefined =>
  item ? hot.find((x) => x.item === item)?.buff : undefined;

/** An item's effect seconds in this race: an Extended item lasts HOT.extendedFactor longer. */
export const effectSeconds = (item: ItemCode, hot: readonly HotItem[] = []): number =>
  EFFECTS[item].seconds * (buffOf(hot, item) === 'extended' ? HOT.extendedFactor : 1);
```

(`× 1` is exact in IEEE floats, so cold items keep bit-identical seconds.)

`src/sim/traits.ts`:

```ts
import { KICK, TRAITS } from './config.ts';
import type { Trait } from './types.ts';

/** Tough (spec D): a slowdown m < 1 or boost m > 1 keeps only part of its strength. */
export function toughen(mult: number): number {
  if (mult < 1) return 1 - (1 - mult) * TRAITS.tough.hitFactor;
  if (mult > 1) return 1 + (mult - 1) * TRAITS.tough.boostFactor;
  return mult;
}

/** Pace factor while the horse is in the first third of the race. */
export const earlyPaceOf = (t: Trait): number =>
  t === 'sprinter' ? TRAITS.sprinter.earlyPace : t === 'stayer' ? TRAITS.stayer.earlyPace : 1;

/** Finishing-kick boost (KICK.boost for everyone but Sprinter and Stayer). */
export const kickBoostOf = (t: Trait): number =>
  t === 'sprinter' ? TRAITS.sprinter.kickBoost : t === 'stayer' ? TRAITS.stayer.kickBoost : KICK.boost;

/** Extra kick seconds (Stayer). */
export const kickExtraSecondsOf = (t: Trait): number =>
  t === 'stayer' ? TRAITS.stayer.kickExtraSeconds : 0;
```

- [ ] **Step 6: Verify**

Run: `npx vitest run src/sim/hot.test.ts src/sim/traits.test.ts; npm run typecheck; npm test`
Expected: the new tests PASS; typecheck clean; every existing test passes (the new fields are optional and nothing reads them yet).

- [ ] **Step 7: Commit**

```bash
git add src/sim/types.ts src/sim/config.ts src/sim/hot.ts src/sim/hot.test.ts src/sim/traits.ts src/sim/traits.test.ts
git commit -m "feat(sim): hot item and trait types, config and helpers"
```

---

### Task 2: Lucky weights in the item rolls

**Files:**
- Modify: `src/sim/items.ts`
- Test: `src/sim/items.test.ts`

Context: `rollBox(rng, kind, ctx)` picks Speed and Defense items with `pickOne` (one `rng.nextInt(3)` draw) and attack targets with `pickWeighted` (one `rng.nextInt(total)` draw). `src/sim/rng.ts` uses rejection sampling, so `nextInt(4)` and `nextInt(3)` consume the stream differently: switching to a weighted pick must happen **only when the roll actually contains a Lucky item**, otherwise every race without hot items would change. The Stampede (`PASS3_CHANCE_PERCENT`) and Thunderclap (`THUNDERCLAP_CHANCE_PERCENT`) rolls stay a single `rng.nextInt(100)` draw; only their threshold doubles.

- [ ] **Step 1: Write the failing tests** (append to `src/sim/items.test.ts`; extend its imports to `import { ATTACK_WEIGHTS, HOT, MYSTERY_TYPE_WEIGHTS, PASS3_CHANCE_PERCENT, THUNDERCLAP_CHANCE_PERCENT } from './config.ts';`):

```ts
describe('Lucky hot items', () => {
  const lucky = (...items: ItemCode[]) => ({ lucky: new Set(items) });

  it('a Lucky Carrot comes out of a Speed box 2 times in 4', () => {
    const rng = createSeededRng(11);
    const items: ItemCode[] = ['speed:self1', 'speed:self3', 'speed:star'];
    const counts = [0, 0, 0];
    for (let i = 0; i < 20_000; i++) {
      counts[items.indexOf(rollBox(rng, 'speed', { ...ctx(i % 10), ...lucky('speed:self1') })!)]!++;
    }
    expect(chiSquare(counts, [0.5, 0.25, 0.25])).toBeLessThan(13.82); // df = 2, p = 0.001
  });

  it('a Lucky Mirror Saddle doubles in a Defense box', () => {
    const rng = createSeededRng(12);
    const items: ItemCode[] = ['defense:block1', 'defense:immune', 'defense:reflect'];
    const counts = [0, 0, 0];
    for (let i = 0; i < 20_000; i++) {
      counts[items.indexOf(rollBox(rng, 'defense', { ...ctx(i % 10), ...lucky('defense:reflect') })!)]!++;
    }
    expect(chiSquare(counts, [0.25, 0.25, 0.5])).toBeLessThan(13.82);
  });

  it('a Lucky attack doubles its band weight', () => {
    const rng = createSeededRng(13);
    const targets = Object.keys(ATTACK_WEIGHTS.middle) as AttackTarget[];
    const weights = targets.map((t) =>
      t === 'top3' ? ATTACK_WEIGHTS.middle[t] * HOT.luckyWeight : ATTACK_WEIGHTS.middle[t],
    );
    const total = weights.reduce((a, b) => a + b, 0);
    const counts = targets.map(() => 0);
    for (let i = 0; i < 20_000; i++) {
      const item = rollAttack(rng, { ...ctx(4), ...lucky('attack:top3') })!;
      counts[targets.indexOf(item.slice('attack:'.length) as AttackTarget)]!++;
    }
    expect(chiSquare(counts, weights.map((w) => w / total))).toBeLessThan(20.52); // df = 5
  });

  it('a Lucky Stampede or Thunderclap doubles its chance', () => {
    const rng = createSeededRng(14);
    let speed = 0;
    let pass3 = 0;
    let attack = 0;
    let all = 0;
    for (let i = 0; i < 40_000; i++) {
      const back = rollBox(rng, 'mystery', { ...ctx(8), ...lucky('speed:pass3') });
      if (back?.startsWith('speed:')) speed++;
      if (back === 'speed:pass3') pass3++;
      const last = rollBox(rng, 'mystery', { ...ctx(9), ...lucky('attack:all') });
      if (last?.startsWith('attack:')) attack++;
      if (last === 'attack:all') all++;
    }
    const p = Math.min(100, PASS3_CHANCE_PERCENT * HOT.luckyWeight) / 100;
    expect(chiSquare([pass3, speed - pass3], [p, 1 - p])).toBeLessThan(10.83); // df = 1
    const q = Math.min(100, THUNDERCLAP_CHANCE_PERCENT * HOT.luckyWeight) / 100;
    expect(chiSquare([all, attack - all], [q, 1 - q])).toBeLessThan(10.83);
  });

  it('draws exactly as before unless the roll holds a Lucky item', () => {
    // A Lucky item of another box type must not touch this roll's draws.
    const other = { speed: 'defense:block1', attack: 'speed:self1', defense: 'attack:leader' } as const;
    for (const kind of ['speed', 'attack', 'defense'] as const) {
      const a = createSeededRng(21);
      const b = createSeededRng(21);
      for (let i = 0; i < 2000; i++) {
        const c = ctx(i % 10);
        expect(rollBox(b, kind, { ...c, ...lucky(other[kind]) })).toBe(rollBox(a, kind, c));
      }
    }
    const a = createSeededRng(22);
    const b = createSeededRng(22);
    for (let i = 0; i < 2000; i++) {
      const c = ctx(i % 10);
      expect(rollBox(b, 'mystery', { ...c, lucky: new Set() })).toBe(rollBox(a, 'mystery', c));
    }
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/items.test.ts`
Expected: the four share tests FAIL (Lucky has no effect yet: e.g. the Carrot comes out 1 in 3); the "draws exactly as before" test passes already. A typecheck complaint about `lucky` in the context object is also expected until Step 3.

- [ ] **Step 3: Implement** in `src/sim/items.ts`.

Add `HOT` to the config import (alphabetical: after `DUD_ITEMS`).

In `interface RollContext`, after `readonly canTarget: …;` add:

```ts
  /** This race's Lucky hot items (spec C); missing = none. */
  readonly lucky?: ReadonlySet<ItemCode>;
```

After `RollContext` add:

```ts
/** A Lucky item's weight (or percent chance) is multiplied by HOT.luckyWeight. */
const luckyWeight = (ctx: RollContext, item: ItemCode, weight: number): number =>
  ctx.lucky?.has(item) ? weight * HOT.luckyWeight : weight;

/**
 * Uniform pick, or weighted when one of `items` is Lucky. Only then: a weighted pick draws
 * nextInt(total) instead of nextInt(items.length), which would change races without hot items.
 */
function pickItem<T extends ItemCode>(rng: Rng, items: readonly T[], ctx: RollContext): T {
  if (!items.some((i) => ctx.lucky?.has(i))) return pickOne(rng, items);
  const weights: Partial<Record<T, number>> = {};
  for (const i of items) weights[i] = luckyWeight(ctx, i, 1);
  return pickWeighted(rng, weights);
}

/** Percent chance of a mystery-only upgrade; Lucky doubles the threshold, still one draw. */
const chance = (ctx: RollContext, item: ItemCode, percent: number): number =>
  Math.min(100, luckyWeight(ctx, item, percent));
```

In `rollAttack`, replace

```ts
    if (ctx.canTarget[target] && weight > 0) weights[target] = weight;
```

with

```ts
    if (ctx.canTarget[target] && weight > 0)
      weights[target] = luckyWeight(ctx, `attack:${target}`, weight);
```

In `rollBox`, replace the `switch (type) { … }` body with:

```ts
  switch (type) {
    case 'speed':
      if (
        mystery &&
        ctx.rank >= ctx.count / 2 &&
        rng.nextInt(100) < chance(ctx, 'speed:pass3', PASS3_CHANCE_PERCENT)
      ) {
        return 'speed:pass3';
      }
      return pickItem(rng, SPEED_ITEMS, ctx);
    case 'attack':
      if (
        mystery &&
        ctx.rank === ctx.count - 1 &&
        rng.nextInt(100) < chance(ctx, 'attack:all', THUNDERCLAP_CHANCE_PERCENT)
      ) {
        return ctx.canTarget.front1 || ctx.canTarget.behind1 ? 'attack:all' : null;
      }
      return rollAttack(rng, ctx);
    case 'defense':
      return pickItem(rng, DEFENSE_ITEMS, ctx);
    case 'dud':
      return pickOne(rng, DUD_ITEMS);
  }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/sim; npm run typecheck`
Expected: all PASS (simulate tests unchanged: nothing passes `lucky` yet).

- [ ] **Step 5: Commit**

```bash
git add src/sim/items.ts src/sim/items.test.ts
git commit -m "feat(sim): Lucky hot items double their weight in box rolls"
```

---

### Task 3: Hot items in the race simulation (Extended, pickup flag, validation)

**Files:**
- Modify: `src/sim/simulate.ts`
- Test: `src/sim/simulate.test.ts`

Context: in `src/sim/simulate.ts`, `addMod(h, item, from)` pushes `{ mult: e.mult, from, until: from + toTicks(e.seconds) }`; `use()` handles `speed:self3` as three `addMod` bursts, `speed:pass3` sets `h.stampede = { target, until: tick + toTicks(EFFECTS[item].seconds) }`, and `defense:immune` sets `h.immuneUntil = Math.max(h.immuneUntil, tick + 1 + toTicks(EFFECTS[item].seconds))`. `toTicks` rounds (`Math.round(seconds * TICK_HZ)`): Extended 2.25 s → 23 ticks, 5.25 s → 53 ticks.

- [ ] **Step 1: Make the fingerprint helper take any input** (in `src/sim/simulate.test.ts`).

Replace the whole `const fingerprint = (weather?: RaceInput['weather']) => { … };` helper with:

```ts
const fingerprint = (over: Partial<RaceInput> = {}) => {
  let h = 2166136261;
  for (const seed of [1, 2, 3, 42, 9999]) {
    const tl = simulateRace({
      seed,
      horses: ids(12),
      bought: { h0: ['speed', 'attack'] },
      length: 'short',
      ...over,
    });
    // Old timelines have none of these fields: drop them so the fingerprint compares the race itself.
    const { weather: _w, puddles: _p, hot: _h, ...rest } = tl;
    const s = JSON.stringify(rest);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
};
```

and in `describe('weather', …)` change the first test's second line from `expect(fingerprint('clear')).toBe(2438717223);` to `expect(fingerprint({ weather: 'clear' })).toBe(2438717223);`.

- [ ] **Step 2: Write the failing tests** (append to `src/sim/simulate.test.ts`; add `HotItem` to the types import):

```ts
describe('hot items', () => {
  const allBoxes = (box: BoxType) =>
    Object.fromEntries(ids(12).map((h) => [h, [box, box, box] as BoxType[]]));

  it('no hot items: exactly the old race (no extra RNG draws)', () => {
    expect(fingerprint({ hot: [] })).toBe(2438717223);
  });

  it('rejects bad hot lists', () => {
    const bad: HotItem[][] = [
      [
        { item: 'speed:self1', buff: 'lucky' },
        { item: 'speed:star', buff: 'lucky' },
        { item: 'attack:leader', buff: 'lucky' },
        { item: 'defense:immune', buff: 'lucky' },
      ],
      [
        { item: 'speed:self1', buff: 'lucky' },
        { item: 'speed:self1', buff: 'extended' },
      ],
      [{ item: 'dud:stop', buff: 'lucky' }],
      [{ item: 'speed:self1', buff: 'golden' as never }],
      [{ item: 'defense:block1', buff: 'extended' }],
      [{ item: 'defense:reflect', buff: 'extended' }],
    ];
    for (const hot of bad) expect(() => race({ hot })).toThrow(RangeError);
  });

  it('records the list and flags hot pickups only', () => {
    const hot: HotItem[] = [{ item: 'speed:self1', buff: 'lucky' }];
    const tl = race({ hot, horses: ids(12), bought: allBoxes('speed') });
    expect(tl.hot).toEqual(hot);
    expect(race().hot).toEqual([]);
    let flagged = 0;
    for (const e of tl.events) {
      if (e.type !== 'pickup') continue;
      if (e.item === 'speed:self1') {
        expect(e.hot).toBe('lucky');
        flagged++;
      } else expect(e.hot).toBeUndefined();
    }
    expect(flagged).toBeGreaterThan(0);
  });

  it('a Lucky Carrot fills about half the bought Speed boxes', () => {
    const hot: HotItem[] = [{ item: 'speed:self1', buff: 'lucky' }];
    let speed = 0;
    let carrots = 0;
    for (let seed = 1; seed <= 100; seed++) {
      for (const e of race({ seed, hot, horses: ids(12), bought: allBoxes('speed') }).events) {
        if (e.type !== 'pickup' || e.kind !== 'speed') continue;
        speed++;
        if (e.item === 'speed:self1') carrots++;
      }
    }
    expect(carrots / speed).toBeGreaterThan(0.46);
    expect(carrots / speed).toBeLessThan(0.54);
  });

  it('an Extended Golden Lasso stops its victim for 3 s', () => {
    const hot: HotItem[] = [{ item: 'attack:leader', buff: 'extended' }];
    let checked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const tl = race({ seed, horses: ids(12), hot });
      for (const e of tl.events) {
        if (e.type !== 'hit' || e.item !== 'attack:leader') continue;
        const tick = Math.round(e.t * TICK_HZ);
        const p = tl.progress[e.horse]!;
        for (let k = 1; k <= 3 * TICK_HZ; k++) expect(p[tick + k]).toBe(p[tick]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('an Extended Lucky Bubble keeps its horse immune for 9 s', () => {
    const hot: HotItem[] = [{ item: 'defense:immune', buff: 'extended' }];
    const longest = EFFECTS['defense:immune'].seconds * 1.5;
    let late = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const tl = race({ seed, horses: ids(12), hot, bought: allBoxes('defense') });
      for (const e of tl.events) {
        if (e.type !== 'blocked' || e.reason !== 'immune') continue;
        const bubble = tl.events
          .filter(
            (p) =>
              p.type === 'pickup' && p.horse === e.horse && p.item === 'defense:immune' && p.t <= e.t,
          )
          .at(-1)!;
        expect(e.t - bubble.t).toBeLessThanOrEqual(longest + 0.01);
        if (e.t - bubble.t > EFFECTS['defense:immune'].seconds) late++;
      }
    }
    expect(late).toBeGreaterThan(0); // some blocks land in the extra 3 s
  });
});
```

If `late` stays 0, raise the seed count to 1000 (seeds are fixed, so the test stays deterministic); do not drop the check.

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run src/sim/simulate.test.ts`
Expected: the two fingerprint tests PASS; "rejects bad hot lists", "records the list…", "Lucky Carrot…", "Extended Golden Lasso…" and "Extended Lucky Bubble…" FAIL.

- [ ] **Step 4: Implement** in `src/sim/simulate.ts`.

Imports: add `HOT` to the `./config.ts` import list and `import { buffOf, effectSeconds, HOT_ELIGIBLE } from './hot.ts';`.

At the end of `validateRaceInput`, after the weather check, add:

```ts
  const hot = input.hot ?? [];
  if (hot.length > HOT.count) throw new RangeError(`at most ${HOT.count} hot items`);
  if (new Set(hot.map((x) => x.item)).size !== hot.length)
    throw new RangeError('hot items must be different items');
  for (const { item, buff } of hot) {
    if (!HOT_ELIGIBLE.includes(item)) throw new RangeError(`${String(item)} can't be a hot item`);
    if (buff !== 'lucky' && buff !== 'extended')
      throw new RangeError(`unknown hot buff ${String(buff)}`);
    if (buff === 'extended' && EFFECTS[item].seconds <= 0)
      throw new RangeError(`${item} has no duration to extend`);
  }
```

In `simulateRace`, right after `const distance = DISTANCE[input.length];` add:

```ts
  // Hot items (spec C) only change weights and durations: they never add RNG draws.
  const hot = input.hot ?? [];
  const lucky: ReadonlySet<ItemCode> = new Set(
    hot.flatMap((x) => (x.buff === 'lucky' ? [x.item] : [])),
  );
  const secondsOf = (item: ItemCode): number => effectSeconds(item, hot);
```

In `addMod`, replace `h.mods.push({ mult: e.mult, from, until: from + toTicks(e.seconds) });` with:

```ts
    h.mods.push({ mult: e.mult, from, until: from + toTicks(secondsOf(item)) });
```

(Golden Carrot calls `addMod` once per burst, so each of its three bursts is extended.)

In `use()`, case `'speed:pass3'`: replace `until: tick + toTicks(EFFECTS[item].seconds),` with `until: tick + toTicks(secondsOf(item)),`.

In `use()`, case `'defense:immune'`: replace `h.immuneUntil = Math.max(h.immuneUntil, tick + 1 + toTicks(EFFECTS[item].seconds));` with:

```ts
        h.immuneUntil = Math.max(h.immuneUntil, tick + 1 + toTicks(secondsOf(item)));
```

In the box loop, in the `rollBox(rng, spot.kind, { … })` context, after `count: horses.length,` add `lucky,`.

Replace the pickup `events.push({ … type: 'pickup' … });` block with:

```ts
        const buff = buffOf(hot, item);
        events.push({
          t: round2(tick / TICK_HZ),
          type: 'pickup',
          horse: h.id,
          kind: spot.kind,
          item,
          ...(buff ? { hot: buff } : {}),
        });
```

In the returned object, after `puddles,` add `hot: [...hot],`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/sim; npm run typecheck`
Expected: all PASS; the fingerprint is still `2438717223`.

- [ ] **Step 6: Commit**

```bash
git add src/sim/simulate.ts src/sim/simulate.test.ts
git commit -m "feat(sim): Lucky and Extended hot items in the race"
```

---

### Task 4: Charmed in the item rolls

**Files:**
- Modify: `src/sim/items.ts`
- Test: `src/sim/items.test.ts`

Context: `rollBox` in `src/sim/items.ts` (after Task 2) starts with `const mystery = kind === 'mystery'; const type = mystery ? pickWeighted(rng, MYSTERY_TYPE_WEIGHTS[bandOf(ctx.rank, ctx.count)]) : kind;`. Charmed (spec D): when a mystery type roll gives `dud`, `TRAITS.charmed.rerollPercent` of the time the type is rolled again without the dud (exactly half the duds at 50); a Charmed horse never gets Stampede (`speed:pass3`) or Thunderclap (`attack:all`) and **no draw is made** for those chances. Extra draws happen only for a Charmed horse that rolled a dud.

- [ ] **Step 1: Write the failing tests** (append to `src/sim/items.test.ts`; add `TRAITS` to its config import):

```ts
describe('Charmed', () => {
  it('rolls (1 - rerollPercent) of the duds', () => {
    const rng = createSeededRng(31);
    const n = 20_000;
    let duds = 0;
    for (let i = 0; i < n; i++) {
      if (rollBox(rng, 'mystery', { ...ctx(0), charmed: true })?.startsWith('dud:')) duds++;
    }
    const p = (MYSTERY_TYPE_WEIGHTS.front.dud / 100) * (1 - TRAITS.charmed.rerollPercent / 100);
    expect(chiSquare([duds, n - duds], [p, 1 - p])).toBeLessThan(10.83); // df = 1
  });

  it('never gets Stampede or Thunderclap, even when they are Lucky', () => {
    const rng = createSeededRng(32);
    const c = { ...ctx(9), charmed: true, lucky: new Set<ItemCode>(['speed:pass3', 'attack:all']) };
    for (let i = 0; i < 20_000; i++) {
      expect(rollBox(rng, 'mystery', c)).not.toMatch(/^(speed:pass3|attack:all)$/);
    }
  });

  it('a horse that is not Charmed draws exactly as before', () => {
    const a = createSeededRng(33);
    const b = createSeededRng(33);
    for (let i = 0; i < 2000; i++) {
      const c = ctx(i % 10);
      expect(rollBox(b, 'mystery', { ...c, charmed: false })).toBe(rollBox(a, 'mystery', c));
    }
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/items.test.ts`
Expected: the first two Charmed tests FAIL (duds at the full 30 %, Stampede/Thunderclap still rolled).

- [ ] **Step 3: Implement** in `src/sim/items.ts`.

Add `TRAITS` to the config import and `MysteryType` to the types import.

In `interface RollContext`, after `lucky`, add:

```ts
  /** The picking horse is Charmed (spec D). */
  readonly charmed?: boolean;
```

Replace the first lines of `rollBox`

```ts
  const mystery = kind === 'mystery';
  const type = mystery
    ? pickWeighted(rng, MYSTERY_TYPE_WEIGHTS[bandOf(ctx.rank, ctx.count)])
    : kind;
```

with

```ts
  const mystery = kind === 'mystery';
  const table = MYSTERY_TYPE_WEIGHTS[bandOf(ctx.rank, ctx.count)];
  let type: MysteryType = mystery ? pickWeighted(rng, table) : kind;
  // Charmed: some dud rolls become another type. Extra draws only for a Charmed horse's dud.
  if (mystery && type === 'dud' && ctx.charmed && rng.nextInt(100) < TRAITS.charmed.rerollPercent) {
    const { dud: _dud, ...rest } = table;
    type = pickWeighted(rng, rest);
  }
  // Charmed never gets the rare upgrades, and makes no draw for them.
  const rare = mystery && !ctx.charmed;
```

and in the `switch`, replace `mystery &&` with `rare &&` in both the `'speed'` and the `'attack'` case conditions (nothing else changes).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/sim; npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/items.ts src/sim/items.test.ts
git commit -m "feat(sim): Charmed horses roll fewer duds and no rare upgrades"
```

---

### Task 5: Traits in the race simulation (Tough, Sprinter, Stayer, Mudder, Charmed)

**Files:**
- Modify: `src/sim/simulate.ts`
- Test: `src/sim/simulate.test.ts`

Context (`src/sim/simulate.ts` after Task 3): `interface Horse` holds `kickAt`, `kickTicks`, `mods`, `stampede`…; the `horses` array is built by `input.horses.map((id, index) => ({ … }))` whose `knots`, `kickAt`, `kickTicks` fields draw from the RNG in that order; `weatherMod(h, e, tick)` pushes weather slowdowns; `pace(h, tick)` returns `BASE_SPEED * noise * kick * mult` with `kick = … ? 1 + KICK.boost : 1` and `mult` starting at `EFFECTS['speed:pass3'].mult` during a Stampede; slips use `rng.nextInt(100) < WEATHER.slipChancePercent`; bumps use `rng.nextInt(1_000_000) >= bumpOdds` (integer odds, `bumpOdds = 2000`). Normal must stay bit-identical: `x * 1` and `1 + KICK.boost` are exact, and `toughen` is only called for Tough horses (`1 - (1 - m) * 1` is **not** always exactly `m`).

- [ ] **Step 1: Write the failing tests** (append to `src/sim/simulate.test.ts`; add `TRAITS` to the config import, `Trait` to the types import, and `import { earlyPaceOf, toughen } from './traits.ts';`). First add `traits: _t` to the `fingerprint` helper's destructure: `const { weather: _w, puddles: _p, hot: _h, traits: _t, ...rest } = tl;`.

```ts
const allOf = (trait: Trait, n = 12): Record<string, Trait> =>
  Object.fromEntries(ids(n).map((h) => [h, trait]));

describe('traits', () => {
  it('an all-Normal field races exactly as before', () => {
    expect(fingerprint({ traits: allOf('normal') })).toBe(2438717223);
    expect(fingerprint({ traits: {} })).toBe(2438717223);
  });

  it('rejects unknown traits and unknown horses', () => {
    expect(() => race({ traits: { h0: 'lucky' as never } })).toThrow(RangeError);
    expect(() => race({ traits: { nobody: 'tough' } })).toThrow(RangeError);
  });

  it("records every horse's trait, Normal by default", () => {
    expect(race({ traits: { h1: 'stayer' } }).traits).toEqual({ ...allOf('normal', 8), h1: 'stayer' });
  });

  it('Sprinter and Stayer change the pace over the first third', () => {
    const at10s = (trait: Trait) => {
      let sum = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const tl = race({ seed, horses: ids(12), traits: allOf(trait) });
        for (const h of ids(12)) sum += tl.progress[h]![100]!; // ~150 m, well inside 600 m
      }
      return sum;
    };
    const normal = at10s('normal');
    for (const trait of ['sprinter', 'stayer'] as const) {
      const want = earlyPaceOf(trait);
      expect(Math.abs(at10s(trait) / normal - want)).toBeLessThan(Math.abs(want - 1) / 2 + 0.002);
    }
  });

  it('Charmed: fewer duds, never Stampede or Thunderclap', () => {
    const count = (trait: Trait) => {
      let duds = 0;
      let rare = 0;
      for (let seed = 1; seed <= 100; seed++) {
        for (const e of race({ seed, horses: ids(12), traits: allOf(trait) }).events) {
          if (e.type !== 'pickup') continue;
          if (e.item?.startsWith('dud:')) duds++;
          if (e.item === 'speed:pass3' || e.item === 'attack:all') rare++;
        }
      }
      return { duds, rare };
    };
    const normal = count('normal');
    const charmed = count('charmed');
    expect(normal.rare).toBeGreaterThan(0);
    expect(charmed.rare).toBe(0);
    const keep = 1 - TRAITS.charmed.rerollPercent / 100;
    expect(Math.abs(charmed.duds / normal.duds - keep)).toBeLessThan(0.12);
  });

  it('Tough: the Golden Lasso only slows it', () => {
    let checked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const tl = race({ seed, horses: ids(12), traits: allOf('tough') });
      for (const e of tl.events) {
        if (e.type !== 'hit' || e.item !== 'attack:leader') continue;
        const tick = Math.round(e.t * TICK_HZ);
        const p = tl.progress[e.horse]!;
        expect(p[tick + 2 * TICK_HZ]!).toBeGreaterThan(p[tick]!);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('Tough: a rain slip slows it less', () => {
    // Noise takes at most 6 % off; a Normal slip tops out near 15 * 0.5 * 1.17, below this floor.
    const floor = 15 * toughen(WEATHER.slip.mult) * 0.9;
    let checked = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const tl = race({ seed, weather: 'rain', horses: ids(12), traits: allOf('tough') });
      for (const slip of tl.events) {
        if (slip.type !== 'slip') continue;
        // Clean slips only: no other event for this horse from 4 s before to just after.
        const busy = tl.events.some(
          (e) =>
            e !== slip &&
            e.type !== 'finish' &&
            e.horse === slip.horse &&
            e.t > slip.t - 4 &&
            e.t <= slip.t + 1.6,
        );
        const tick = Math.round(slip.t * TICK_HZ);
        const p = tl.progress[slip.horse]!;
        if (busy || p[tick + 15]! >= tl.distance) continue;
        expect((p[tick + 15]! - p[tick + 1]!) / 1.4).toBeGreaterThan(floor);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('Mudder: slips at its own chance', () => {
    let entries = 0;
    let slips = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const tl = race({ seed, weather: 'rain', horses: ids(12), traits: allOf('mudder') });
      entries += tl.horses.reduce(
        (n, _, lane) =>
          n + tl.puddles!.filter((p) => p.lanes[0] <= lane && lane <= p.lanes[1]).length,
        0,
      );
      slips += tl.events.filter((e) => e.type === 'slip').length;
    }
    expect(Math.abs(slips / entries - TRAITS.mudder.slipChancePercent / 100)).toBeLessThan(0.025);
  });

  it('Mudder: each Mudder in a fog pair scales its bump chance', () => {
    const bumps = (traits: Record<string, Trait>) => {
      let n = 0;
      for (let seed = 1; seed <= 100; seed++) {
        n += race({ seed, weather: 'fog', horses: ids(12), traits }).events.filter(
          (e) => e.type === 'bump',
        ).length;
      }
      return n;
    };
    const ratio = bumps(allOf('mudder')) / bumps(allOf('normal'));
    expect(Math.abs(ratio - TRAITS.mudder.bumpFactor ** 2)).toBeLessThan(0.12);
  });

  it('Mudder: slower on a clear day', () => {
    const meanWinner = (trait: Trait) => {
      let sum = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const tl = race({ seed, horses: ids(12), traits: allOf(trait) });
        sum += tl.finishTimes[tl.finishOrder[0]!]!;
      }
      return sum;
    };
    const want = 1 / TRAITS.mudder.clearPace;
    const ratio = meanWinner('mudder') / meanWinner('normal');
    expect(Math.abs(ratio - want)).toBeLessThan(Math.max((want - 1) / 2, 0.002));
  });
});
```

(The all-one-trait comparisons use the same seeds, so knots and box spots match and the fields differ almost only by the trait.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/simulate.test.ts`
Expected: the fingerprint test PASSES; "rejects unknown traits…", "records every horse's trait…" and every behaviour test FAIL (traits are ignored).

- [ ] **Step 3: Implement** in `src/sim/simulate.ts`.

Imports: add `TRAIT_CODES` and `TRAITS` to the `./config.ts` import, `Trait` to the `./types.ts` type import, and `import { earlyPaceOf, kickBoostOf, kickExtraSecondsOf, toughen } from './traits.ts';`.

In `interface Horse`, after `readonly index: number;` add:

```ts
  readonly trait: Trait;
  readonly kickBoost: number;
  /** Pace factor while progress < distance / 3 (Sprinter, Stayer). */
  readonly earlyPace: number;
```

At the end of `validateRaceInput` add:

```ts
  for (const [id, trait] of Object.entries(input.traits ?? {})) {
    if (!input.horses.includes(id)) throw new RangeError(`trait for unknown horse ${id}`);
    if (!TRAIT_CODES.includes(trait)) throw new RangeError(`unknown trait ${String(trait)}`);
  }
```

Replace the whole `const horses: Horse[] = input.horses.map((id, index) => ({ … }));` statement with:

```ts
  const horses: Horse[] = input.horses.map((id, index) => {
    const trait: Trait = input.traits?.[id] ?? 'normal';
    return {
      id,
      index,
      trait,
      // Draw order (knots, kickAt, kickTicks) is unchanged: traits add no draws here.
      knots: Array.from({ length: Math.ceil(maxTicks / knotTicks) + 2 }, () => fraction(rng) * 2 - 1),
      kickAt: distance * (KICK.fromFraction + fraction(rng) * (KICK.toFraction - KICK.fromFraction)),
      kickTicks:
        toTicks(KICK.minSeconds) +
        rng.nextInt(toTicks(KICK.maxSeconds) - toTicks(KICK.minSeconds) + 1) +
        toTicks(kickExtraSecondsOf(trait)),
      kickBoost: kickBoostOf(trait),
      earlyPace: earlyPaceOf(trait),
      progress: 0,
      kickStart: null,
      mods: [],
      immuneUntil: 0,
      held: null,
      stampede: null,
      nextBox: 0,
      finishTime: null,
      finishExact: 0,
    };
  });
```

Right before `const weatherMod = …` add:

```ts
  /** Tough (spec D): every slowdown and boost on this horse is weaker; Normal untouched. */
  const tough = (h: Horse, mult: number): number => (h.trait === 'tough' ? toughen(mult) : mult);
```

and change `weatherMod`'s body from `h.mods.push({ mult: e.mult, from: tick + 1, until: tick + 1 + toTicks(e.seconds) })` to:

```ts
    h.mods.push({ mult: tough(h, e.mult), from: tick + 1, until: tick + 1 + toTicks(e.seconds) });
```

In `pace`, replace the last four lines (from `const kick = …` to `return BASE_SPEED * noise * kick * mult;`) with:

```ts
    const kick = h.kickStart !== null && tick < h.kickStart + h.kickTicks ? 1 + h.kickBoost : 1;
    // A Stampede is not immune: hits landed during the sprint still slow it.
    let mult = h.stampede ? tough(h, EFFECTS['speed:pass3'].mult) : 1;
    for (const m of h.mods) if (m.from <= tick && tick < m.until) mult *= m.mult;
    // Traits: Sprinter/Stayer over the first third, Mudder on a clear day. Normal multiplies by 1.
    const early = h.progress < distance / 3 ? h.earlyPace : 1;
    const mud = h.trait === 'mudder' && weather === 'clear' ? TRAITS.mudder.clearPace : 1;
    return BASE_SPEED * noise * kick * mult * early * mud;
```

In `addMod`, change the push to `h.mods.push({ mult: tough(h, e.mult), from, until: from + toTicks(secondsOf(item)) });` (this covers speed items, duds and every attack hit, reflected ones included).

In the rain block, replace `if (rng.nextInt(100) < WEATHER.slipChancePercent) {` with:

```ts
          const slipChance =
            h.trait === 'mudder' ? TRAITS.mudder.slipChancePercent : WEATHER.slipChancePercent;
          if (rng.nextInt(100) < slipChance) {
```

In the fog block, replace `if (rng.nextInt(1_000_000) >= bumpOdds) continue;` with:

```ts
        // Each Mudder in the pair scales the chance; still exactly one draw.
        const mud = (x: Horse) => (x.trait === 'mudder' ? TRAITS.mudder.bumpFactor : 1);
        if (rng.nextInt(1_000_000) >= bumpOdds * mud(a) * mud(b)) continue;
```

In the `rollBox` context, after `lucky,` add `charmed: h.trait === 'charmed',`.

In the returned object, after `hot: [...hot],` add:

```ts
    traits: Object.fromEntries(horses.map((h) => [h.id, h.trait])),
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/sim; npm run typecheck`
Expected: all PASS; fingerprint unchanged. If the Sprinter/Stayer ratio test fails, print both sums: a ratio near 1 means `early` is not applied; check that `h.progress < distance / 3` reads the progress before this tick's move.

- [ ] **Step 5: Commit**

```bash
git add src/sim/simulate.ts src/sim/simulate.test.ts
git commit -m "feat(sim): Charmed, Tough, Sprinter, Stayer and Mudder traits"
```

---

### Task 6: The odds price hot items and traits

**Files:**
- Modify: `src/sim/odds.ts`
- Test: `src/sim/odds.test.ts`

Context: `simulateShares` in `src/sim/odds.ts` spreads the race into `simulateRace` (so `hot` and `traits` already reach every simulation), then averages the counts of horses with the same bought boxes: `const key = [...(race.bought[h] ?? [])].sort().join();`. Without the trait in that key a Sprinter and a Normal horse with no boxes are averaged together and the odds ignore traits. `odds.test.ts` already defines `ids` and `frozenClock` (always 0, so every call runs `ODDS.maxSims`).

- [ ] **Step 1: Write the failing tests** (append to `src/sim/odds.test.ts`):

```ts
describe('hot items and traits in the odds', () => {
  it('passes the hot items to every simulated race', () => {
    const race = {
      horses: ids(6),
      bought: { h0: ['attack', 'attack', 'attack'] },
      length: 'short',
    } as const;
    const plain = simulateShares(race, createSeededRng(12), frozenClock);
    const hot = simulateShares(
      { ...race, hot: [{ item: 'attack:leader', buff: 'extended' }] },
      createSeededRng(12),
      frozenClock,
    );
    expect(hot).not.toEqual(plain);
  });

  it('prices each trait on its own instead of averaging it away', () => {
    const race = { horses: ids(4), bought: {}, length: 'short', traits: { h0: 'sprinter' } } as const;
    const { wins } = simulateShares(race, createSeededRng(13), frozenClock);
    expect(wins.get('h0')).not.toBe(wins.get('h1'));
    expect(wins.get('h1')).toBe(wins.get('h2')); // the Normal horses are still averaged
    expect(wins.get('h2')).toBe(wins.get('h3'));
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run src/sim/odds.test.ts`
Expected: the hot-items test PASSES (the spread already passes it); the traits test FAILS (`h0` averaged with the rest).

- [ ] **Step 3: Implement** in `simulateShares` (`src/sim/odds.ts`), replace

```ts
    const key = [...(race.bought[h] ?? [])].sort().join();
```

with

```ts
    // Same boxes and the same trait = interchangeable (spec D: the odds price traits in).
    const key = `${race.traits?.[h] ?? 'normal'}|${[...(race.bought[h] ?? [])].sort().join()}`;
```

and in the doc comment above the function change "Horses with the same bought boxes are interchangeable" to "Horses with the same bought boxes and trait are interchangeable".

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/sim; npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/odds.ts src/sim/odds.test.ts
git commit -m "feat(sim): odds keep traits apart when averaging equal horses"
```

---

### Task 7: Trait balance test and tuning

**Files:**
- Modify: `src/sim/balance.slow.test.ts`, `src/sim/config.ts` (tuning `TRAITS` only)

Context: `src/sim/balance.slow.test.ts` runs only via `npm run test:balance` (`vitest.balance.config.ts`, 600 s per test). Spec D: 12-horse fields, weather 50/25/25, no hot items, traits assigned evenly; each trait's win share within ±15 % (relative) of Normal's. A 12-horse race takes about 2 ms (measured 1.95 ms over mixed lengths and weathers), so 10,000 races take about 20 s, well inside the budget. With 2 horses per trait (expected share 1/6) the standard error of a share over 10,000 races is about 2 % relative, so ±15 % is a real signal, not noise.

- [ ] **Step 1: Write the test** (append to `src/sim/balance.slow.test.ts`; change its imports to `import { NOMINAL_SECONDS, TRAIT_CODES } from './config.ts';` and `import type { BoxType, RaceLength, Trait, Weather } from './types.ts';`):

```ts
const TRAIT_RACES = 10_000;
const TRAIT_FIELD = Array.from({ length: 12 }, (_, i) => `t${i}`);
const WEATHER_MIX: readonly Weather[] = ['clear', 'clear', 'rain', 'fog'];

describe('trait balance, 12 horses, weather 50/25/25, no hot items', () => {
  it("every trait's win share is within ±15 % of Normal's", () => {
    const wins = Object.fromEntries(TRAIT_CODES.map((t) => [t, 0])) as Record<Trait, number>;
    for (let k = 0; k < TRAIT_RACES; k++) {
      // Weather, length and the lane rotation cycle independently (period 48), so each trait
      // meets every weather, both lengths and every lane equally; each trait runs 2 horses.
      const offset = Math.floor(k / 8) % TRAIT_CODES.length;
      const traits = Object.fromEntries(
        TRAIT_FIELD.map((h, lane) => [h, TRAIT_CODES[(lane + offset) % TRAIT_CODES.length]!]),
      );
      const tl = simulateRace({
        seed: k + 1,
        horses: TRAIT_FIELD,
        bought: {},
        length: Math.floor(k / 4) % 2 === 0 ? 'short' : 'long',
        weather: WEATHER_MIX[k % 4]!,
        traits,
      });
      wins[traits[tl.finishOrder[0]!]!]++;
    }
    const share = (t: Trait) => wins[t] / TRAIT_RACES;
    console.log('trait win shares', TRAIT_CODES.map((t) => `${t} ${share(t).toFixed(3)}`).join(' '));
    for (const t of TRAIT_CODES) {
      expect(Math.abs(share(t) / share('normal') - 1)).toBeLessThanOrEqual(0.15);
    }
  });
});
```

- [ ] **Step 2: Run it with the spec numbers**

Run: `npm run test:balance -- -t "trait balance"`
Expected: about 20 s; with the spec's starting numbers it most likely FAILS. Rough expectation (base pace 15 m/s; equal horses end a race roughly 13 m apart): Sprinter gains ~23 m over the first 600 m and loses ~3 m of kick, so it wins far too often; Stayer loses ~18 m early and gains only ~5 m of kick, so far too rarely; Mudder loses ~27 m in every clear race (half of them) and saves only ~3 m in rain, so far too rarely; Charmed saves about half of ~1.5 duds × ~14 m per race and is likely somewhat too strong; Tough is roughly symmetric. Record the printed shares.

- [ ] **Step 3: Tune `TRAITS` in `src/sim/config.ts`** until the test passes. Change one trait per run, then rerun Step 2:

| Trait share vs Normal | Too high (> +15 %) | Too low (< −15 %) |
|---|---|---|
| Sprinter | `sprinter.earlyPace` down by 0.005 (likely lands near 1.005–1.01) | `sprinter.earlyPace` up by 0.002 |
| Stayer | `stayer.earlyPace` down by 0.002 | `stayer.earlyPace` up by 0.005 (likely near 0.99–0.995); only if it reaches 0.998 and is still low, `stayer.kickBoost` up by 0.02 |
| Mudder | `mudder.clearPace` down by 0.001 | `mudder.clearPace` up by 0.003 (likely near 0.997–0.999) |
| Charmed | `charmed.rerollPercent` down by 10 | `charmed.rerollPercent` up by 10 (max 100) |
| Tough | `tough.hitFactor` up by 0.05 (hits hurt more) | `tough.hitFactor` down by 0.05 |

Keep each upside an upside (Sprinter `earlyPace` > 1, Stayer `kickBoost` > `KICK.boost`, Mudder `clearPace` < 1, `rerollPercent` > 0, `hitFactor` < 1). Aim for every trait inside ±10 % so the margin survives future item changes. Do not touch `kickExtraSeconds`, `slipChancePercent`, `bumpFactor` or `boostFactor` (they are the visible rules the phones and commentary describe).

- [ ] **Step 4: Full checks**

Run: `npm run test:balance; npx vitest run src/sim; npm run typecheck`
Expected: all PASS (the earlier balance suites don't use traits; the simulate/items tests read `TRAITS`, so they follow the tuned numbers). Note the final `TRAITS` values and the printed shares for PROJECT_STATUS (Task 14).

- [ ] **Step 5: Commit**

```bash
git add src/sim/balance.slow.test.ts src/sim/config.ts
git commit -m "test(sim): trait balance within 15 % of Normal; tune TRAITS"
```

---

### Task 8: Database: hot items, traits, set_trait, admin switch

**Files:**
- Create: `supabase/migrations/20261105000021_hot_items_traits.sql`, `tests/db/hotTraits.test.ts`
- Modify: `src/net/database.types.ts` (regenerated)

Context: the latest `public.set_phase` is in `supabase/migrations/20261104000017_back_to_shop.sql` (LOBBY→SHOP inserts the race; ODDS_LOCKED/BETTING→SHOP keeps the race and clears `horses`/`odds`; the other moves don't create races); the latest `public.lock_odds_begin` is still the one in `20261030000006_race_flow.sql` (its SHOP branch writes `races.horses`; the ODDS_LOCKED branch is a retry that only returns the input); the latest `private.race_input` and `public.admin_overview` are in `20261105000020_weather.sql`. `private.lock_my_player(p_room, p_phase)` (`20261030000007_shop_bets.sql`) raises `not_signed_in`, `room_not_found`, `not_in_room`, `wrong_phase`; `buy_box` then raises `not_racing` for an unticked player, and `set_trait` mirrors that. `create or replace` keeps existing grants. The office switch only touches `kind = 'office'` rooms (like Weather); Private rooms keep the default (on).

- [ ] **Step 1: Check nothing newer redefines these functions**

Run: `grep -n "function public.set_phase\|function public.lock_odds_begin\|function private.race_input\|function public.admin_overview" supabase/migrations/*.sql`
Expected: latest `set_phase` in `…017`, `lock_odds_begin` only in `…006`, `race_input` and `admin_overview` latest in `…020`. If any is newer, copy that body instead and keep only the changes below.

- [ ] **Step 2: Write the migration** `supabase/migrations/20261105000021_hot_items_traits.sql`:

```sql
-- Hot items (spec 2026-11-05 C) and horse traits (spec 2026-11-05 D).

alter table public.rooms add column hot_items_enabled boolean not null default true;
alter table public.races add column hot_items jsonb not null default '[]'::jsonb;
alter table public.races add column traits jsonb not null default '{}'::jsonb;
alter table public.room_players add column trait text not null default 'normal'
  check (trait in ('normal', 'charmed', 'tough', 'sprinter', 'stayer', 'mudder'));

-- 3 different items in random order, skipping any that would make a third of one box type.
-- Shield and Mirror have no duration, so they are always Lucky. Mirrors HOT_ELIGIBLE / HOT in
-- src/sim. Hot items are public, so random() is fine.
create function private.roll_hot_items()
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_item text;
  v_type text;
  v_types text[] := '{}';
  v_out jsonb := '[]'::jsonb;
begin
  for v_item in
    select i from unnest(array[
      'speed:self1', 'speed:self3', 'speed:star', 'speed:pass3',
      'attack:behind1', 'attack:behind3', 'attack:front1', 'attack:front3',
      'attack:leader', 'attack:top3', 'attack:all',
      'defense:block1', 'defense:immune', 'defense:reflect'
    ]) as i
    order by random()
  loop
    v_type := split_part(v_item, ':', 1);
    continue when cardinality(array_positions(v_types, v_type)) >= 2;
    v_types := v_types || v_type;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'item', v_item,
      'buff', case when v_item in ('defense:block1', 'defense:reflect') or random() < 0.5
                   then 'lucky' else 'extended' end));
    exit when jsonb_array_length(v_out) = 3;
  end loop;
  return v_out;
end;
$$;
revoke execute on function private.roll_hot_items() from public;

-- v6: a new race rolls its hot items (when the room's switch is on) and every trait starts over at
-- Normal; back to the shop keeps the hot items and clears the trait snapshot.
create or replace function public.set_phase(p_room uuid, p_phase text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_host_room(p_room);
  v_race uuid;
begin
  if v_room.phase || '>' || coalesce(p_phase, '') not in (
    'LOBBY>SHOP', 'SHOP>LOBBY', 'ODDS_LOCKED>LOBBY', 'BETTING>LOBBY', 'PODIUM>LOBBY',
    'ODDS_LOCKED>SHOP', 'BETTING>SHOP'
  ) then
    raise exception 'bad_transition';
  end if;
  if p_phase = 'SHOP' and v_room.phase <> 'LOBBY' then
    -- Back to the shop: same race. Deleting the bets and their ledger rows is a full bet refund.
    v_race := v_room.race_id;
    delete from public.coin_ledger where race_id = v_race and type in ('bet', 'unbet');
    delete from public.bets where race_id = v_race;
    update public.races set horses = '{}', odds = null, traits = '{}' where id = v_race;
  elsif p_phase = 'SHOP' then
    if (select count(*) from public.room_players where room_id = p_room and ticked) < 2 then
      raise exception 'need_two_horses';
    end if;
    insert into public.races (room_id, length, prize, track, hot_items)
    values (
      p_room, v_room.race_length, v_room.prize,
      case when v_room.track = 'random'
        then (array['oval', 'speedway', 'kidney'])[1 + floor(random() * 3)::int]
        else v_room.track end,
      case when v_room.hot_items_enabled then private.roll_hot_items() else '[]'::jsonb end
    )
    returning id into v_race;
    -- Traits are picked per race.
    update public.room_players set trait = 'normal' where room_id = p_room and trait <> 'normal';
    if v_room.kind = 'office' then
      insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
      select v_race, p_room, id, 'topup', 100
      from public.room_players where room_id = p_room and ticked;
      insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
      select v_race, p_room, p.id, 'floor', 50 - b.balance
      from public.room_players p
      cross join lateral (select private.balance(v_race, p.id) as balance) b
      where p.room_id = p_room and p.archived_at is null and b.balance < 50;
    else
      insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
      select v_race, p_room, id, 'topup', 100
      from public.room_players where room_id = p_room and uid is not null;
    end if;
  elsif v_room.phase in ('SHOP', 'ODDS_LOCKED', 'BETTING') then
    -- Cancelling deletes the race and, with it, its topups, floors, purchases and bets: a full refund.
    delete from public.races where id = v_room.race_id;
  end if;
  update public.room_players set ready = false where room_id = p_room and ready;
  update public.rooms set phase = p_phase, race_id = v_race where id = p_room returning * into v_room;
  return v_room;
end;
$$;

-- v2: closing the shop also snapshots every runner's trait (Normal included). The ODDS_LOCKED
-- retry keeps the snapshot (and the field) from the first lock.
create or replace function public.lock_odds_begin(p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_host_room(p_room);
begin
  -- ODDS_LOCKED again = retry after a failed calculation.
  if v_room.phase not in ('SHOP', 'ODDS_LOCKED') then
    raise exception 'wrong_phase';
  end if;
  if v_room.phase = 'SHOP' then
    update public.races
      set horses = array(select id from public.room_players
                         where room_id = p_room and ticked order by joined_at, id),
          traits = coalesce((select jsonb_object_agg(id, trait) from public.room_players
                             where room_id = p_room and ticked), '{}'::jsonb)
      where id = v_room.race_id;
    update public.room_players set ready = false where room_id = p_room and ready;
    update public.rooms set phase = 'ODDS_LOCKED', last_activity_at = now() where id = p_room;
  end if;
  return private.race_input(v_room.race_id);
end;
$$;

-- v4: also returns the race's hot items and trait snapshot.
create or replace function private.race_input(p_race uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'race_id', r.id,
    'length', r.length,
    'weather', r.weather,
    'weather_enabled', m.weather_enabled,
    'hot_items', r.hot_items,
    'traits', r.traits,
    'horses', to_jsonb(r.horses),
    'bought', coalesce(
      (select jsonb_object_agg(b.player_id, b.boxes)
       from (select player_id, jsonb_agg(box order by created_at, id) as boxes
             from public.purchases where race_id = r.id group by player_id) b),
      '{}'::jsonb),
    'history', case when m.kind = 'office' then coalesce(
      (select jsonb_object_agg(s.horse, jsonb_build_object('races', s.races, 'wins', s.wins, 'top3', s.top3))
       from (select h as horse,
                    count(o.id) as races,
                    count(o.id) filter (where o.finish_order[1] = h) as wins,
                    count(o.id) filter (where h = any (o.finish_order[1:3])) as top3
             from unnest(r.horses) as h
             left join public.races o
               on o.room_id = r.room_id and o.id <> r.id and o.finish_order is not null and h = any (o.horses)
             group by h) s),
      '{}'::jsonb) end)
  from public.races r join public.rooms m on m.id = r.room_id
  where r.id = p_race;
$$;

-- Phones: the caller's own runner picks a trait while the shop is open (host-typed horses have no
-- uid and stay Normal). Same checks as buy_box.
create function public.set_trait(p_room uuid, p_trait text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_my_player(p_room, 'SHOP');
begin
  if p_trait is null
     or p_trait not in ('normal', 'charmed', 'tough', 'sprinter', 'stayer', 'mudder') then
    raise exception 'bad_trait';
  end if;
  if not v_player.ticked then
    raise exception 'not_racing';
  end if;
  update public.room_players set trait = p_trait where id = v_player.id returning * into v_player;
  return v_player;
end;
$$;
revoke execute on function public.set_trait(uuid, text) from public, anon;
grant execute on function public.set_trait(uuid, text) to authenticated;

-- /admin: the office hot-items switch.
create function public.admin_set_hot_items(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_on is null then
    raise exception 'bad_action';
  end if;
  update public.rooms set hot_items_enabled = p_on, last_activity_at = now() where kind = 'office';
end;
$$;
revoke execute on function public.admin_set_hot_items(boolean) from public, anon, authenticated;
grant execute on function public.admin_set_hot_items(boolean) to service_role;

-- v3: the overview also shows the hot-items switch.
create or replace function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'room', jsonb_build_object('id', r.id, 'code', r.code, 'phase', r.phase,
                               'weather_enabled', r.weather_enabled,
                               'hot_items_enabled', r.hot_items_enabled),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'horse_name', p.horse_name,
          'balance', private.balance(null, p.id),
          'has_pin', o.pin_hash is not null, 'phone', p.uid is not null,
          'archived', p.archived_at is not null)
        order by p.archived_at nulls first, lower(p.name))
      from public.room_players p left join private.office_pins o on o.player_id = p.id
      where p.room_id = r.id), '[]'::jsonb),
    'races', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', x.id, 'created_at', x.created_at, 'length', x.length, 'prize', x.prize,
          'horses', cardinality(x.horses), 'finished', x.finish_order is not null,
          'current', x.id is not distinct from r.race_id)
        order by x.created_at desc)
      from (select * from public.races where room_id = r.id order by created_at desc limit 30) x), '[]'::jsonb))
  from public.rooms r where r.kind = 'office';
$$;
```

Before saving, diff the four replaced bodies against their previous versions (Step 1): the only changes may be the `hot_items` / `traits` / `trait` lines and the comments.

- [ ] **Step 3: Write the DB tests** `tests/db/hotTraits.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { member, officeRoom } from './officeFixtures.ts';
import { fixtureOdds, shopRoom } from './raceFixtures.ts';

type Hot = { item: string; buff: string };
const ELIGIBLE = [
  'speed:self1', 'speed:self3', 'speed:star', 'speed:pass3',
  'attack:behind1', 'attack:behind3', 'attack:front1', 'attack:front3',
  'attack:leader', 'attack:top3', 'attack:all',
  'defense:block1', 'defense:immune', 'defense:reflect',
];
const hotOf = async (raceId: string) => {
  const [race] = await ok(adminClient().from('races').select('hot_items').eq('id', raceId));
  return race.hot_items as Hot[];
};
const traitsOf = async (raceId: string) => {
  const [race] = await ok(adminClient().from('races').select('traits').eq('id', raceId));
  return race.traits as Record<string, string>;
};
const traitOfPlayer = async (playerId: string) => {
  const [p] = await ok(adminClient().from('room_players').select('trait').eq('id', playerId));
  return p.trait as string;
};

describe('hot items', () => {
  afterAll(async () => {
    await ok(adminClient().rpc('admin_set_hot_items', { p_on: true })); // leave the office default
  });

  it(
    'opening the shop rolls 3 distinct eligible items, at most 2 per type',
    { timeout: 60_000 },
    async () => {
      const r = await shopRoom();
      let raceId = r.raceId;
      const seen = new Set<string>();
      let extended = 0;
      for (let i = 0; i < 30; i++) {
        if (i > 0) {
          await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
          const room = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
          raceId = room.race_id as string;
        }
        const hot = await hotOf(raceId);
        expect(hot).toHaveLength(3);
        expect(new Set(hot.map((h) => h.item)).size).toBe(3);
        for (const { item, buff } of hot) {
          expect(ELIGIBLE).toContain(item);
          expect(['lucky', 'extended']).toContain(buff);
          if (item === 'defense:block1' || item === 'defense:reflect') expect(buff).toBe('lucky');
          if (buff === 'extended') extended++;
          seen.add(item);
        }
        for (const type of ['speed', 'attack', 'defense'])
          expect(hot.filter((h) => h.item.startsWith(`${type}:`)).length).toBeLessThanOrEqual(2);
      }
      expect(seen.size).toBeGreaterThan(9); // random order: most items come up in 90 picks
      expect(extended).toBeGreaterThan(10); // ~40 of 90 expected
    },
  );

  it('the office switch off opens the shop with no hot items', async () => {
    const r = await officeRoom();
    const horses = [await member('H'), await member('H')];
    for (const h of horses)
      await ok(r.host.rpc('set_ticked', { p_player: h.player.id, p_ticked: true }));
    try {
      await ok(r.admin.rpc('admin_set_hot_items', { p_on: false }));
      const shop = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
      expect(await hotOf(shop.race_id as string)).toEqual([]);
    } finally {
      await ok(r.admin.rpc('admin_set_hot_items', { p_on: true }));
    }
  });

  it('race_input carries the list and back-to-shop keeps it', async () => {
    const r = await shopRoom();
    const hot = await hotOf(r.raceId);
    const input = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(input.hot_items).toEqual(hot);
    await ok(adminClient().rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) }));
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
    expect(await hotOf(r.raceId)).toEqual(hot);
    const again = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(again.hot_items).toEqual(hot);
  });

  it('admin_set_hot_items is service-only and shows in the overview', async () => {
    const phone = await anonClient();
    expect(await fails(phone.rpc('admin_set_hot_items', { p_on: false }))).toMatch(
      /permission denied/,
    );
    const admin = adminClient();
    await ok(admin.rpc('admin_set_hot_items', { p_on: false }));
    const o = (await ok(admin.rpc('admin_overview'))) as { room: { hot_items_enabled: boolean } };
    expect(o.room.hot_items_enabled).toBe(false);
    await ok(admin.rpc('admin_set_hot_items', { p_on: true }));
  });
});

describe('traits', () => {
  it('set_trait: own runner, valid code, shop only', async () => {
    const r = await shopRoom();
    const me = await ok(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'tough' }));
    expect(me.id).toBe(r.ali.player.id);
    expect(me.trait).toBe('tough');
    expect(await traitOfPlayer(r.bea.player.id)).toBe('normal'); // Ali's call changed only Ali
    expect(
      await fails(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'lucky' })),
    ).toBe('bad_trait');
    expect(
      await fails(r.cal.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'tough' })),
    ).toBe('not_racing');
    const outsider = await anonClient();
    expect(await fails(outsider.rpc('set_trait', { p_room: r.room.id, p_trait: 'tough' }))).toBe(
      'not_in_room',
    );
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(
      await fails(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'stayer' })),
    ).toBe('wrong_phase');
  });

  it('the lock snapshots every runner; the retry and the race keep it', async () => {
    const r = await shopRoom();
    await ok(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'tough' }));
    await ok(r.bea.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'mudder' }));
    const expected = {
      [r.ali.player.id]: 'tough',
      [r.bea.player.id]: 'mudder',
      [r.siti.id]: 'normal',
      [r.dan.id]: 'normal',
    };
    const input = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(input.traits).toEqual(expected);
    expect(await traitsOf(r.raceId)).toEqual(expected);
    // A change after the lock (service role, behind the RPCs' back) does not reach this race.
    await ok(
      adminClient().from('room_players').update({ trait: 'stayer' }).eq('id', r.ali.player.id),
    );
    const retry = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(retry.traits).toEqual(expected);
    await ok(adminClient().rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) }));
    const start = await ok(r.host.rpc('start_race_begin', { p_room: r.room.id }));
    expect(start.traits).toEqual(expected);
  });

  it('back to the shop reopens picking and the next lock snapshots again', async () => {
    const r = await shopRoom();
    await ok(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'tough' }));
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    await ok(adminClient().rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) }));
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
    expect(await traitsOf(r.raceId)).toEqual({});
    await ok(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'sprinter' }));
    const input = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(input.traits[r.ali.player.id]).toBe('sprinter');
  });

  it('a new race starts every trait at Normal', async () => {
    const r = await shopRoom();
    await ok(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'charmed' }));
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
    expect(await traitOfPlayer(r.ali.player.id)).toBe('normal');
  });
});
```

- [ ] **Step 4: Apply and regenerate types**

Run: `npx supabase db reset` then (Git Bash) `npx supabase gen types typescript --local > src/net/database.types.ts`
Expected: `races.Row.hot_items: Json`, `races.Row.traits: Json`, `rooms.Row.hot_items_enabled: boolean`, `room_players.Row.trait: string`, and `set_trait` / `admin_set_hot_items` under `Functions`. Format only this file if the repo style needs it (`npx prettier --write src/net/database.types.ts`), and check `git diff --stat src/net/database.types.ts` shows only these additions.

- [ ] **Step 5: Run**

Run: `npm run test:db; npm run typecheck`
Expected: all pass, including the existing `phases`, `shop`, `flow`, `office` and `weather` tests (they don't read the new columns). The realtime test can flake right after `db reset`; rerun once.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261105000021_hot_items_traits.sql tests/db/hotTraits.test.ts src/net/database.types.ts
git commit -m "feat(db): hot items at shop open, trait picks and lock snapshot, admin switch"
```

---

### Task 9: Edge Functions pass hot items and traits

**Files:**
- Modify: `supabase/functions/_shared/http.ts`, `supabase/functions/lock-odds/index.ts`, `supabase/functions/start-race/index.ts`, `supabase/functions/admin/index.ts`
- Test: `tests/db/functions.test.ts`

Context: `RaceInputRow` in `supabase/functions/_shared/http.ts` mirrors `private.race_input` (`race_id, length, weather, weather_enabled, horses, bought, history`). `lock-odds` calls `simulateOdds({ horses, bought, length, weather }, rng, undefined, history)`; `start-race` calls `simulateRace({ seed, horses, bought, length, weather })`. Admin actions are a map `RPC` of action → `[rpcName, args]`. Task 8's migration must be applied locally.

- [ ] **Step 1: Write the failing test** (append inside `describe('lock-odds and start-race', …)` in `tests/db/functions.test.ts`; `unpackTimeline`, `PackedTimeline`, `adminClient`, `shopRoom`, `invoke`, `ok` are already imported there):

```ts
  it('races with the hot items and the trait snapshot', { timeout: 60_000 }, async () => {
    const r = await shopRoom();
    await ok(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'tough' }));
    await invoke(r.host, 'lock-odds', { room: r.room.id });
    await invoke(r.host, 'start-race', { room: r.room.id });
    const [race] = await ok(
      adminClient().from('races').select('hot_items, traits').eq('id', r.raceId),
    );
    const [row] = await ok(
      adminClient().from('race_timelines').select('timeline').eq('race_id', r.raceId),
    );
    const timeline = unpackTimeline(row.timeline as PackedTimeline);
    expect(timeline.hot).toHaveLength(3);
    expect(timeline.hot).toEqual(race.hot_items);
    expect(timeline.traits).toEqual(race.traits);
    expect(timeline.traits?.[r.ali.player.id]).toBe('tough');
    expect(timeline.traits?.[r.siti.id]).toBe('normal');
  });
```

Run: `npm run test:db -- tests/db/functions.test.ts`
Expected: FAIL (`timeline.hot` is `[]` and every trait Normal: the old functions don't pass them).

- [ ] **Step 2: Implement**

`supabase/functions/_shared/http.ts`: change the type import to `import type { BoxType, HotItem, RaceLength, Trait, Weather } from '../../../src/sim/types.ts';` and in `RaceInputRow`, after `weather_enabled: boolean;` add:

```ts
  hot_items: HotItem[];
  /** Runner -> trait, snapshotted when the shop closed (spec D). */
  traits: Record<string, Trait>;
```

`supabase/functions/lock-odds/index.ts`: replace the `simulateOdds(…)` first argument

```ts
    { horses: input.horses, bought: input.bought, length: input.length, weather },
```

with

```ts
    {
      horses: input.horses,
      bought: input.bought,
      length: input.length,
      weather,
      hot: input.hot_items,
      traits: input.traits,
    },
```

`supabase/functions/start-race/index.ts`: in the `simulateRace({ … })` call, after `weather: input.weather,` add:

```ts
    hot: input.hot_items,
    traits: input.traits,
```

`supabase/functions/admin/index.ts`: in `RPC`, after the `weather:` line add:

```ts
  hot_items: (b) => ['admin_set_hot_items', { p_on: b.on === true }],
```

- [ ] **Step 3: Restart the local functions** (they now import `src/sim/hot.ts` and `src/sim/traits.ts`)

Run: `npx supabase stop; npx supabase start`

- [ ] **Step 4: Run**

Run: `npm run test:db -- tests/db/functions.test.ts; npm run typecheck`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/http.ts supabase/functions/lock-odds/index.ts supabase/functions/start-race/index.ts supabase/functions/admin/index.ts tests/db/functions.test.ts
git commit -m "feat(functions): odds and race use hot items and the trait snapshot"
```

---

### Task 10: Hot strip, trait helpers and the phone (buttons 🔥, trait picker)

**Files:**
- Create: `src/app/HotItems.tsx`, `src/app/HotItems.test.tsx`, `src/app/Traits.tsx`, `src/app/Traits.test.tsx`, `src/play/TraitPicker.tsx`, `src/play/TraitPicker.test.tsx`
- Modify: `src/net/rooms.ts`, `src/play/PlayPage.tsx`, `src/app/app.css`

Context: unit tests run in Node (`vite.config.ts`: `environment: 'node'`), so components are checked with `renderToStaticMarkup` from `react-dom/server` (React 19, already installed). `ITEM_INFO` (`src/render/items.ts`) gives each item's name and icon. `races.hot_items` / `races.traits` are `Json` in the generated types (Task 8), so readers parse them defensively; old races have `[]` / `{}`. Stampede (`speed:pass3`) and Thunderclap (`attack:all`) come only from mystery boxes, so they never flame a buy button. `PlayPage.tsx`'s `PanelProps` is `RoomState & { mine; balance; act; busy }` (so `race` is available), `ShopPanel` returns early for unticked players, and `act(fn)` runs an RPC then refreshes.

- [ ] **Step 1: Write the failing tests**

`src/app/HotItems.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HotStrip, hotBoxTypes, hotOf, hotText } from './HotItems.tsx';

const HOT = [
  { item: 'speed:self1', buff: 'lucky' },
  { item: 'attack:leader', buff: 'extended' },
  { item: 'defense:block1', buff: 'lucky' },
] as const;

describe('hot items UI', () => {
  it('reads a race row or timeline list, anything else as none', () => {
    expect(hotOf(HOT)).toEqual(HOT);
    expect(hotOf(null)).toEqual([]);
    expect(hotOf(undefined)).toEqual([]);
    expect(hotOf({})).toEqual([]);
    expect(hotOf([{ item: 'nope', buff: 'lucky' }])).toEqual([]);
  });

  it('writes the strip text', () => {
    expect(hotText(HOT)).toBe(
      '🥕 Carrot 🍀 Lucky · 🪢 Golden Lasso ⏱️ Extended · 🛡️ Horseshoe Shield 🍀 Lucky',
    );
    expect(hotText([])).toBeNull();
  });

  it('flags the box types a bought box can give a hot item from', () => {
    expect([...hotBoxTypes(HOT)].sort()).toEqual(['attack', 'defense', 'speed']);
    expect([...hotBoxTypes([{ item: 'speed:pass3', buff: 'lucky' }])]).toEqual([]);
    expect([...hotBoxTypes([{ item: 'attack:all', buff: 'extended' }])]).toEqual([]);
  });

  it('shows nothing without hot items', () => {
    expect(renderToStaticMarkup(<HotStrip hot={[]} />)).toBe('');
    expect(renderToStaticMarkup(<HotStrip hot={HOT} />)).toContain('🔥 Hot items');
  });
});
```

`src/app/Traits.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TRAIT_CODES } from '../sim/config.ts';
import { TRAIT_INFO, TRAIT_LEGEND, TraitIcon, asTrait, traitLabel, traitOf } from './Traits.tsx';

describe('traits UI', () => {
  it('labels every trait with icon, name and a one-line effect', () => {
    for (const t of TRAIT_CODES) expect(TRAIT_INFO[t].effect.length).toBeGreaterThan(0);
    expect(traitLabel('tough')).toBe('🛡️ Tough · hits hurt less, boosts help less');
    expect(TRAIT_LEGEND).toBe(
      '⚖️ Normal · 🧿 Charmed · 🛡️ Tough · ⚡ Sprinter · 🐢 Stayer · 🌧️ Mudder',
    );
  });

  it('reads unknown or missing traits as Normal', () => {
    expect(asTrait('mudder')).toBe('mudder');
    expect(asTrait('lucky')).toBe('normal');
    expect(asTrait(undefined)).toBe('normal');
    expect(traitOf({ a: 'stayer' }, 'a')).toBe('stayer');
    expect(traitOf({ a: 'stayer' }, 'b')).toBe('normal');
    expect(traitOf(null, 'a')).toBe('normal');
  });

  it('the icon carries the name for screen readers', () => {
    const html = renderToStaticMarkup(<TraitIcon trait="sprinter" />);
    expect(html).toContain('⚡');
    expect(html).toContain('Sprinter');
  });
});
```

`src/play/TraitPicker.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TraitPicker } from './TraitPicker.tsx';

describe('TraitPicker', () => {
  it('six buttons, the current pick pressed', () => {
    const html = renderToStaticMarkup(
      <TraitPicker current="tough" disabled={false} onPick={() => {}} />,
    );
    expect(html.match(/<button/g)).toHaveLength(6);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>🛡️ Tough · hits hurt less, boosts help less</);
    expect(html).toContain('Your trait');
  });
});
```

Run: `npx vitest run src/app src/play`
Expected: FAIL (modules missing).

- [ ] **Step 2: Implement the shared helpers**

`src/app/HotItems.tsx`:

```tsx
import { ITEM_INFO } from '../render/items.ts';
import type { BoxType, HotBuff, HotItem } from '../sim/types.ts';

export const BUFF_TEXT: Readonly<Record<HotBuff, string>> = {
  lucky: '🍀 Lucky',
  extended: '⏱️ Extended',
};

/** A race row's `hot_items` or a timeline's `hot`; anything malformed (or an old race) is none. */
export const hotOf = (value: unknown): HotItem[] =>
  Array.isArray(value)
    ? (value as HotItem[]).filter((x) => x && x.item in ITEM_INFO && x.buff in BUFF_TEXT)
    : [];

/** "🥕 Carrot 🍀 Lucky · …", or null when there are none. */
export const hotText = (hot: readonly HotItem[]): string | null =>
  hot.length > 0
    ? hot
        .map(
          ({ item, buff }) => `${ITEM_INFO[item].icon} ${ITEM_INFO[item].name} ${BUFF_TEXT[buff]}`,
        )
        .join(' · ')
    : null;

/** Box types a bought box can give a hot item from (Stampede and Thunderclap are mystery-only). */
export const hotBoxTypes = (hot: readonly HotItem[]): ReadonlySet<BoxType> =>
  new Set(
    hot
      .filter((x) => x.item !== 'speed:pass3' && x.item !== 'attack:all')
      .map((x) => x.item.split(':')[0] as BoxType),
  );

/** Shop to finish and replays (spec C); nothing when the list is empty. */
export function HotStrip({ hot }: { hot: unknown }) {
  const text = hotText(hotOf(hot));
  if (!text) return null;
  return (
    <p className="chip hot-strip">
      🔥 Hot items: {text} <small>· 🍀 2× more likely from its box · ⏱️ lasts 50 % longer</small>
    </p>
  );
}
```

`src/app/Traits.tsx`:

```tsx
import { TRAIT_CODES } from '../sim/config.ts';
import type { Trait } from '../sim/types.ts';

/** Phone and board wording (spec D); no numbers, so tuning never changes the text. */
export const TRAIT_INFO: Readonly<Record<Trait, { icon: string; name: string; effect: string }>> = {
  normal: { icon: '⚖️', name: 'Normal', effect: 'no upside, no downside' },
  charmed: { icon: '🧿', name: 'Charmed', effect: 'fewer duds, never the rare upgrades' },
  tough: { icon: '🛡️', name: 'Tough', effect: 'hits hurt less, boosts help less' },
  sprinter: { icon: '⚡', name: 'Sprinter', effect: 'fast start, smaller finishing kick' },
  stayer: { icon: '🐢', name: 'Stayer', effect: 'slow start, big finishing kick' },
  mudder: { icon: '🌧️', name: 'Mudder', effect: 'loves rain and fog, slower when clear' },
};

export const traitLabel = (t: Trait) =>
  `${TRAIT_INFO[t].icon} ${TRAIT_INFO[t].name} · ${TRAIT_INFO[t].effect}`;

export const TRAIT_LEGEND = TRAIT_CODES.map(
  (t) => `${TRAIT_INFO[t].icon} ${TRAIT_INFO[t].name}`,
).join(' · ');

/** A stored trait code; anything unknown or missing is Normal. */
export const asTrait = (value: unknown): Trait =>
  (TRAIT_CODES as readonly unknown[]).includes(value) ? (value as Trait) : 'normal';

/** `races.traits` (Json) or `timeline.traits`: this horse's trait. */
export const traitOf = (traits: unknown, id: string): Trait =>
  asTrait(
    traits && typeof traits === 'object' ? (traits as Record<string, unknown>)[id] : undefined,
  );

export function TraitIcon({ trait }: { trait: Trait }) {
  return (
    <span title={TRAIT_INFO[trait].name}>
      <span aria-hidden="true">{TRAIT_INFO[trait].icon}</span>
      <span className="visually-hidden">{TRAIT_INFO[trait].name}</span>
    </span>
  );
}
```

`src/play/TraitPicker.tsx`:

```tsx
import { traitLabel } from '../app/Traits.tsx';
import { TRAIT_CODES } from '../sim/config.ts';
import type { Trait } from '../sim/types.ts';

/** The phone's per-race trait pick (spec D): saves on tap, the current pick pressed. */
export function TraitPicker(props: {
  current: Trait;
  disabled: boolean;
  onPick: (trait: Trait) => void;
}) {
  return (
    <fieldset className="trait-pick">
      <legend>Your trait</legend>
      {TRAIT_CODES.map((t) => (
        <button
          key={t}
          type="button"
          className="card"
          aria-pressed={props.current === t}
          disabled={props.disabled}
          onClick={() => props.onPick(t)}
        >
          {traitLabel(t)}
        </button>
      ))}
    </fieldset>
  );
}
```

- [ ] **Step 3: RPC and error text** in `src/net/rooms.ts`

Add `Trait` to the `../sim/types.ts` type import. After `buyBox` add:

```ts
export const setTrait = (roomId: string, trait: Trait) =>
  call(supabase.rpc('set_trait', { p_room: roomId, p_trait: trait }));
```

In `ERROR_TEXT`, after `bad_box: 'Unknown box type.',` add `bad_trait: 'Pick one of the six traits.',`.

- [ ] **Step 4: The phone** (`src/play/PlayPage.tsx`)

Imports: `import { HotStrip, hotBoxTypes, hotOf } from '../app/HotItems.tsx';`, `import { TRAIT_INFO, asTrait, traitOf } from '../app/Traits.tsx';`, `import { TraitPicker } from './TraitPicker.tsx';`, and add `setTrait,` to the `../net/rooms.ts` import list (after `setReady,`).

In `PlayRoom`'s JSX, right after `<WeatherBadge weather={state.race?.weather} />` add:

```tsx
      <HotStrip hot={state.race?.hot_items} />
```

`ShopPanel`: change the signature to `function ShopPanel({ room, race, mine, purchases, balance, act, busy }: PanelProps) {`. After `const boxes = boxesOf(purchases, mine.id);` add `const hotTypes = hotBoxTypes(hotOf(race?.hot_items));`. Replace `<span>{BOX_NAME[box]}</span>` with:

```tsx
            <span>
              {BOX_NAME[box]}
              {hotTypes.has(box) && ' 🔥'}
            </span>
```

and after the closing `</div>` of `box-cards` (before `<p>Boxes go in your own lane…`) add:

```tsx
      <TraitPicker
        current={asTrait(mine.trait)}
        disabled={busy}
        onPick={(trait) => act(() => setTrait(room.id, trait))}
      />
```

`BetPanel`: as the first child inside its returned `<>`, add:

```tsx
      {horses.includes(mine.id) && (
        <p>
          Trait: {TRAIT_INFO[traitOf(race?.traits, mine.id)].icon}{' '}
          {TRAIT_INFO[traitOf(race?.traits, mine.id)].name}
        </p>
      )}
```

- [ ] **Step 5: Styles** in `src/app/app.css`, after the `.weather-badge` rule:

```css
.hot-strip {
  display: inline-block;
  margin: 0 0 0.5rem;
}
.trait-pick {
  display: grid;
  gap: 8px;
}
.trait-pick button[aria-pressed='true'] {
  color: var(--bg);
  background: var(--gold);
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run src/app src/play; npm run typecheck; npm run lint`
Expected: PASS / clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/HotItems.tsx src/app/HotItems.test.tsx src/app/Traits.tsx src/app/Traits.test.tsx src/play/TraitPicker.tsx src/play/TraitPicker.test.tsx src/net/rooms.ts src/play/PlayPage.tsx src/app/app.css
git commit -m "feat(ui): hot strip, hot box buttons and the phone trait picker"
```

---

### Task 11: Big screen boards, admin switch, standings and replay

**Files:**
- Modify: `src/track/TrackPage.tsx`, `src/admin/AdminPage.tsx`, `src/render/RaceView.tsx`, `src/history/StatsPage.tsx`

Context: helpers from Task 10 — `HotStrip`, `hotOf` (`src/app/HotItems.tsx`), `TraitIcon`, `TRAIT_LEGEND`, `asTrait`, `traitOf` (`src/app/Traits.tsx`). On `TrackPage`, `ShopBoard({ room, players, purchases, online, act, busy })` runs `useChances({ horses, bought, length })` (simulations in a worker via `simulateShares`) and shows a runner table whose Horse cell is `<HorseMark ready={p.ready} /> {horseName(p)}…`; `BettingBoard` has `<WeatherBadge weather={race?.weather} />` and a table whose header is `#`, `Horse`, `{office && <th>Form</th>}`, `Boxes`, `Win`, `Place`; `RunningBoard` has `<WeatherBadge weather={race?.weather} />` right after its visually-hidden `h1`. `RaceView` (used by the big screen, replays and the sandbox) renders the standings `<ol className="standings panel">`.

- [ ] **Step 1: Shop board** (`src/track/TrackPage.tsx`)

Imports: `import { HotStrip, hotOf } from '../app/HotItems.tsx';` and `import { TRAIT_LEGEND, TraitIcon, asTrait, traitOf } from '../app/Traits.tsx';`.

`ShopBoard`: change the signature to `function ShopBoard({ room, players, race, purchases, online, act, busy }: BoardProps) {` and the chances input to:

```ts
  const chances = useChances({
    horses: ids,
    bought: Object.fromEntries(ids.map((id) => [id, boxesOf(purchases, id)])),
    length: room.race_length as RaceLength,
    hot: hotOf(race?.hot_items),
    traits: Object.fromEntries(racing.map((p) => [p.id, asTrait(p.trait)])),
  });
```

After `<h1>Shop open · room {room.code}</h1>` add `<HotStrip hot={race?.hot_items} />`. In the runner row replace `<HorseMark ready={p.ready} /> {horseName(p)}` with:

```tsx
                  <HorseMark ready={p.ready} /> <TraitIcon trait={asTrait(p.trait)} />{' '}
                  {horseName(p)}
```

In the small print under the table change "Chances from {chances?.sims ?? '…'} simulated races with these boxes." to "Chances from {chances?.sims ?? '…'} simulated races with these boxes, traits and hot items." (keep the rest of the sentence).

- [ ] **Step 2: Betting and race boards**

`BettingBoard`: after `<WeatherBadge weather={race?.weather} />` add `<HotStrip hot={race?.hot_items} />`. In the header, after `{office && <th>Form</th>}` add `<th>Trait</th>`. In each row, after the `{office && ( <td>{formatForm(…)}</td> )}` cell add:

```tsx
                <td>
                  <TraitIcon trait={traitOf(race?.traits, id)} />
                </td>
```

After the closing `</div>` of the table panel add:

```tsx
      <p>
        <small>Traits: {TRAIT_LEGEND}</small>
      </p>
```

`RunningBoard`: after `<WeatherBadge weather={race?.weather} />` add `<HotStrip hot={race?.hot_items} />`.

- [ ] **Step 3: Standings icon** (`src/render/RaceView.tsx`)

Import `import { TraitIcon, asTrait } from '../app/Traits.tsx';`. In the standings `<li>`, replace `<Silk color={(colors ?? defaultColors)(h, lane).silk} /> #{lane + 1} {names[h] ?? '?'}` with:

```tsx
              <Silk color={(colors ?? defaultColors)(h, lane).silk} /> #{lane + 1}{' '}
              {timeline.traits && <TraitIcon trait={asTrait(timeline.traits[h])} />}{' '}
              {names[h] ?? '?'}
```

(Old timelines have no `traits`: no icon. Replays get traits from `timeline.traits` through this same list.)

- [ ] **Step 4: Replay strip** (`src/history/StatsPage.tsx`)

Import `import { HotStrip } from '../app/HotItems.tsx';` and in `Replay`, after `<WeatherBadge weather={timeline?.weather} />` add `<HotStrip hot={timeline?.hot} />`.

- [ ] **Step 5: Admin switch** (`src/admin/AdminPage.tsx`)

Change `room: { phase: string; weather_enabled: boolean }` in `type Overview` to `room: { phase: string; weather_enabled: boolean; hot_items_enabled: boolean }`. After the Weather `<p>…</p>` (the one with `run('weather', { on: e.target.checked })`) add:

```tsx
      <p>
        <label>
          <input
            type="checkbox"
            checked={data?.room.hot_items_enabled ?? true}
            disabled={busy || !data}
            onChange={(e) => run('hot_items', { on: e.target.checked })}
          />{' '}
          Hot items (3 buffed powerups per race)
        </label>
      </p>
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck; npm run lint; npm test; npm run build`
Expected: clean / PASS.

- [ ] **Step 7: Commit**

```bash
git add src/track/TrackPage.tsx src/admin/AdminPage.tsx src/render/RaceView.tsx src/history/StatsPage.tsx
git commit -m "feat(ui): hot strip and trait icons on the boards, admin hot-items switch"
```

---

### Task 12: In-race 🔥, Extended effect durations, commentary

**Files:**
- Modify: `src/render/items.ts`, `src/render/Pixel2DRenderer.ts`, `src/render/hd2d/HD2DRenderer.ts`, `src/render/hd2d/effects.ts`, `src/audio/lines.ts`, `src/audio/commentator.ts`
- Test: `src/render/items.test.ts`, `src/render/hd2d/effects.test.ts`, `src/audio/commentator.test.ts`

Context: `popupOf(event)` in `src/render/items.ts` returns `` `${icon} ${name}` `` for a pickup. Both renderers draw the held item over the horse with `const icon = e.item ? ITEM_INFO[e.item].icon : '💨';` (2D, `Pixel2DRenderer.ts`) / `const icon = e.item ? ITEM_INFO[e.item].icon : '\u{1F4A8}';` (HD, `HD2DRenderer.ts`), and build effects with `effectsOf(timeline.events)` (2D: `this.effects = effectsOf(timeline.events).filter(…)`; HD: `this.effects = effectsOf(timeline.events);`). In `src/render/hd2d/effects.ts`, `EFFECT_SECONDS.stampede/thunder/lasso/swarm` come from `EFFECTS[...].seconds` (lasso + 0.4), so an Extended item would end on screen before it ends in the sim; `effectSeconds(item, hot)` from `src/sim/hot.ts` gives the race's seconds. The commentator picks big-moment lines first (`bigMoment`), then ordinary item jokes (`itemJoke`) when 4 s have passed since the last line.

- [ ] **Step 1: Write the failing tests**

Append to `src/render/items.test.ts`:

```ts
describe('popupOf hot items', () => {
  it('marks a hot pickup with a flame', () => {
    expect(
      popupOf({ t: 1, type: 'pickup', horse: 'a', kind: 'speed', item: 'speed:self1', hot: 'lucky' }),
    ).toBe('🔥 🥕 Carrot');
    expect(popupOf({ t: 1, type: 'pickup', horse: 'a', kind: 'speed', item: 'speed:self1' })).toBe(
      '🥕 Carrot',
    );
  });
});
```

Append to `src/render/hd2d/effects.test.ts`:

```ts
describe('Extended hot items on screen', () => {
  const events: RaceEvent[] = [
    { t: 5, type: 'pickup', horse: 'a', kind: 'mystery', item: 'speed:pass3', hot: 'extended' },
    { t: 6, type: 'hit', horse: 'b', by: 'c', item: 'attack:leader' },
    { t: 7, type: 'blocked', horse: 'b', by: 'c', item: 'attack:leader', reason: 'shield' },
    { t: 8, type: 'hit', horse: 'd', by: 'c', item: 'attack:top3' },
  ];
  const hot = [
    { item: 'speed:pass3', buff: 'extended' },
    { item: 'attack:leader', buff: 'extended' },
  ] as const;

  it('special effects last as long as the Extended item does in the sim', () => {
    const fx = effectsOf(events, hot).filter((f) => SPECIAL_KINDS.has(f.kind));
    expect(fx.map((f) => `${f.kind}:${durationOf(f)}`)).toEqual([
      `stampede:${EFFECT_SECONDS.stampede + 4}`, // 8 s -> 12 s
      `lasso:${EFFECT_SECONDS.lasso + 1}`, // 2 s -> 3 s
      'lasso:0.5', // a blocked one still plays only its miss
      `swarm:${EFFECT_SECONDS.swarm}`, // not hot
    ]);
  });

  it('without hot items nothing changes', () => {
    expect(effectsOf(events)).toEqual(effectsOf(events, []));
    expect(durationOf(effectsOf(events).find((f) => f.kind === 'stampede')!)).toBe(
      EFFECT_SECONDS.stampede,
    );
  });
});
```

Append to `src/audio/commentator.test.ts`:

```ts
describe('hot item and trait lines', () => {
  it('calls a hot pickup', () => {
    const tl = fakeTimeline({ a: 10, b: 5 }, 100, [
      { t: 5, type: 'pickup', horse: 'a', kind: 'speed', item: 'speed:self1', hot: 'lucky' },
    ]);
    const c = createCommentator(tl, (h) => h, 0, { rand: () => 0 });
    expect(c.linesUpTo(6)).toContain('Hot item! a grabs a Lucky Carrot!');
  });

  it('a Mudder in the rain, a Tough horse under the Lasso and under an ordinary hit', () => {
    const tl = {
      ...fakeTimeline({ a: 10, b: 5 }, 100, [
        { t: 5, type: 'hit', horse: 'b', by: 'a', item: 'attack:leader' },
        { t: 12, type: 'hit', horse: 'b', by: 'a', item: 'attack:behind1' },
      ]),
      weather: 'rain' as const,
      traits: { a: 'mudder', b: 'tough' } as const,
    };
    const c = createCommentator(tl, (h) => h, -0.5, { rand: () => 0 });
    expect(c.linesUpTo(0.1)).toContain('Mudder a loves this rain!');
    expect(c.linesUpTo(6)).toContain('Golden Lasso from a, but Tough b keeps moving!');
    expect(c.linesUpTo(13)).toContain('Tough b shrugs it off!');
  });
});
```

Run: `npx vitest run src/render src/audio`
Expected: FAIL (no flame, no `hot` argument, no new lines).

- [ ] **Step 2: Popup and held icons**

`src/render/items.ts`, in `popupOf` case `'pickup'`, replace the return with:

```ts
      return event.item
        ? `${event.hot ? '🔥 ' : ''}${ITEM_INFO[event.item].icon} ${ITEM_INFO[event.item].name}`
        : '💨 Fizzled';
```

`src/render/Pixel2DRenderer.ts`: replace `const icon = e.item ? ITEM_INFO[e.item].icon : '💨';` with

```ts
      const icon = `${e.hot ? '🔥' : ''}${e.item ? ITEM_INFO[e.item].icon : '💨'}`;
```

and `this.effects = effectsOf(timeline.events).filter(` with `this.effects = effectsOf(timeline.events, timeline.hot).filter(`.

`src/render/hd2d/HD2DRenderer.ts`: replace `const icon = e.item ? ITEM_INFO[e.item].icon : '\u{1F4A8}';` with

```ts
      const icon = `${e.hot ? '\u{1F525}' : ''}${e.item ? ITEM_INFO[e.item].icon : '\u{1F4A8}'}`;
```

and `this.effects = effectsOf(timeline.events);` with `this.effects = effectsOf(timeline.events, timeline.hot);`.

- [ ] **Step 3: Extended durations** in `src/render/hd2d/effects.ts`

Imports: add `import { effectSeconds } from '../../sim/hot.ts';` and `HotItem` to the `../../sim/types.ts` type import.

Replace the `effectsOf` doc comment, signature and its first line `const out: Effect[] = [];` with:

```ts
/**
 * Built once per race. A box opens when it is grabbed on screen (ITEM_HOLD_SECONDS early).
 * `hot` is the race's hot list: an Extended special item plays as long as it lasts in the sim.
 */
export function effectsOf(events: readonly RaceEvent[], hot: readonly HotItem[] = []): Effect[] {
  /** The full effect of an Extended item runs longer by the extra sim seconds; {} otherwise. */
  const longer = (kind: EffectKind, item: ItemCode): { seconds?: number } => {
    const extra = effectSeconds(item, hot) - EFFECTS[item].seconds;
    return extra > 0 ? { seconds: EFFECT_SECONDS[kind] + extra } : {};
  };
  const out: Effect[] = [];
```

then in the pickup branch replace `if (e.item === 'speed:pass3') out.push({ kind: 'stampede', horse: e.horse, t0: e.t });` with

```ts
      if (e.item === 'speed:pass3')
        out.push({ kind: 'stampede', horse: e.horse, t0: e.t, ...longer('stampede', e.item) });
```

and replace `const miss = e.type === 'hit' ? {} : { seconds: MISS_SECONDS[special] };` with

```ts
      const miss = e.type === 'hit' ? longer(special, e.item) : { seconds: MISS_SECONDS[special] };
```

(The other effect kinds — speed sparkle, hit stars, shield, dud swirl — have fixed on-screen lengths not tied to `EFFECTS`, so they stay as they are.)

- [ ] **Step 4: Commentary**

`src/audio/lines.ts`, after the `bump:` pool add:

```ts
  hot: ['Hot item! {h} grabs a {b} {i}!', '{h} picks up a hot one: {b} {i}!'],
  mudderRain: ['Mudder {h} loves this rain!', '{h} is a Mudder. Bring on the puddles!'],
  tough: ['Tough {h} shrugs it off!', '{h} is Tough. That barely hurt!'],
  toughLasso: [
    'Golden Lasso from {by}, but Tough {v} keeps moving!',
    'Tough {v} drags the lasso along!',
  ],
```

`src/audio/commentator.ts`:

Imports: `import { ITEM_INFO } from '../render/items.ts';` and add `Trait` to the `../sim/types.ts` type import. Below `type Line = …;` add:

```ts
type TraitOf = (h: HorseId) => Trait;
const BUFF_NAME = { lucky: 'Lucky', extended: 'Extended' } as const;
```

Change the start of `bigMoment` to take the trait lookup and pick the Tough line for a lassoed Tough horse:

```ts
function bigMoment(e: RaceEvent, name: (h: HorseId) => string, trait: TraitOf): Line | null {
  if (e.type === 'hit' && e.item === 'attack:leader') {
    const vars = { by: name(e.by), v: name(e.horse) };
    return [trait(e.horse) === 'tough' ? LINES.toughLasso : LINES.lasso, vars];
  }
```

(rest of `bigMoment` unchanged). Change `itemJoke`'s signature to `function itemJoke(e: RaceEvent, name: (h: HorseId) => string, trait: TraitOf): Line | null {`; in its `'hit'` case, right after `const vars = { v: name(e.horse), by: name(e.by) };` add

```ts
      if (trait(e.horse) === 'tough') return [LINES.tough, { h: name(e.horse) }];
```

and in its `'pickup'` case, right after `const vars = { h: name(e.horse) };` add

```ts
      if (e.hot && e.item)
        return [LINES.hot, { h: name(e.horse), b: BUFF_NAME[e.hot], i: ITEM_INFO[e.item].name }];
```

In `createCommentator`, after `const rand = opts.rand ?? Math.random;` add `const trait: TraitOf = (h) => timeline.traits?.[h] ?? 'normal';`. Replace `if (timeline.weather === 'rain') say(LINES.rainStart);` with

```ts
        if (timeline.weather === 'rain') {
          say(LINES.rainStart);
          const mudder = timeline.horses.find((h) => trait(h) === 'mudder');
          if (mudder) say(LINES.mudderRain, { h: name(mudder) });
        }
```

(keep the `else if (timeline.weather === 'fog') say(LINES.fogStart);` that follows), and replace `const pick = bigMoment(e, name) ?? (quiet() ? itemJoke(e, name) : null);` with

```ts
          const pick = bigMoment(e, name, trait) ?? (quiet() ? itemJoke(e, name, trait) : null);
```

- [ ] **Step 5: Verify**

Run: `npx vitest run src/render src/audio; npm run typecheck; npm run lint`
Expected: PASS / clean (existing effects tests call `effectsOf(events)` and keep their durations; existing commentator tests have no traits or hot pickups).

- [ ] **Step 6: Commit**

```bash
git add src/render/items.ts src/render/items.test.ts src/render/Pixel2DRenderer.ts src/render/hd2d/HD2DRenderer.ts src/render/hd2d/effects.ts src/render/hd2d/effects.test.ts src/audio/lines.ts src/audio/commentator.ts src/audio/commentator.test.ts
git commit -m "feat(race): hot pickups flame, Extended effects last longer, hot and trait commentary"
```

---

### Task 13: Sandbox pickers and visual check

**Files:**
- Modify: `src/app/Sandbox.tsx`

Context: `Sandbox` keeps `weather` in state and passes it to `simulateRace` in `start(length)` and in `moment(item)` (which searches seeds 1..5000 for a moment); the controls are `<label>`s inside one `<p>`, the Weather one ends with `</label>{' '}` before the "Look test" button. Lane 1 (`SAMPLE_HORSES[0]`) carries three bought boxes in `start()`.

- [ ] **Step 1: State and inputs**

Imports: add `import { BUFF_TEXT, HotStrip, hotText } from './HotItems.tsx';`, `import { TRAIT_INFO } from './Traits.tsx';`, `import { ITEM_INFO } from '../render/items.ts';`, `import { EFFECTS, HOT, TRAIT_CODES } from '../sim/config.ts';`, `import { HOT_ELIGIBLE } from '../sim/hot.ts';`, and change the types import to `import type { HotBuff, HotItem, ItemCode, RaceLength, Timeline, Trait, Weather } from '../sim/types.ts';`.

After `const [weather, setWeather] = useState<Weather>('clear');` add:

```ts
  const [hot, setHot] = useState<HotItem[]>([]);
  const [trait, setTrait] = useState<Trait>('normal');
  // Lane 1 (the horse with the three bought boxes) runs the picked trait.
  const extras = { hot, traits: { [SAMPLE_HORSES[0]!]: trait } };
```

In `start()`, after `weather,` add `...extras,`. In `moment()`, change the call to `simulateRace({ seed, horses, bought: {}, length: 'short', weather: w, ...extras })`.

- [ ] **Step 2: Controls** — right after the Weather `</label>{' '}` add:

```tsx
        <label>
          {' '}
          Hot item{' '}
          <select
            value=""
            onChange={(e) => {
              const [item, buff] = e.target.value.split('|') as [ItemCode, HotBuff];
              if (hot.length < HOT.count && !hot.some((x) => x.item === item))
                setHot([...hot, { item, buff }]);
            }}
          >
            <option value="">Add…</option>
            {HOT_ELIGIBLE.flatMap((item) =>
              (['lucky', 'extended'] as const)
                .filter((buff) => buff === 'lucky' || EFFECTS[item].seconds > 0)
                .map((buff) => (
                  <option key={`${item}|${buff}`} value={`${item}|${buff}`}>
                    {ITEM_INFO[item].name} {BUFF_TEXT[buff]}
                  </option>
                )),
            )}
          </select>
        </label>{' '}
        {hot.length > 0 && (
          <button type="button" onClick={() => setHot([])}>
            Clear hot ({hotText(hot)})
          </button>
        )}
        <label>
          {' '}
          Lane 1 trait{' '}
          <select value={trait} onChange={(e) => setTrait(e.target.value as Trait)}>
            {TRAIT_CODES.map((t) => (
              <option key={t} value={t}>
                {TRAIT_INFO[t].icon} {TRAIT_INFO[t].name}
              </option>
            ))}
          </select>
        </label>{' '}
```

Right before `{shown && (` (the `RaceView`) add `{shown && <HotStrip hot={shown.timeline.hot} />}`.

- [ ] **Step 3: Look at it**

Start the dev server (preview tool with `.claude/launch.json`), open `/sandbox`, and check in both HD and 2D:
- Add "Carrot 🍀 Lucky" and "Golden Lasso ⏱️ Extended", run a short race: the strip shows both; Carrot pickups pop up "🔥 🥕 Carrot" and the held icon over the horse has the flame.
- Golden Lasso moment with Extended Lasso: the victim stands still ~3 s and the rope animation lasts that long (3.4 s, not 2.4 s).
- Stampede moment with "Stampede ⏱️ Extended": the stampede effect lasts 12 s.
- Lane 1 Tough / Mudder (with Rain): the standings show the icon next to lane 1; with sound on, the commentary says "Mudder … loves this rain!" at the gun.

Take screenshots (headless Playwright scripts in the scratchpad if the browser pane is hidden). Fix anything that overlaps the horses or the standings.

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck; npm run lint; npm test`
Expected: clean / PASS.

```bash
git add src/app/Sandbox.tsx
git commit -m "feat(sandbox): hot-item and lane-1 trait pickers"
```

---

### Task 14: Full checks, docs, deploy

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Full checks**

Run: `npm run typecheck; npm run lint; npm test; npm run test:balance; npm run test:db; npm run build; npm run test:e2e`
Expected: all pass (the a11y track-lobby E2E test is a known flake; rerun it alone if it fails).

- [ ] **Step 2: PROJECT_STATUS.md** — after the "Weather (master, 2026-11-05)" section add "## Hot items and horse traits (master, 2026-11-05)": specs C and D and this plan; 3 hot items rolled at shop open (Lucky 2× weight, Extended 1.5× seconds; Shield/Mirror always Lucky; ≤ 2 per type), office switch on /admin (default on); six traits picked per race on the phone (reset to Normal for each new race, snapshotted at odds lock, host-typed horses Normal); the final `TRAITS` values from Task 7 and the printed win shares; the odds price both; strip, 🔥 buttons, trait picker, board/standings icons, popups, commentary, replay; sandbox pickers; test counts; the deploy steps below.

- [ ] **Step 3: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: hot items and traits status"
```

- [ ] **Step 4: Deploy — ask the owner first** (outward-facing; earlier deploy approvals do not carry over). On a yes, in this order (database before the functions that call it, functions before the web app):

```bash
npx supabase db push --linked
```

```bash
npx supabase functions deploy admin lock-odds start-race
```

```bash
git push origin master
```

Then check the live site: /admin shows the Hot items switch next to Weather; opening the shop shows the 🔥 strip on the big screen and phones, phones show the trait picker, and the betting board shows the Trait column.

---

## Self-review notes

- Spec C coverage: types and `HOT` (T1), Lucky weights incl. attack bands and Stampede/Thunderclap chances without extra draws (T2), Extended durations for boosts, slowdowns, Lucky Bubble, Stampede window and each Golden Carrot burst, pickup `hot` flag, validation, no-hot fingerprint (T3), odds receive `hot` (T6), SQL roll in `set_phase` LOBBY→SHOP only, switch, `race_input`, back-to-shop keeps it, service-only admin RPC (T8), Edge Functions and `RaceInputRow` (T9), shop/betting strips and 🔥 buy buttons (T10–11), admin switch (T11), 🔥 popups and held icons, effect durations from the hot list, commentary line (T12), replay strip (T11), sandbox picker (T13), deploy (T14).
- Spec D coverage: `Trait`, `TRAITS` (T1), Charmed (T4), Tough incl. weather slips/bumps and the Stampede mult, Sprinter/Stayer pace and kick, Mudder slip/bump/clear pace, all-Normal fingerprint, timeline traits (T5), odds price traits (T6), balance test and tuning (T7), `room_players.trait`, `set_trait`, snapshot in the `lock_odds_begin` SHOP branch only, re-snapshot after back-to-shop (T8), Edge Functions (T9), phone picker and read-only trait (T10), board icons, Trait column with legend, standings icons, replays (T11), trait commentary (T12).
- Decisions made while planning (the specs were silent or did not match the code):
  - Charmed: the spec's "roll the type once more" leaves d² duds (70–90 % fewer, not half). The plan re-rolls without the dud `TRAITS.charmed.rerollPercent` (50) of the time: exactly half, and a tuning knob.
  - `simulateShares` averaged horses by bought boxes only; the key now includes the trait, or the odds would average traits away.
  - The spec's trait numbers are expected to fail the ±15 % balance (Sprinter far too strong, Stayer and Mudder far too weak); T7 gives the tuning directions, and the final values go in PROJECT_STATUS. The phone texts carry no numbers, so tuning doesn't change the UI.
  - `set_trait` also raises `not_racing` for an unticked player (mirrors `buy_box`); `admin_set_hot_items(null)` raises the existing `bad_action`.
  - Traits reset to Normal when a new race's shop opens ("picked per race"); back-to-shop keeps the picks but clears the snapshot.
  - Buy buttons flame only for types a bought box can give the hot item from: a hot Stampede or Thunderclap (mystery-only) flames nothing.
  - `validateRaceInput` doesn't enforce `maxPerType` (the spec's validation list omits it; the SQL roll does), so the sandbox can try any mix.
  - Extended changes only the four special effects on screen (their lengths come from `EFFECTS`); the generic sparkles keep fixed lengths.
