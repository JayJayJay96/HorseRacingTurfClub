# Phase 1 — Foundation + Race Simulation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Horse Racing Turf Club web app and build the deterministic race simulation engine (`src/sim/`) with unit tests and a 10,000-race balance suite that meets the spec's targets.

**Architecture:** One Vite + React + TypeScript app. The engine is a pure TypeScript module in `src/sim/` (no DOM, no React, no Node APIs; imports use explicit `.ts` extensions) so Supabase Edge Functions (Deno) can import the same files in Phase 3. `simulateRace(input)` turns a seed, a field of horses, bought boxes and a race length into a `Timeline` (progress samples at 10 Hz, an event log and the finish order). Clients will only ever play Timelines back.

**Tech Stack:** Node 24, npm, TypeScript ~6.0, Vite 8, React 19, Vitest 5, oxlint. Same versions as the sibling project `C:\AILAB\KOFv1`.

**Spec:** `docs/superpowers/specs/2026-10-29-horse-racing-turf-club-design.md` (sections 4 and 6). This plan covers spec Phase 1 except the Supabase schema, which moves to the Phase 2 plan where it is first used.

**Later phases** (2–9) each get their own plan, written when the phase starts.

---

## File structure

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.balance.config.ts`, `index.html`, `.gitignore` | Project scaffold and tooling |
| `src/main.tsx`, `src/app/App.tsx` | Entry point; Phase 1 sandbox page that runs one race and lists the result |
| `src/sim/rng.ts` | Seeded, crypto and scripted RNGs with unbiased bounded integers (copied from KOF) |
| `src/sim/types.ts` | All engine types: input, box kinds, item codes, events, Timeline |
| `src/sim/config.ts` | Every tunable number: speeds, distances, item effects, weight tables, prices |
| `src/sim/math.ts` | Rounding helpers |
| `src/sim/weighted.ts` | Weighted and uniform picks from an `Rng` |
| `src/sim/items.ts` | Position band, attack roll with impossible-target filtering, box roll |
| `src/sim/boxes.ts` | Box placement per lane, Fisher–Yates shuffle |
| `src/sim/effects.ts` | Pure attack resolution (immune > shield > reflect > hit) |
| `src/sim/simulate.ts` | Input validation and the race loop that produces a Timeline |
| `src/sim/testStats.ts` | Chi-square helper for statistical tests |
| `src/sim/*.test.ts` | Fast unit tests (`npm test`) |
| `src/sim/balance.slow.test.ts` | 10,000-race balance suite (`npm run test:balance`, run on demand) |
| `README.md`, `PROJECT_STATUS.md` | Commands and progress log |

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.balance.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/app/App.tsx`, `README.md`, `PROJECT_STATUS.md`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "horse-racing-turf-club",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b",
    "lint": "oxlint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:balance": "vitest run --config vitest.balance.config.ts",
    "preview": "vite preview"
  },
  "prettier": {
    "semi": true,
    "singleQuote": true,
    "trailingComma": "all",
    "printWidth": 100,
    "tabWidth": 2
  },
  "dependencies": {
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "oxlint": "^1.81.0",
    "typescript": "~6.0.2",
    "vite": "^8.3.0",
    "vitest": "^5.0.3"
  }
}
```

- [ ] **Step 2: Write the TypeScript configs**

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "esnext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "esnext",
    "types": ["node"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts", "vitest.balance.config.ts"]
}
```

- [ ] **Step 3: Write the Vite and Vitest configs**

`vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // The 10,000-race balance suite takes minutes; it runs via `npm run test:balance`.
    exclude: ['src/**/*.slow.test.ts', 'node_modules/**'],
  },
});
```

`vitest.balance.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.slow.test.ts'],
    testTimeout: 600_000,
  },
});
```

- [ ] **Step 4: Write the HTML entry, React entry and placeholder App**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Horse Racing Turf Club</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/app/App.tsx`:

```tsx
export function App() {
  return (
    <main>
      <h1>Horse Racing Turf Club</h1>
      <p>Phase 1: race engine under construction.</p>
    </main>
  );
}
```

- [ ] **Step 5: Write `.gitignore`, `README.md`, `PROJECT_STATUS.md`**

`.gitignore`:

```
node_modules/
dist/
coverage/
test-results/
playwright-report/
.env
.env.*
!.env.example
*.log
```

`README.md`:

````markdown
# Horse Racing Turf Club

Office horse race: everyone joins on their phone, buys powerup boxes, bets coins, and the big screen shows the race.
Spec: [`docs/superpowers/specs/2026-10-29-horse-racing-turf-club-design.md`](docs/superpowers/specs/2026-10-29-horse-racing-turf-club-design.md) · progress: [`PROJECT_STATUS.md`](PROJECT_STATUS.md).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` | `tsc -b` only |
| `npm run lint` | oxlint |
| `npm test` | Fast unit tests |
| `npm run test:balance` | 10,000-race balance suite (takes minutes) |

## Layout

```
src/
  sim/   pure TypeScript race engine (no DOM/React/Node; `.ts` imports so Deno can use it)
  app/   React app shell
```
````

`PROJECT_STATUS.md`:

```markdown
# Project Status

## Phase 1 — Foundation + race simulation engine

- [ ] Scaffold
- [ ] RNG
- [ ] Types + config
- [ ] Weighted picks
- [ ] Item rolls
- [ ] Box placement
- [ ] Hit resolution
- [ ] Race simulation
- [ ] Sandbox page
- [ ] Balance suite passing (both lengths)
```

- [ ] **Step 6: Install and verify the scaffold builds**

Run: `npm install`
Expected: installs without errors; `package-lock.json` created.

Run: `npm run build`
Expected: `tsc -b` passes, `vite build` writes `dist/index.html`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React TypeScript app"
```

---

### Task 2: RNG (copied from KOF)

**Files:**
- Create: `src/sim/rng.ts`, `src/sim/testStats.ts`
- Test: `src/sim/rng.test.ts`

- [ ] **Step 1: Write the chi-square helper**

`src/sim/testStats.ts`:

```ts
/** Pearson chi-square statistic of observed counts against expected shares (shares sum to 1). */
export function chiSquare(counts: readonly number[], shares: readonly number[]): number {
  const total = counts.reduce((sum, c) => sum + c, 0);
  return counts.reduce((sum, c, i) => {
    const expected = total * shares[i]!;
    return sum + (c - expected) ** 2 / expected;
  }, 0);
}
```

- [ ] **Step 2: Write the failing RNG tests**

`src/sim/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { boundedInt, createCryptoRng, createScriptedRng, createSeededRng } from './rng.ts';
import { chiSquare } from './testStats.ts';

describe('boundedInt', () => {
  it('rejects values in the incomplete top bucket instead of folding them (no modulo bias)', () => {
    // 2^32 % 3 === 1, so 2^32 - 1 is the single biased value and must be redrawn.
    const values = [2 ** 32 - 1, 2 ** 32 - 1, 7];
    let i = 0;
    expect(boundedInt(() => values[i++]!, 3)).toBe(7 % 3);
    expect(i).toBe(3);
  });

  it.each([0, -1, 1.5, Number.NaN, 2 ** 32 + 1])('rejects bound %s', (bound) => {
    expect(() => boundedInt(() => 0, bound)).toThrow(RangeError);
  });

  it('a bound of 2^32 is allowed (used to draw a full 32-bit seed)', () => {
    expect(boundedInt(() => 2 ** 32 - 1, 2 ** 32)).toBe(2 ** 32 - 1);
  });
});

describe('createCryptoRng', () => {
  it('works with the real Web Crypto API', () => {
    const rng = createCryptoRng();
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(22);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(22);
    }
  });
});

describe('createSeededRng', () => {
  it('is deterministic per seed', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const c = createSeededRng(43);
    const seqA = Array.from({ length: 20 }, () => a.nextInt(1000));
    expect(Array.from({ length: 20 }, () => b.nextInt(1000))).toEqual(seqA);
    expect(Array.from({ length: 20 }, () => c.nextInt(1000))).not.toEqual(seqA);
  });

  it('is uniform over 7 buckets (seeded, so the check is not flaky)', () => {
    const rng = createSeededRng(20261029);
    const counts = new Array<number>(7).fill(0);
    for (let i = 0; i < 70_000; i++) counts[rng.nextInt(7)]!++;
    // Critical chi-square value for df = 6 at p = 0.001 is 22.46.
    expect(chiSquare(counts, new Array<number>(7).fill(1 / 7))).toBeLessThan(22.46);
  });
});

describe('createScriptedRng', () => {
  it('replays values and validates their range', () => {
    const rng = createScriptedRng([2, 0]);
    expect(rng.nextInt(3)).toBe(2);
    expect(rng.nextInt(1)).toBe(0);
    expect(() => rng.nextInt(1)).toThrow(/exhausted/);
    expect(() => createScriptedRng([5]).nextInt(3)).toThrow(RangeError);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/sim/rng.test.ts`
Expected: FAIL, cannot resolve `./rng.ts`.

- [ ] **Step 4: Write `src/sim/rng.ts`** (same code as `C:\AILAB\KOFv1\src\game\rng\rng.ts`)

```ts
/**
 * Randomness for the race engine. Real races use a crypto-random seed; the simulation itself
 * runs on the seeded RNG so the same seed always replays the same race.
 */
export interface Rng {
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}

const UINT32_RANGE = 2 ** 32;

/**
 * Unbiased bounded sampling by rejection: values in the incomplete top bucket are redrawn,
 * so every result in [0, maxExclusive) has exactly the same probability.
 */
export function boundedInt(nextUint32: () => number, maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
    throw new RangeError(`maxExclusive must be an integer in [1, 2^32], got ${maxExclusive}`);
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
  for (;;) {
    const x = nextUint32();
    if (x < limit) return x % maxExclusive;
  }
}

export function createCryptoRng(source: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): Rng {
  const buffer = new Uint32Array(1);
  const next = () => {
    source.getRandomValues(buffer);
    return buffer[0]!;
  };
  return { nextInt: (maxExclusive) => boundedInt(next, maxExclusive) };
}

/** mulberry32: small, fast, good enough for simulation; never used to pick a real seed. */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return { nextInt: (maxExclusive) => boundedInt(next, maxExclusive) };
}

export function createScriptedRng(values: readonly number[]): Rng {
  let i = 0;
  return {
    nextInt(maxExclusive) {
      if (i >= values.length) throw new Error('Scripted RNG exhausted');
      const value = values[i++]!;
      if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
        throw new RangeError(`Scripted value ${value} outside [0, ${maxExclusive})`);
      }
      return value;
    },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/sim/rng.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Commit**

```bash
git add src/sim/rng.ts src/sim/rng.test.ts src/sim/testStats.ts
git commit -m "feat(sim): add unbiased seeded and crypto RNG"
```

---

### Task 3: Engine types and config

**Files:**
- Create: `src/sim/types.ts`, `src/sim/config.ts`, `src/sim/math.ts`

These are declarations and constants only; the typecheck is their test.

- [ ] **Step 1: Write `src/sim/types.ts`**

```ts
export type HorseId = string;
export type RaceLength = 'short' | 'long';
export type BoxType = 'speed' | 'attack' | 'defense';
/** What a lane box was before it was opened. */
export type BoxKind = BoxType | 'mystery';
/** A mystery box first rolls one of these types, then an item inside it. */
export type MysteryType = BoxType | 'dud';
export type Band = 'front' | 'middle' | 'back';
export type AttackTarget = 'behind1' | 'behind3' | 'front1' | 'front3' | 'leader';

export type ItemCode =
  | 'speed:self1'
  | 'speed:self3'
  | 'speed:star'
  | 'speed:pass3'
  | `attack:${AttackTarget}`
  | 'attack:all'
  | 'defense:block1'
  | 'defense:immune'
  | 'defense:reflect'
  | 'dud:stop'
  | 'dud:slow'
  | 'dud:trip';

export interface RaceInput {
  /** Real races pass a crypto-random 32-bit integer. */
  readonly seed: number;
  /** Lane order = array order. */
  readonly horses: readonly HorseId[];
  /** Bought boxes per horse (max 3 each); horses without purchases may be omitted. */
  readonly bought: Readonly<Record<HorseId, readonly BoxType[]>>;
  readonly length: RaceLength;
}

export interface BoxSpot {
  /** Metres from the start along the race distance. */
  readonly at: number;
  readonly kind: BoxKind;
}

/** `t` is seconds since the start. Events are listed in simulation order. */
export type RaceEvent =
  /** `item` is null when an attack had nobody to hit and fizzled. */
  | { t: number; type: 'pickup'; horse: HorseId; kind: BoxKind; item: ItemCode | null }
  | { t: number; type: 'hit'; horse: HorseId; by: HorseId; item: ItemCode }
  | { t: number; type: 'blocked'; horse: HorseId; by: HorseId; item: ItemCode; reason: 'immune' | 'shield' }
  /** `horse` held the Mirror Saddle and sent the attack back to `by`. */
  | { t: number; type: 'reflected'; horse: HorseId; by: HorseId; item: ItemCode }
  | { t: number; type: 'finish'; horse: HorseId; place: number };

export interface Timeline {
  readonly seed: number;
  readonly length: RaceLength;
  /** Metres. */
  readonly distance: number;
  readonly tickHz: number;
  readonly horses: readonly HorseId[];
  readonly boxes: Readonly<Record<HorseId, readonly BoxSpot[]>>;
  /** Metres from the start, one sample per tick; index 0 is the start. Finished horses stay at `distance`. */
  readonly progress: Readonly<Record<HorseId, readonly number[]>>;
  readonly events: readonly RaceEvent[];
  readonly finishOrder: readonly HorseId[];
  /** Seconds, interpolated within the tick (millisecond precision). */
  readonly finishTimes: Readonly<Record<HorseId, number>>;
}
```

- [ ] **Step 2: Write `src/sim/config.ts`**

```ts
import type { AttackTarget, Band, BoxType, ItemCode, MysteryType, RaceLength } from './types.ts';

/** Simulation steps per second. Timelines store one progress sample per step. */
export const TICK_HZ = 10;
/** Base gallop speed in metres per second; identical for every horse. */
export const BASE_SPEED = 15;
export const DISTANCE: Readonly<Record<RaceLength, number>> = { short: 1800, long: 2700 };
export const NOMINAL_SECONDS: Readonly<Record<RaceLength, number>> = { short: 120, long: 180 };
/** A race still running after this many times its nominal length is an engine bug. */
export const MAX_RACE_FACTOR = 3;

export const MIN_HORSES = 2;
export const MAX_HORSES = 22;
export const MYSTERY_PER_LANE = 5;
export const MAX_BOUGHT = 3;
/** Boxes sit between these fractions of the race distance. */
export const BOX_ZONE = { start: 0.1, end: 0.85 } as const;
export const PRICES: Readonly<Record<BoxType, number>> = { speed: 60, defense: 35, attack: 20 };

/** Smooth per-horse pace wobble: random knots every `knotSeconds`, linearly interpolated. */
export const NOISE = { amplitude: 0.06, knotSeconds: 5 } as const;
/** One finishing burst per horse, starting somewhere in [fromFraction, toFraction] of the distance. */
export const KICK = {
  boost: 0.1,
  minSeconds: 2,
  maxSeconds: 5,
  fromFraction: 0.8,
  toFraction: 0.95,
} as const;

export interface Effect {
  readonly mult: number;
  readonly seconds: number;
}

/** Speed multiplier and duration per item. Shield and Mirror only set held state (mult 1). */
export const EFFECTS: Readonly<Record<ItemCode, Effect>> = {
  'speed:self1': { mult: 1.4, seconds: 3 },
  'speed:self3': { mult: 1.4, seconds: 2 },
  'speed:star': { mult: 1.55, seconds: 5 },
  'speed:pass3': { mult: 1.8, seconds: 8 },
  'attack:behind1': { mult: 0.5, seconds: 1.5 },
  'attack:behind3': { mult: 0.75, seconds: 2 },
  'attack:front1': { mult: 0.5, seconds: 2 },
  'attack:front3': { mult: 0.75, seconds: 2 },
  'attack:leader': { mult: 0, seconds: 2 },
  'attack:all': { mult: 0.7, seconds: 1.5 },
  'defense:block1': { mult: 1, seconds: 0 },
  'defense:immune': { mult: 1, seconds: 6 },
  'defense:reflect': { mult: 1, seconds: 0 },
  'dud:stop': { mult: 0, seconds: 1.5 },
  'dud:slow': { mult: 0.7, seconds: 2.5 },
  'dud:trip': { mult: 0.5, seconds: 1 },
};

/** Golden Carrot: three bursts, each starting this many seconds after the previous one. */
export const SELF3_GAP_SECONDS = 3;
/** Stampede aims this many places ahead, finishing this many metres past that horse. */
export const PASS3_PLACES = 3;
export const PASS3_MARGIN = 5;

/** Items a Speed / Defense box or a Dud can contain (mystery-only extras excluded). */
export const SPEED_ITEMS = ['speed:self1', 'speed:self3', 'speed:star'] as const satisfies readonly ItemCode[];
export const DEFENSE_ITEMS = [
  'defense:block1',
  'defense:immune',
  'defense:reflect',
] as const satisfies readonly ItemCode[];
export const DUD_ITEMS = ['dud:stop', 'dud:slow', 'dud:trip'] as const satisfies readonly ItemCode[];

/** Mystery box type by position band (percent). */
export const MYSTERY_TYPE_WEIGHTS: Readonly<Record<Band, Readonly<Record<MysteryType, number>>>> = {
  front: { speed: 15, attack: 30, defense: 25, dud: 30 },
  middle: { speed: 25, attack: 30, defense: 25, dud: 20 },
  back: { speed: 40, attack: 30, defense: 15, dud: 15 },
};

/** Attack target by position band (percent), for every Attack box, bought or mystery. */
export const ATTACK_WEIGHTS: Readonly<Record<Band, Readonly<Record<AttackTarget, number>>>> = {
  front: { behind1: 45, behind3: 30, front1: 15, front3: 10, leader: 0 },
  middle: { behind1: 20, behind3: 15, front1: 30, front3: 20, leader: 15 },
  back: { behind1: 5, behind3: 5, front1: 30, front3: 25, leader: 35 },
};

/** Mystery Speed roll in the back half of the field becomes a Stampede this often. */
export const PASS3_CHANCE_PERCENT = 25;
/** Mystery Attack roll by the last-placed horse becomes a Thunderclap this often. */
export const THUNDERCLAP_CHANCE_PERCENT = 5;
```

- [ ] **Step 3: Write `src/sim/math.ts`**

```ts
export const round2 = (x: number): number => Math.round(x * 100) / 100;
export const round3 = (x: number): number => Math.round(x * 1000) / 1000;
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/sim/types.ts src/sim/config.ts src/sim/math.ts
git commit -m "feat(sim): add engine types and tunable config"
```

---

### Task 4: Weighted picks

**Files:**
- Create: `src/sim/weighted.ts`
- Test: `src/sim/weighted.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/sim/weighted.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createScriptedRng } from './rng.ts';
import { pickOne, pickWeighted } from './weighted.ts';

describe('pickWeighted', () => {
  it('maps the drawn integer onto cumulative weights in insertion order', () => {
    // total = 4: 0 -> a, 1..3 -> b
    expect(pickWeighted(createScriptedRng([0]), { a: 1, b: 3 })).toBe('a');
    expect(pickWeighted(createScriptedRng([1]), { a: 1, b: 3 })).toBe('b');
    expect(pickWeighted(createScriptedRng([3]), { a: 1, b: 3 })).toBe('b');
  });

  it('skips zero weights', () => {
    expect(pickWeighted(createScriptedRng([0]), { a: 0, b: 2 })).toBe('b');
  });

  it('throws when no weight is positive', () => {
    expect(() => pickWeighted(createScriptedRng([0]), { a: 0 })).toThrow(RangeError);
  });
});

describe('pickOne', () => {
  it('indexes the list with the drawn integer', () => {
    expect(pickOne(createScriptedRng([2]), ['x', 'y', 'z'])).toBe('z');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sim/weighted.test.ts`
Expected: FAIL, cannot resolve `./weighted.ts`.

- [ ] **Step 3: Write `src/sim/weighted.ts`**

```ts
import type { Rng } from './rng.ts';

/** Picks a key with probability weight / total. Weights must be non-negative integers. */
export function pickWeighted<K extends string>(rng: Rng, weights: Readonly<Partial<Record<K, number>>>): K {
  const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) throw new RangeError('pickWeighted needs at least one positive weight');
  let r = rng.nextInt(total);
  for (const [key, w] of entries) {
    if (r < w) return key;
    r -= w;
  }
  throw new Error('unreachable: r is always below the total weight');
}

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  return items[rng.nextInt(items.length)]!;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sim/weighted.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sim/weighted.ts src/sim/weighted.test.ts
git commit -m "feat(sim): add weighted and uniform picks"
```

---

### Task 5: Item rolls (position bands, attack targeting, box contents)

**Files:**
- Create: `src/sim/items.ts`
- Test: `src/sim/items.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/sim/items.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ATTACK_WEIGHTS, MYSTERY_TYPE_WEIGHTS } from './config.ts';
import { bandOf, rollAttack, rollBox, type RollContext } from './items.ts';
import { createSeededRng } from './rng.ts';
import { chiSquare } from './testStats.ts';
import type { AttackTarget, ItemCode, MysteryType } from './types.ts';

const ALL_TARGETS: Record<AttackTarget, boolean> = {
  behind1: true,
  behind3: true,
  front1: true,
  front3: true,
  leader: true,
};
const ctx = (rank: number, count = 10, canTarget = ALL_TARGETS): RollContext => ({ rank, count, canTarget });
const typeOf = (item: ItemCode): MysteryType => item.split(':')[0] as MysteryType;

describe('bandOf', () => {
  it.each([
    [0, 10, 'front'],
    [2, 10, 'front'],
    [3, 10, 'middle'],
    [6, 10, 'middle'],
    [7, 10, 'back'],
    [9, 10, 'back'],
    [0, 2, 'front'],
    [1, 2, 'back'],
    [1, 3, 'middle'],
  ] as const)('rank %i of %i is %s', (rank, count, band) => {
    expect(bandOf(rank, count)).toBe(band);
  });
});

describe('rollAttack', () => {
  it('never picks a target that has nobody in it', () => {
    const rng = createSeededRng(1);
    const leaderView = { ...ALL_TARGETS, front1: false, front3: false, leader: false };
    for (let i = 0; i < 2000; i++) {
      expect(rollAttack(rng, ctx(0, 10, leaderView))).toMatch(/^attack:behind[13]$/);
    }
  });

  it('returns null when no target is possible', () => {
    const none = { behind1: false, behind3: false, front1: false, front3: false, leader: false };
    expect(rollAttack(createSeededRng(1), ctx(5, 10, none))).toBeNull();
  });

  it('matches the middle-band target table', () => {
    const rng = createSeededRng(2);
    const targets = Object.keys(ATTACK_WEIGHTS.middle) as AttackTarget[];
    const counts = new Array<number>(targets.length).fill(0);
    for (let i = 0; i < 20_000; i++) {
      counts[targets.indexOf(rollAttack(rng, ctx(4))!.slice('attack:'.length) as AttackTarget)]!++;
    }
    const shares = targets.map((t) => ATTACK_WEIGHTS.middle[t] / 100);
    // Critical chi-square value for df = 4 at p = 0.001 is 18.47.
    expect(chiSquare(counts, shares)).toBeLessThan(18.47);
  });
});

describe('rollBox', () => {
  it('matches the back-band mystery type table', () => {
    const rng = createSeededRng(3);
    const types: MysteryType[] = ['speed', 'attack', 'defense', 'dud'];
    const counts = new Array<number>(types.length).fill(0);
    for (let i = 0; i < 20_000; i++) counts[types.indexOf(typeOf(rollBox(rng, 'mystery', ctx(8))!))]!++;
    const shares = types.map((t) => MYSTERY_TYPE_WEIGHTS.back[t] / 100);
    // Critical chi-square value for df = 3 at p = 0.001 is 16.27.
    expect(chiSquare(counts, shares)).toBeLessThan(16.27);
  });

  it('bought boxes keep their type, never contain duds or mystery-only items', () => {
    const rng = createSeededRng(4);
    for (let i = 0; i < 3000; i++) {
      const rank = i % 10;
      expect(rollBox(rng, 'speed', ctx(rank))).toMatch(/^speed:(self1|self3|star)$/);
      expect(rollBox(rng, 'defense', ctx(rank))).toMatch(/^defense:/);
      expect(rollBox(rng, 'attack', ctx(rank))).toMatch(/^attack:(behind1|behind3|front1|front3|leader)$/);
    }
  });

  it('Stampede only comes from mystery boxes in the back half', () => {
    const rng = createSeededRng(5);
    const seen = { front: false, back: false };
    for (let i = 0; i < 20_000; i++) {
      if (rollBox(rng, 'mystery', ctx(1)) === 'speed:pass3') seen.front = true;
      if (rollBox(rng, 'mystery', ctx(8)) === 'speed:pass3') seen.back = true;
    }
    expect(seen).toEqual({ front: false, back: true });
  });

  it('Thunderclap only comes from mystery boxes in last place', () => {
    const rng = createSeededRng(6);
    const seen = { second: false, last: false };
    for (let i = 0; i < 20_000; i++) {
      if (rollBox(rng, 'mystery', ctx(8)) === 'attack:all') seen.second = true;
      if (rollBox(rng, 'mystery', ctx(9)) === 'attack:all') seen.last = true;
    }
    expect(seen).toEqual({ second: false, last: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sim/items.test.ts`
Expected: FAIL, cannot resolve `./items.ts`.

- [ ] **Step 3: Write `src/sim/items.ts`**

```ts
import {
  ATTACK_WEIGHTS,
  DEFENSE_ITEMS,
  DUD_ITEMS,
  MYSTERY_TYPE_WEIGHTS,
  PASS3_CHANCE_PERCENT,
  SPEED_ITEMS,
  THUNDERCLAP_CHANCE_PERCENT,
} from './config.ts';
import type { Rng } from './rng.ts';
import type { AttackTarget, Band, BoxKind, ItemCode } from './types.ts';
import { pickOne, pickWeighted } from './weighted.ts';

/** Front, middle or back third of the field; each outer band holds at least one horse. */
export function bandOf(rank: number, count: number): Band {
  const k = Math.max(1, Math.round(count / 3));
  if (rank < k) return 'front';
  if (rank >= count - k) return 'back';
  return 'middle';
}

export interface RollContext {
  /** 0 = in the lead, counted over every horse in the race (finished ones included). */
  readonly rank: number;
  readonly count: number;
  /** Which attack targets currently contain at least one running horse. */
  readonly canTarget: Readonly<Record<AttackTarget, boolean>>;
}

/** Attack item by position band, impossible targets removed. Null when nobody can be hit. */
export function rollAttack(rng: Rng, ctx: RollContext): ItemCode | null {
  const weights: Partial<Record<AttackTarget, number>> = {};
  const table = ATTACK_WEIGHTS[bandOf(ctx.rank, ctx.count)];
  for (const [target, weight] of Object.entries(table) as [AttackTarget, number][]) {
    if (ctx.canTarget[target] && weight > 0) weights[target] = weight;
  }
  if (Object.keys(weights).length === 0) return null;
  return `attack:${pickWeighted(rng, weights)}`;
}

/** The item inside a box at the moment it is picked up. Null = an attack with nobody to hit. */
export function rollBox(rng: Rng, kind: BoxKind, ctx: RollContext): ItemCode | null {
  const mystery = kind === 'mystery';
  const type = mystery ? pickWeighted(rng, MYSTERY_TYPE_WEIGHTS[bandOf(ctx.rank, ctx.count)]) : kind;
  switch (type) {
    case 'speed':
      if (mystery && ctx.rank >= ctx.count / 2 && rng.nextInt(100) < PASS3_CHANCE_PERCENT) {
        return 'speed:pass3';
      }
      return pickOne(rng, SPEED_ITEMS);
    case 'attack':
      if (mystery && ctx.rank === ctx.count - 1 && rng.nextInt(100) < THUNDERCLAP_CHANCE_PERCENT) {
        return ctx.canTarget.front1 || ctx.canTarget.behind1 ? 'attack:all' : null;
      }
      return rollAttack(rng, ctx);
    case 'defense':
      return pickOne(rng, DEFENSE_ITEMS);
    case 'dud':
      return pickOne(rng, DUD_ITEMS);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sim/items.test.ts`
Expected: PASS (16 tests: 9 band cases + 7).

- [ ] **Step 5: Commit**

```bash
git add src/sim/items.ts src/sim/items.test.ts
git commit -m "feat(sim): roll box items with position-weighted attack targets"
```

---

### Task 6: Box placement

**Files:**
- Create: `src/sim/boxes.ts`
- Test: `src/sim/boxes.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/sim/boxes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { placeBoxes, shuffle } from './boxes.ts';
import { BOX_ZONE, MYSTERY_PER_LANE } from './config.ts';
import { createSeededRng } from './rng.ts';

const horses = ['a', 'b', 'c'];
const bought = { a: ['speed', 'attack', 'defense'] as const, b: ['attack'] as const };

describe('placeBoxes', () => {
  it('gives every lane 5 mystery boxes plus its bought boxes, in order, inside the box zone', () => {
    const lanes = placeBoxes(createSeededRng(1), horses, bought, 1800);
    expect(lanes.a).toHaveLength(MYSTERY_PER_LANE + 3);
    expect(lanes.b).toHaveLength(MYSTERY_PER_LANE + 1);
    expect(lanes.c).toHaveLength(MYSTERY_PER_LANE);
    expect(lanes.a!.filter((s) => s.kind !== 'mystery').map((s) => s.kind).sort()).toEqual([
      'attack',
      'defense',
      'speed',
    ]);
    for (const lane of Object.values(lanes)) {
      const spots = lane.map((s) => s.at);
      expect(spots).toEqual([...spots].sort((x, y) => x - y));
      expect(Math.min(...spots)).toBeGreaterThanOrEqual(1800 * BOX_ZONE.start);
      expect(Math.max(...spots)).toBeLessThanOrEqual(1800 * BOX_ZONE.end);
    }
  });

  it('is deterministic per seed', () => {
    expect(placeBoxes(createSeededRng(9), horses, bought, 1800)).toEqual(
      placeBoxes(createSeededRng(9), horses, bought, 1800),
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sim/boxes.test.ts`
Expected: FAIL, cannot resolve `./boxes.ts`.

- [ ] **Step 3: Write `src/sim/boxes.ts`**

```ts
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
    const kinds: BoxKind[] = [...new Array<BoxKind>(MYSTERY_PER_LANE).fill('mystery'), ...(bought[id] ?? [])];
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sim/boxes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sim/boxes.ts src/sim/boxes.test.ts
git commit -m "feat(sim): place lane boxes with bought boxes mixed in"
```

---

### Task 7: Hit resolution

**Files:**
- Create: `src/sim/effects.ts`
- Test: `src/sim/effects.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/sim/effects.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveHit, type Defenses } from './effects.ts';

const open: Defenses = { immuneUntil: 0, held: null, stampeding: false };

describe('resolveHit', () => {
  it('lands on an unprotected horse', () => {
    expect(resolveHit(open, 50, true)).toBe('hit');
  });

  it('immunity (Bubble, Thunder Hooves) blocks while it lasts', () => {
    expect(resolveHit({ ...open, immuneUntil: 60 }, 59, true)).toBe('immune');
    expect(resolveHit({ ...open, immuneUntil: 60 }, 60, true)).toBe('hit');
  });

  it('a stampeding horse is immune', () => {
    expect(resolveHit({ ...open, stampeding: true }, 50, true)).toBe('immune');
  });

  it('immunity wins over a held Shield, so the Shield is kept', () => {
    expect(resolveHit({ ...open, immuneUntil: 60, held: 'defense:block1' }, 50, true)).toBe('immune');
  });

  it('a held Shield blocks', () => {
    expect(resolveHit({ ...open, held: 'defense:block1' }, 50, true)).toBe('shield');
  });

  it('a held Mirror reflects, but never a reflected attack', () => {
    expect(resolveHit({ ...open, held: 'defense:reflect' }, 50, true)).toBe('reflect');
    expect(resolveHit({ ...open, held: 'defense:reflect' }, 50, false)).toBe('hit');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sim/effects.test.ts`
Expected: FAIL, cannot resolve `./effects.ts`.

- [ ] **Step 3: Write `src/sim/effects.ts`**

```ts
export type HeldDefense = 'defense:block1' | 'defense:reflect';

export interface Defenses {
  /** Tick at which immunity ends (exclusive). */
  readonly immuneUntil: number;
  readonly held: HeldDefense | null;
  readonly stampeding: boolean;
}

export type HitOutcome = 'immune' | 'shield' | 'reflect' | 'hit';

/**
 * How an attack lands. Immunity beats a held Shield, which beats a held Mirror.
 * The caller spends the held item on 'shield' and 'reflect'.
 */
export function resolveHit(target: Defenses, tick: number, allowReflect: boolean): HitOutcome {
  if (target.stampeding || tick < target.immuneUntil) return 'immune';
  if (target.held === 'defense:block1') return 'shield';
  if (target.held === 'defense:reflect' && allowReflect) return 'reflect';
  return 'hit';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sim/effects.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sim/effects.ts src/sim/effects.test.ts
git commit -m "feat(sim): resolve attacks against immunity, shield and mirror"
```

---

### Task 8: Race simulation

**Files:**
- Create: `src/sim/simulate.ts`
- Test: `src/sim/simulate.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/sim/simulate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DISTANCE, EFFECTS, MYSTERY_PER_LANE, TICK_HZ } from './config.ts';
import { simulateRace } from './simulate.ts';
import type { BoxType, ItemCode, RaceInput, Timeline } from './types.ts';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `h${i}`);
const race = (over: Partial<RaceInput> = {}): Timeline =>
  simulateRace({ seed: 7, horses: ids(8), bought: {}, length: 'short', ...over });
const ALL_BOUGHT: readonly BoxType[] = ['speed', 'attack', 'defense'];

describe('input validation', () => {
  it.each([
    ['too few horses', { horses: ['solo'] }],
    ['too many horses', { horses: ids(23) }],
    ['duplicate ids', { horses: ['a', 'a', 'b'] }],
    ['more than 3 bought boxes', { bought: { h0: ['speed', 'speed', 'speed', 'speed'] as BoxType[] } }],
    ['boxes for an unknown horse', { bought: { nobody: ['speed'] as BoxType[] } }],
    ['non-integer seed', { seed: 1.5 }],
  ])('rejects %s', (_, over) => {
    expect(() => race(over)).toThrow(RangeError);
  });
});

describe('simulateRace', () => {
  it('is deterministic per input', () => {
    expect(race()).toEqual(race());
    expect(race({ seed: 8 }).progress).not.toEqual(race().progress);
  });

  it.each(['short', 'long'] as const)('every horse finishes exactly once, in time order (%s)', (length) => {
    for (let seed = 1; seed <= 20; seed++) {
      const tl = race({ seed, length, horses: ids(22), bought: { h0: ALL_BOUGHT, h5: ['speed'] } });
      expect([...tl.finishOrder].sort()).toEqual([...ids(22)].sort());
      const times = tl.finishOrder.map((id) => tl.finishTimes[id]!);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      const finishes = tl.events.filter((e) => e.type === 'finish');
      expect(finishes.map((e) => e.place)).toEqual(ids(22).map((_, i) => i + 1));
      expect(tl.distance).toBe(DISTANCE[length]);
    }
  });

  it('progress starts at 0, never decreases and ends at the distance', () => {
    const tl = race({ bought: { h1: ALL_BOUGHT } });
    for (const id of tl.horses) {
      const p = tl.progress[id]!;
      expect(p[0]).toBe(0);
      for (let i = 1; i < p.length; i++) expect(p[i]!).toBeGreaterThanOrEqual(p[i - 1]!);
      expect(p.at(-1)).toBe(tl.distance);
    }
  });

  it('every lane box is picked up exactly once, bought boxes included', () => {
    const tl = race({ bought: { h0: ALL_BOUGHT } });
    expect(tl.boxes.h0).toHaveLength(MYSTERY_PER_LANE + 3);
    for (const id of tl.horses) {
      const kinds = tl.events.flatMap((e) => (e.type === 'pickup' && e.horse === id ? [e.kind] : []));
      expect(kinds).toEqual(tl.boxes[id]!.map((b) => b.kind));
    }
  });

  it('over many races every item and every resolution shows up', () => {
    const items = new Set<ItemCode>();
    const types = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const tl = race({ seed, horses: ids(12), bought: { h0: ALL_BOUGHT, h11: ALL_BOUGHT } });
      for (const e of tl.events) {
        types.add(e.type);
        if (e.type === 'pickup' && e.item) items.add(e.item);
      }
    }
    expect([...items].sort()).toEqual((Object.keys(EFFECTS) as ItemCode[]).sort());
    expect([...types].sort()).toEqual(['blocked', 'finish', 'hit', 'pickup', 'reflected']);
  });

  it('Golden Lasso stops its victim for 2 s and Snack Break stops the eater for 1.5 s', () => {
    let lassoChecked = 0;
    let snackChecked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const tl = race({ seed, horses: ids(12) });
      // A Stampede ignores slow-downs, so skip horses that started one in the last 8 s.
      const stampeding = (horse: string, t: number): boolean =>
        tl.events.some((s) => s.type === 'pickup' && s.horse === horse && s.item === 'speed:pass3' && s.t <= t && t - s.t <= 8);
      for (const e of tl.events) {
        const tick = Math.round(e.t * TICK_HZ);
        if ((e.type === 'hit' || e.type === 'pickup') && stampeding(e.horse, e.t)) continue;
        if (e.type === 'hit' && e.item === 'attack:leader') {
          const p = tl.progress[e.horse]!;
          for (let k = 1; k < 2 * TICK_HZ; k++) expect(p[tick + k]).toBe(p[tick]);
          lassoChecked++;
        }
        if (e.type === 'pickup' && e.item === 'dud:stop') {
          const p = tl.progress[e.horse]!;
          for (let k = 1; k < 1.5 * TICK_HZ; k++) expect(p[tick + k]).toBe(p[tick]);
          snackChecked++;
        }
      }
    }
    expect(lassoChecked).toBeGreaterThan(0);
    expect(snackChecked).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sim/simulate.test.ts`
Expected: FAIL, cannot resolve `./simulate.ts`.

- [ ] **Step 3: Write `src/sim/simulate.ts`**

```ts
import { placeBoxes } from './boxes.ts';
import {
  BASE_SPEED,
  DISTANCE,
  EFFECTS,
  KICK,
  MAX_BOUGHT,
  MAX_HORSES,
  MAX_RACE_FACTOR,
  MIN_HORSES,
  NOISE,
  NOMINAL_SECONDS,
  PASS3_MARGIN,
  PASS3_PLACES,
  SELF3_GAP_SECONDS,
  TICK_HZ,
} from './config.ts';
import { resolveHit, type HeldDefense } from './effects.ts';
import { rollBox } from './items.ts';
import { round2, round3 } from './math.ts';
import { createSeededRng, type Rng } from './rng.ts';
import type { AttackTarget, HorseId, ItemCode, RaceEvent, RaceInput, Timeline } from './types.ts';

interface Mod {
  readonly mult: number;
  readonly from: number;
  /** Exclusive. */
  readonly until: number;
}

interface Horse {
  readonly id: HorseId;
  readonly index: number;
  readonly knots: readonly number[];
  readonly kickAt: number;
  readonly kickTicks: number;
  progress: number;
  kickStart: number | null;
  mods: Mod[];
  immuneUntil: number;
  held: HeldDefense | null;
  stampede: { readonly target: number; readonly until: number } | null;
  nextBox: number;
  finishTime: number | null;
}

const toTicks = (seconds: number): number => Math.round(seconds * TICK_HZ);
/** Uniform in [0, 1] at 1/1000 resolution. */
const fraction = (rng: Rng): number => rng.nextInt(1001) / 1000;
const byPosition = (a: Horse, b: Horse): number => b.progress - a.progress || a.index - b.index;

function targetsOf(running: readonly Horse[], i: number): Record<AttackTarget, readonly Horse[]> {
  return {
    behind1: running.slice(i + 1, i + 2),
    behind3: running.slice(i + 1, i + 4),
    front1: running.slice(Math.max(0, i - 1), i),
    front3: running.slice(Math.max(0, i - 3), i),
    leader: i > 0 ? running.slice(0, 1) : [],
  };
}

export function validateRaceInput(input: RaceInput): void {
  const n = input.horses.length;
  if (!Number.isInteger(input.seed)) throw new RangeError(`seed must be an integer, got ${input.seed}`);
  if (n < MIN_HORSES || n > MAX_HORSES) {
    throw new RangeError(`a race needs ${MIN_HORSES}-${MAX_HORSES} horses, got ${n}`);
  }
  if (new Set(input.horses).size !== n) throw new RangeError('horse ids must be unique');
  for (const [id, boxes] of Object.entries(input.bought)) {
    if (!input.horses.includes(id)) throw new RangeError(`bought boxes for unknown horse ${id}`);
    if (boxes.length > MAX_BOUGHT) throw new RangeError(`horse ${id} has more than ${MAX_BOUGHT} bought boxes`);
  }
}

/**
 * Runs one whole race. Deterministic: the same input always gives the same Timeline.
 * Real races pass a crypto-random seed, so the outcome is fixed before anything is animated.
 */
export function simulateRace(input: RaceInput): Timeline {
  validateRaceInput(input);
  const rng = createSeededRng(input.seed);
  const distance = DISTANCE[input.length];
  const maxTicks = toTicks(NOMINAL_SECONDS[input.length] * MAX_RACE_FACTOR);
  const knotTicks = toTicks(NOISE.knotSeconds);
  const boxes = placeBoxes(rng, input.horses, input.bought, distance);
  const horses: Horse[] = input.horses.map((id, index) => ({
    id,
    index,
    knots: Array.from({ length: Math.ceil(maxTicks / knotTicks) + 2 }, () => fraction(rng) * 2 - 1),
    kickAt: distance * (KICK.fromFraction + fraction(rng) * (KICK.toFraction - KICK.fromFraction)),
    kickTicks:
      toTicks(KICK.minSeconds) + rng.nextInt(toTicks(KICK.maxSeconds) - toTicks(KICK.minSeconds) + 1),
    progress: 0,
    kickStart: null,
    mods: [],
    immuneUntil: 0,
    held: null,
    stampede: null,
    nextBox: 0,
    finishTime: null,
  }));
  const progress: Record<HorseId, number[]> = Object.fromEntries(input.horses.map((id) => [id, [0]]));
  const events: RaceEvent[] = [];
  const finishOrder: HorseId[] = [];
  const finishTimes: Record<HorseId, number> = {};

  const pace = (h: Horse, tick: number): number => {
    const i = Math.floor(tick / knotTicks);
    const f = (tick % knotTicks) / knotTicks;
    const a = h.knots[i]!;
    const b = h.knots[i + 1]!;
    const noise = 1 + (a + (b - a) * f) * NOISE.amplitude;
    const kick = h.kickStart !== null && tick < h.kickStart + h.kickTicks ? 1 + KICK.boost : 1;
    if (h.stampede) return BASE_SPEED * noise * kick * EFFECTS['speed:pass3'].mult;
    let mult = 1;
    for (const m of h.mods) if (m.from <= tick && tick < m.until) mult *= m.mult;
    return BASE_SPEED * noise * kick * mult;
  };

  const addMod = (h: Horse, item: ItemCode, from: number): void => {
    const e = EFFECTS[item];
    h.mods.push({ mult: e.mult, from, until: from + toTicks(e.seconds) });
  };

  const hit = (target: Horse, by: Horse, item: ItemCode, tick: number, allowReflect: boolean): void => {
    const t = round2(tick / TICK_HZ);
    const outcome = resolveHit(
      { immuneUntil: target.immuneUntil, held: target.held, stampeding: target.stampede !== null },
      tick,
      allowReflect,
    );
    switch (outcome) {
      case 'immune':
        events.push({ t, type: 'blocked', horse: target.id, by: by.id, item, reason: 'immune' });
        return;
      case 'shield':
        target.held = null;
        events.push({ t, type: 'blocked', horse: target.id, by: by.id, item, reason: 'shield' });
        return;
      case 'reflect':
        target.held = null;
        events.push({ t, type: 'reflected', horse: target.id, by: by.id, item });
        hit(by, target, item, tick, false);
        return;
      case 'hit':
        addMod(target, item, tick);
        events.push({ t, type: 'hit', horse: target.id, by: by.id, item });
    }
  };

  const use = (
    h: Horse,
    item: ItemCode,
    tick: number,
    running: readonly Horse[],
    targets: Record<AttackTarget, readonly Horse[]>,
  ): void => {
    switch (item) {
      case 'speed:self1':
      case 'dud:stop':
      case 'dud:slow':
      case 'dud:trip':
        addMod(h, item, tick);
        return;
      case 'speed:star':
        addMod(h, item, tick);
        h.immuneUntil = Math.max(h.immuneUntil, tick + toTicks(EFFECTS[item].seconds));
        return;
      case 'speed:self3':
        for (let k = 0; k < 3; k++) addMod(h, item, tick + k * toTicks(SELF3_GAP_SECONDS));
        return;
      case 'speed:pass3': {
        const ahead = running[Math.max(0, running.indexOf(h) - PASS3_PLACES)]!;
        h.stampede = {
          target: Math.min(distance, ahead.progress + PASS3_MARGIN),
          until: tick + toTicks(EFFECTS[item].seconds),
        };
        return;
      }
      case 'defense:block1':
      case 'defense:reflect':
        h.held = item;
        return;
      case 'defense:immune':
        h.immuneUntil = Math.max(h.immuneUntil, tick + toTicks(EFFECTS[item].seconds));
        return;
      case 'attack:all':
        for (const other of running) if (other !== h) hit(other, h, item, tick, true);
        return;
      default:
        for (const victim of targets[item.slice('attack:'.length) as AttackTarget]) {
          hit(victim, h, item, tick, true);
        }
    }
  };

  for (let tick = 1; finishOrder.length < horses.length; tick++) {
    if (tick > maxTicks) throw new Error(`race did not finish within ${maxTicks} ticks (seed ${input.seed})`);

    const finishedNow: Horse[] = [];
    for (const h of horses) {
      if (h.finishTime !== null) continue;
      const before = h.progress;
      if (h.kickStart === null && before >= h.kickAt) h.kickStart = tick;
      h.progress = before + pace(h, tick) / TICK_HZ;
      if (h.stampede && (h.progress >= h.stampede.target || tick >= h.stampede.until)) h.stampede = null;
      if (h.mods.length > 0) h.mods = h.mods.filter((m) => m.until > tick + 1);
      if (h.progress >= distance) {
        h.finishTime = round3((tick - 1 + (distance - before) / (h.progress - before)) / TICK_HZ);
        h.progress = distance;
        finishedNow.push(h);
      }
    }
    finishedNow.sort((a, b) => a.finishTime! - b.finishTime! || a.index - b.index);
    for (const h of finishedNow) {
      finishOrder.push(h.id);
      finishTimes[h.id] = h.finishTime!;
      events.push({ t: h.finishTime!, type: 'finish', horse: h.id, place: finishOrder.length });
    }

    // Boxes open after everyone has moved this tick; the ranking is only computed when needed.
    let ranked: Horse[] | null = null;
    for (const h of horses) {
      const lane = boxes[h.id]!;
      while (h.finishTime === null && h.nextBox < lane.length && lane[h.nextBox]!.at <= h.progress) {
        const spot = lane[h.nextBox++]!;
        ranked ??= [...horses].sort(byPosition);
        const running = ranked.filter((r) => r.finishTime === null);
        const targets = targetsOf(running, running.indexOf(h));
        const item = rollBox(rng, spot.kind, {
          rank: ranked.indexOf(h),
          count: horses.length,
          canTarget: {
            behind1: targets.behind1.length > 0,
            behind3: targets.behind3.length > 0,
            front1: targets.front1.length > 0,
            front3: targets.front3.length > 0,
            leader: targets.leader.length > 0,
          },
        });
        events.push({ t: round2(tick / TICK_HZ), type: 'pickup', horse: h.id, kind: spot.kind, item });
        if (item) use(h, item, tick, running, targets);
      }
    }

    for (const h of horses) progress[h.id]!.push(round2(h.progress));
  }

  return {
    seed: input.seed,
    length: input.length,
    distance,
    tickHz: TICK_HZ,
    horses: [...input.horses],
    boxes,
    progress,
    events,
    finishOrder,
    finishTimes,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sim/simulate.test.ts`
Expected: PASS (13 tests).

If "over many races every item and every resolution shows up" fails, print the missing items. With 300 races of 12 horses (≈1,800+ mystery boxes) every item, including mystery-only ones, should appear; a missing item means a roll path is unreachable. Fix the path, not the test.

- [ ] **Step 5: Run the full fast suite, typecheck and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all PASS, no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/sim/simulate.ts src/sim/simulate.test.ts
git commit -m "feat(sim): simulate a full race into a deterministic timeline"
```

---

### Task 9: Sandbox page

**Files:**
- Modify: `src/app/App.tsx` (replace whole file)

- [ ] **Step 1: Replace `src/app/App.tsx`**

```tsx
import { useState } from 'react';
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

/** Phase 1 sandbox: runs the engine with a crypto seed and lists the result. No graphics yet. */
export function App() {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const run = (length: RaceLength) =>
    setTimeline(
      simulateRace({ seed: createCryptoRng().nextInt(2 ** 32), horses: SAMPLE_HORSES, bought: {}, length }),
    );

  return (
    <main>
      <h1>Horse Racing Turf Club</h1>
      <p>Phase 1 sandbox: runs the race engine and lists the result.</p>
      <button type="button" onClick={() => run('short')}>
        Run short race
      </button>{' '}
      <button type="button" onClick={() => run('long')}>
        Run long race
      </button>
      {timeline && (
        <>
          <p>
            Seed {timeline.seed} · {timeline.length} · {timeline.events.length} events
          </p>
          <ol>
            {timeline.finishOrder.map((id) => (
              <li key={id}>
                {id}: {timeline.finishTimes[id]?.toFixed(2)} s
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify build and check it manually**

Run: `npm run build`
Expected: PASS.

Run: `npm run dev`, open http://localhost:5173, click **Run short race**.
Expected: 6 names in finish order with times near 120 s. **Run long race**: times near 180 s.

- [ ] **Step 3: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(app): sandbox page that runs a sample race"
```

---

### Task 10: Balance suite and tuning

**Files:**
- Create: `src/sim/balance.slow.test.ts`
- Modify (only if a target fails): `src/sim/config.ts`

- [ ] **Step 1: Write the balance suite**

`src/sim/balance.slow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NOMINAL_SECONDS } from './config.ts';
import { simulateRace } from './simulate.ts';
import type { BoxType, RaceLength } from './types.ts';

const RACES = 10_000;
const FIELD = Array.from({ length: 10 }, (_, i) => `h${i}`);

interface Result {
  readonly shares: readonly number[];
  readonly winnerTimeOk: number;
}

const cache = new Map<string, Result>();

/** Seeds 1..RACES, so every run gives the same numbers (no flaky statistics). */
function run(length: RaceLength, h0Boxes: readonly BoxType[]): Result {
  const key = `${length}:${h0Boxes.join(',') || 'equal'}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const wins = new Array<number>(FIELD.length).fill(0);
  let winnerTimeOk = 0;
  for (let seed = 1; seed <= RACES; seed++) {
    const tl = simulateRace({ seed, horses: FIELD, bought: h0Boxes.length > 0 ? { h0: h0Boxes } : {}, length });
    const winner = tl.finishOrder[0]!;
    wins[FIELD.indexOf(winner)]!++;
    if (Math.abs(tl.finishTimes[winner]! - NOMINAL_SECONDS[length]) <= 20) winnerTimeOk++;
  }
  const result = { shares: wins.map((w) => w / RACES), winnerTimeOk: winnerTimeOk / RACES };
  console.log(key, result.shares.map((s) => s.toFixed(3)).join(' '), 'timeOk', result.winnerTimeOk);
  cache.set(key, result);
  return result;
}

describe.each(['short', 'long'] as const)('balance, %s race, 10 horses', (length) => {
  it('equal field: every horse wins 10% ± 1%', () => {
    for (const share of run(length, []).shares) {
      expect(share).toBeGreaterThanOrEqual(0.09);
      expect(share).toBeLessThanOrEqual(0.11);
    }
  });

  it('winner time is within ±20 s of nominal in 99% of races', () => {
    expect(run(length, []).winnerTimeOk).toBeGreaterThanOrEqual(0.99);
  });

  it('3 Speed boxes give a real but small edge (above 10%, at most 18%)', () => {
    const share = run(length, ['speed', 'speed', 'speed']).shares[0]!;
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThanOrEqual(0.18);
  });

  it('3 Attack boxes give a smaller edge than Speed, at most 13%', () => {
    const attack = run(length, ['attack', 'attack', 'attack']).shares[0]!;
    expect(attack).toBeLessThanOrEqual(0.13);
    expect(attack).toBeLessThan(run(length, ['speed', 'speed', 'speed']).shares[0]!);
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `npm run test:balance`
Expected: takes a few minutes (60,000 races). Note the printed shares and `timeOk` per configuration.

- [ ] **Step 3: Tune `src/sim/config.ts` until all 8 tests pass** (skip if they already pass)

Change one knob at a time and re-run `npm run test:balance`:

| Failing test | Cause | Knob in `config.ts` |
|---|---|---|
| Equal field outside 9–11% | Engine asymmetry (a bug, not tuning): e.g. index order deciding ties | Fix `simulate.ts`, never widen the tolerance |
| Winner time outside ±20 s too often, times too long | Average pace too slow | Set `BASE_SPEED` to `old × median winner time ÷ nominal` |
| Same, times too short | Average pace too fast | Same formula |
| Same, times spread too wide | Too much variation | Lower `NOISE.amplitude` (0.06 → 0.05) or `KICK.boost` (0.1 → 0.08) |
| 3 Speed > 18% | Boosts too strong | Lower `speed:self1` / `speed:self3` / `speed:star` `mult` in steps of 0.05 |
| 3 Speed ≤ 10% | Boosts too weak | Raise those `mult`s in steps of 0.05 |
| 3 Attack > 13% or ≥ Speed | Slows too strong | Lower `attack:front1` / `attack:front3` / `attack:leader` `seconds` by 0.5 |

Then run `npm test` again (the fast suite must still pass).

- [ ] **Step 4: Commit**

```bash
git add src/sim/balance.slow.test.ts src/sim/config.ts
git commit -m "test(sim): 10k-race balance suite; tune engine to spec targets"
```

---

### Task 11: Close out Phase 1

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Run every check**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:balance`
Expected: all PASS.

- [ ] **Step 2: Update `PROJECT_STATUS.md`**

Tick every Phase 1 box. Add a "Session log" section with: the date, the final `BASE_SPEED` and any effect values changed in Task 10, the balance numbers printed by the suite (equal-field range, 3-Speed share, 3-Attack share, `timeOk` for each length), and "Next: write the Phase 2 plan (Supabase schema, private rooms, lobby)."

- [ ] **Step 3: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record Phase 1 completion and balance results"
```
