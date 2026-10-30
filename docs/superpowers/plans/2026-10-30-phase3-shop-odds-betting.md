# Phase 3 — Shop, Odds, Betting, Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In a Private room, phones buy boxes in the SHOP, the host locks odds (computed on the server from simulations), phones bet Win/Place and can cancel until Start, and Start runs the race once on the server and pays out in one transaction. The room then goes RUNNING → PODIUM → LOBBY.

**Architecture:** The Phase 2 pattern carries on:

- **Coins:** every coin move is a `coin_ledger` row written by a `security definer` RPC. Balance is the sum of a player's rows for the current race.
- **The sim runs in two Supabase Edge Functions, `lock-odds` and `start-race`.** They import the pure `src/sim` code directly; a spike confirmed `../../../src/sim/*.ts` imports work in the local edge runtime.
  - Each function first calls a `*_begin` RPC **with the host's token**. That checks host and phase and returns the race input.
  - It then runs the sim.
  - Finally it calls a **service-role-only** `*_finish` RPC that writes everything in one transaction and moves the phase.
- **Realtime:** every mutating RPC also updates the `rooms` row (`last_activity_at`), and clients already refetch the room on any `rooms` change. So the new tables are **not** added to the Realtime publication: one event per action instead of one per ledger row.

**Tech Stack:** Supabase (Postgres, Edge Functions on the local edge runtime served by `supabase start`), `@supabase/supabase-js` 2.x (`npm:` import inside functions), React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-horse-racing-turf-club-design.md` §4, §5 (SHOP → PODIUM rows and rules), §6 Shop, §7, §8 (Private), §12 phase 3, §13 Server.

---

## Scope decisions (read first)

- **Private mode only.** Office wallets, `p_hist`, floors and `admin_adjust` come in Phase 5.
  - Ledger types now: `topup`, `purchase`, `bet`, `unbet`, `payout`.
- **One `races` row per SHOP…PODIUM cycle.** `rooms.race_id` points at the current race.
  - **LOBBY→SHOP** creates the race and writes a 100-coin `topup` for every phone in the room. Players with no phone get nothing, because they can't buy or bet.
  - **SHOP→LOBBY** deletes the race. Its purchases, bets and ledger rows cascade away. Private coins only live for one race, so nothing of value is lost, and reopening the shop gives a fresh 100.
  - **PODIUM→LOBBY** keeps the finished race and clears `rooms.race_id`.
- **Who can do what:**
  - Only **ticked** phones can buy (own lane, max 3 boxes).
  - **Any** phone in the room can bet, including phones that aren't racing.
  - A bet stores the odds at the moment it was placed. Odds are frozen during BETTING anyway.
- **Odds** (spec §7):
  - `p = wins / sims`, and `odds = clamp(round1(0.9 / p))`. Win is clamped 1.2–20, Place 1.05–6, and `p = 0` gives the maximum.
  - **Time-budgeted Monte Carlo:** up to 500 sims, stopping after 800 ms but never below 50.
    - Measured in Node: one 22-horse long sim takes ~3.3 ms, so 500 sims blew the edge runtime's 2 s CPU limit in the spike. With the budget, a 22-horse long race gets ~200 sims; small fields get the full 500.
  - Each sim uses a new seed, so box spots vary between sims.
- **Seed:** chosen with crypto RNG at **Start**, inside `start-race`. Box spots are therefore known from Start. Phase 4 shows them in a pre-race countdown.
- **Payouts:**
  - A winning bet pays `round(stake × odds)` (half away from zero). Win means 1st; Place means top 3.
  - Payouts are written at Start, in the same transaction as the results.
  - The UI keeps them hidden until PODIUM (no spoilers). The data is readable because phones need the timeline for playback.
- **Start is idempotent:**
  - `start_race_finish` locks the room row and requires BETTING. A second Start, even a concurrent one, gets `wrong_phase` and changes nothing.
  - `race_timelines.race_id` is a primary key as a second guard.
- **RUNNING→PODIUM** is a host RPC `finish_race`, allowed once `now() >= races.ends_at`.
  - `ends_at = started_at + last finisher's time`.
  - In Phase 3 the big screen shows a countdown, then calls it. Phase 4 replaces the countdown with playback.
- **Timeline storage** (spec §4: raw is 100–340 KB):
  - `packTimeline` keeps progress at **2 Hz as integer decimetres**, which is about a third of the size.
  - Measured: 113 KB → 35 KB for 10 horses short, 339 KB → 85 KB for 22 horses long. Postgres TOAST and HTTP gzip compress this further.
  - `unpackTimeline` interpolates back to 10 Hz, within ~2.3 m of the original.
  - It is stored in its own table `race_timelines`, so refetches of `races` never pull it.
- **Locking order:** every RPC locks the `rooms` row first (`FOR UPDATE`), then player rows. Player actions in one room are serialized, which is trivial at office scale, and there are no deadlocks.
  - This also bumps `last_activity_at` for player actions, which clears a Phase 2 deferred item.
- **Prices are duplicated in SQL** (`buy_box`: speed 60, defense 35, attack 20). A DB test asserts they equal `PRICES` in `src/sim/config.ts`.
- **Spam guard:** at most 50 bets per phone per race.
- **Edge Function auth:** `verify_jwt = false` in `config.toml`, because the function proves the caller is the host by calling `*_begin` with the caller's own token.
  - This also avoids gateway JWT checks breaking with new asymmetric keys on hosted projects.
  - With no token the call runs as `anon`, which has no execute grant, so it fails.
- **Deploy risk (Task 13):**
  - `supabase functions deploy` must bundle the `../../../src/sim` imports.
  - If the hosted bundler refuses files outside `supabase/functions`, the fallback is a `predeploy` script that copies `src/sim` into `supabase/functions/_shared/sim`, and a gitignore entry for it.
  - That is not needed locally.

## File structure

| File | Responsibility |
|---|---|
| `src/sim/odds.ts` (+ test) | `ODDS`, `priceOdds`, `simulateOdds` (pure, shared with Edge Functions) |
| `src/sim/pack.ts` (+ test) | `PACK_HZ`, `packTimeline`, `unpackTimeline` |
| `supabase/migrations/20261030000005_races.sql` | `races`, `race_timelines`, `purchases`, `bets`, `coin_ledger`, RLS, `private.balance`, `set_phase` v2 (race + topups) |
| `supabase/migrations/20261030000006_race_flow.sql` | `lock_odds_begin/finish`, `start_race_begin/finish`, `finish_race` |
| `supabase/migrations/20261030000007_shop_bets.sql` | `private.lock_my_player`, `buy_box`, `place_bet`, `cancel_bet` |
| `supabase/functions/_shared/http.ts` | CORS, user/service clients, `{ error: code }` responses, `rpc` helper |
| `supabase/functions/lock-odds/index.ts` | Begin → `simulateOdds` → finish |
| `supabase/functions/start-race/index.ts` | Begin → crypto seed → `simulateRace` → `packTimeline` → finish |
| `supabase/config.toml` | `verify_jwt = false` for both functions |
| `tests/db/helpers.ts` | + `invoke`, `failsInvoke` |
| `tests/db/raceFixtures.ts` | `shopRoom`, `bettingRoom`, `fixtureOdds`, `balance` |
| `tests/db/races.test.ts`, `flow.test.ts`, `shop.test.ts`, `functions.test.ts` | Integration tests |
| `src/net/database.types.ts` | Regenerated |
| `src/net/rooms.ts` | New row types, extended `RoomState`/`fetchRoom`, RPC + function wrappers, error texts |
| `src/betting/betting.ts` (+ test) | Pure UI helpers: `balanceOf`, `boxesOf`, `potOf`, `oddsOf`, `nameOf`, `formatOdds`, `ordinal`, box labels |
| `src/betting/useSecondsLeft.ts` | Countdown hook |
| `src/track/TrackPage.tsx` | Shop, odds-locked, betting, running and podium boards |
| `src/play/PlayPage.tsx` | Shop panel, bet slip, running and result panels |
| `src/app/app.css` | Odds table, shop buttons |

---

### Task 0: Branch

- [ ] **Step 1:** From an up-to-date `master` run `git checkout -b phase3-betting`. Skip this if the branch already exists. Make sure the local stack is running (`npx supabase status`).

---

### Task 1: Odds (pure)

**Files:**
- Create: `src/sim/odds.ts`
- Test: `src/sim/odds.test.ts`

- [ ] **Step 1: Write the failing test** — `src/sim/odds.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ODDS, priceOdds, simulateOdds } from './odds.ts';
import { createSeededRng } from './rng.ts';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `h${i}`);
const frozenClock = () => 0;

describe('priceOdds', () => {
  it.each([
    [0.5, ODDS.win, 1.8],
    [0.1, ODDS.win, 9],
    [0.03, ODDS.win, 20], // 30 → max
    [0, ODDS.win, 20],
    [0.9, ODDS.win, 1.2], // 1.0 → min
    [1, ODDS.place, 1.05],
    [0.3, ODDS.place, 3],
    [0.05, ODDS.place, 6],
  ])('p=%s', (p, range, expected) => {
    expect(priceOdds(p, range)).toBe(expected);
  });
});

describe('simulateOdds', () => {
  it('prices an even 2-horse race near 0.9 / 0.5', () => {
    const { odds, sims } = simulateOdds(
      { horses: ['a', 'b'], bought: {}, length: 'short' },
      createSeededRng(1),
      frozenClock,
    );
    expect(sims).toBe(ODDS.maxSims);
    for (const h of ['a', 'b']) {
      expect(odds[h]!.win).toBeGreaterThanOrEqual(1.6);
      expect(odds[h]!.win).toBeLessThanOrEqual(2.1);
      expect(odds[h]!.place).toBe(ODDS.place.min); // everyone places in a 2-horse race
    }
  });

  it('gives a 3-Speed horse shorter win odds than the typical horse', () => {
    const horses = ids(10);
    const { odds } = simulateOdds(
      { horses, bought: { h0: ['speed', 'speed', 'speed'] }, length: 'short' },
      createSeededRng(2),
      frozenClock,
    );
    const others = horses
      .slice(1)
      .map((h) => odds[h]!.win)
      .sort((a, b) => a - b);
    expect(odds.h0!.win).toBeLessThan(others[4]!);
  });

  it('stops at the time budget but always runs minSims', () => {
    let t = 0;
    const { sims } = simulateOdds(
      { horses: ['a', 'b'], bought: {}, length: 'short' },
      createSeededRng(3),
      () => (t += 1000),
    );
    expect(sims).toBe(ODDS.minSims);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run src/sim/odds.test.ts` should FAIL with "Cannot find module './odds.ts'".

- [ ] **Step 3: Implement** — `src/sim/odds.ts`:

```ts
import type { Rng } from './rng.ts';
import { simulateRace } from './simulate.ts';
import type { HorseId, RaceInput } from './types.ts';

export interface OddsLine {
  readonly win: number;
  readonly place: number;
}
export interface OddsRange {
  readonly min: number;
  readonly max: number;
}

/** Spec §7 (Private: p = p_sim). Odds pay 90% of fair value, rounded to 0.1, then clamped. */
export const ODDS = {
  payoutRate: 0.9,
  win: { min: 1.2, max: 20 },
  place: { min: 1.05, max: 6 },
  maxSims: 500,
  /** Always run this many, even past the budget. */
  minSims: 50,
  /** Edge Functions get 2 s CPU; a 22-horse long race costs ~3-5 ms per sim. */
  budgetMs: 800,
} as const;

export function priceOdds(p: number, range: OddsRange): number {
  if (p <= 0) return range.max;
  const odds = Math.round((ODDS.payoutRate / p) * 10) / 10;
  return Math.min(range.max, Math.max(range.min, odds));
}

/**
 * Win/Place odds from repeated runs of this exact field, bought boxes and length.
 * Each run has a fresh seed, so box spots vary between runs.
 */
export function simulateOdds(
  race: Omit<RaceInput, 'seed'>,
  rng: Rng,
  now: () => number = () => performance.now(),
): { odds: Record<HorseId, OddsLine>; sims: number } {
  const wins = new Map(race.horses.map((h) => [h, 0]));
  const top3 = new Map(race.horses.map((h) => [h, 0]));
  const start = now();
  let sims = 0;
  while (sims < ODDS.maxSims && (sims < ODDS.minSims || now() - start < ODDS.budgetMs)) {
    const { finishOrder } = simulateRace({ ...race, seed: rng.nextInt(2 ** 32) });
    wins.set(finishOrder[0]!, wins.get(finishOrder[0]!)! + 1);
    for (const h of finishOrder.slice(0, 3)) top3.set(h, top3.get(h)! + 1);
    sims++;
  }
  const odds = Object.fromEntries(
    race.horses.map((h) => [
      h,
      {
        win: priceOdds(wins.get(h)! / sims, ODDS.win),
        place: priceOdds(top3.get(h)! / sims, ODDS.place),
      },
    ]),
  );
  return { odds, sims };
}
```

- [ ] **Step 4: Run it.** `npx vitest run src/sim/odds.test.ts` should PASS (3 + 8 tests).

- [ ] **Step 5: Commit.** `git add src/sim/odds.ts src/sim/odds.test.ts && git commit -m "feat(sim): Win/Place odds from time-budgeted simulations"`

---

### Task 2: Timeline packing (pure)

**Files:**
- Create: `src/sim/pack.ts`
- Test: `src/sim/pack.test.ts`

- [ ] **Step 1: Write the failing test** — `src/sim/pack.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it.** `npx vitest run src/sim/pack.test.ts` should FAIL because the module is missing.

- [ ] **Step 3: Implement** — `src/sim/pack.ts`:

```ts
import type { HorseId, Timeline } from './types.ts';

/** Progress samples per second kept when a Timeline is stored or sent (raw JSON is 100-340 KB). */
export const PACK_HZ = 2;

/** A Timeline with progress thinned to PACK_HZ and stored as integer decimetres. */
export interface PackedTimeline extends Omit<Timeline, 'progress'> {
  /** Samples per horse in the unpacked Timeline (one per sim tick). */
  readonly ticks: number;
  /** Decimetres at every `tickHz / PACK_HZ`-th tick, plus the final tick. */
  readonly progressDm: Readonly<Record<HorseId, readonly number[]>>;
}

export function packTimeline(timeline: Timeline): PackedTimeline {
  const { progress, ...rest } = timeline;
  const step = timeline.tickHz / PACK_HZ; // TICK_HZ is a multiple of PACK_HZ
  const ticks = Object.values(progress)[0]?.length ?? 0;
  const progressDm: Record<HorseId, number[]> = {};
  for (const [horse, samples] of Object.entries(progress)) {
    const dm: number[] = [];
    for (let i = 0; i < ticks; i += step) dm.push(Math.round(samples[i]! * 10));
    if ((ticks - 1) % step !== 0) dm.push(Math.round(samples[ticks - 1]! * 10));
    progressDm[horse] = dm;
  }
  return { ...rest, ticks, progressDm };
}

/** Linear interpolation back to one sample per tick, in metres (within ~2.5 m of the original). */
export function unpackTimeline(packed: PackedTimeline): Timeline {
  const { ticks, progressDm, ...rest } = packed;
  const step = packed.tickHz / PACK_HZ;
  const tickOf = (k: number) => Math.min(k * step, ticks - 1);
  const progress: Record<HorseId, number[]> = {};
  for (const [horse, dm] of Object.entries(progressDm)) {
    progress[horse] = Array.from({ length: ticks }, (_, i) => {
      const k = Math.floor(i / step);
      const a = tickOf(k);
      const b = tickOf(k + 1);
      const value = b === a ? dm[k]! : dm[k]! + ((dm[k + 1]! - dm[k]!) * (i - a)) / (b - a);
      return value / 10;
    });
  }
  return { ...rest, progress };
}
```

- [ ] **Step 4: Run it.** `npx vitest run src/sim/pack.test.ts` should PASS.

- [ ] **Step 5: Commit.** `git add src/sim/pack.ts src/sim/pack.test.ts && git commit -m "feat(sim): pack timelines to 2 Hz decimetres for storage"`

---

### Task 3: Races, ledger tables and `set_phase` v2

**Files:**
- Create: `supabase/migrations/20261030000005_races.sql`
- Create: `tests/db/raceFixtures.ts`
- Test: `tests/db/races.test.ts`

- [ ] **Step 1: Write the fixtures** — `tests/db/raceFixtures.ts`. `bettingRoom` uses RPCs from Task 4, and only Task 4+ tests call it.

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient, ok } from './helpers.ts';

/** Shop open. Phones Ali and Bea and host-typed Siti are racing (lane order); phone Cal only watches. */
export async function shopRoom() {
  const host = await anonClient();
  const created = await ok(host.rpc('create_room', {}));
  const join = async (name: string) => {
    const client = await anonClient();
    const player = await ok(client.rpc('join_room', { p_code: created.code, p_name: name }));
    return { client, player };
  };
  const ali = await join('Ali');
  const bea = await join('Bea');
  const cal = await join('Cal');
  const siti = await ok(host.rpc('add_player', { p_room: created.id, p_name: 'Siti' }));
  for (const id of [ali.player.id, bea.player.id, siti.id]) {
    await ok(host.rpc('set_ticked', { p_player: id, p_ticked: true }));
  }
  const room = await ok(host.rpc('set_phase', { p_room: created.id, p_phase: 'SHOP' }));
  return { host, room, ali, bea, cal, siti, raceId: room.race_id as string };
}

/** Fixed odds so payout tests are exact. */
export const fixtureOdds = (r: Awaited<ReturnType<typeof shopRoom>>) => ({
  [r.ali.player.id]: { win: 2.5, place: 1.5 },
  [r.bea.player.id]: { win: 3, place: 1.2 },
  [r.siti.id]: { win: 4, place: 1.6 },
});

/** Shop room moved to BETTING with fixtureOdds (no Edge Function involved). */
export async function bettingRoom() {
  const r = await shopRoom();
  await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
  await ok(adminClient().rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) }));
  return r;
}

export async function balance(client: SupabaseClient, raceId: string, playerId: string) {
  const rows = await ok(
    client.from('coin_ledger').select('amount').eq('race_id', raceId).eq('player_id', playerId),
  );
  return (rows as { amount: number }[]).reduce((sum, row) => sum + row.amount, 0);
}
```

- [ ] **Step 2: Write the failing test** — `tests/db/races.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { balance, shopRoom } from './raceFixtures.ts';

describe('races', () => {
  it('opening the shop starts a race and tops up every phone with 100', async () => {
    const r = await shopRoom();
    expect(r.raceId).toBeTruthy();
    const ledger = await ok(
      r.host.from('coin_ledger').select('player_id, type, amount').eq('race_id', r.raceId),
    );
    expect(ledger).toHaveLength(3); // Siti has no phone
    for (const p of [r.ali.player, r.bea.player, r.cal.player]) {
      expect(ledger).toContainEqual({ player_id: p.id, type: 'topup', amount: 100 });
    }
  });

  it('going back to the lobby cancels the race; reopening gives a fresh 100', async () => {
    const r = await shopRoom();
    const lobby = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
    expect(lobby.race_id).toBeNull();
    expect(await ok(adminClient().from('races').select('id').eq('id', r.raceId))).toEqual([]);

    const again = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
    expect(again.race_id).not.toBe(r.raceId);
    expect(await balance(r.ali.client, again.race_id, r.ali.player.id)).toBe(100);
  });

  it('members read race data; strangers see nothing and nobody writes directly', async () => {
    const r = await shopRoom();
    expect(await ok(r.cal.client.from('races').select('id').eq('id', r.raceId))).toHaveLength(1);

    const stranger = await anonClient();
    expect(await ok(stranger.from('races').select('id').eq('id', r.raceId))).toEqual([]);
    expect(await ok(stranger.from('coin_ledger').select('id').eq('race_id', r.raceId))).toEqual([]);

    const error = await fails(
      r.ali.client.from('coin_ledger').insert({
        race_id: r.raceId,
        room_id: r.room.id,
        player_id: r.ali.player.id,
        type: 'topup',
        amount: 1000,
      }),
    );
    expect(error).toMatch(/permission denied/);
  });
});
```

- [ ] **Step 3: Run it.** `npm run test:db -- tests/db/races.test.ts` should FAIL (`race_id` undefined, no `coin_ledger` table).

- [ ] **Step 4: Write the migration** — `supabase/migrations/20261030000005_races.sql`:

```sql
-- Phase 3: one race per SHOP..PODIUM cycle, with its purchases, bets and coin ledger.
-- Private coins live per race: each phone gets a 100-coin topup when the shop opens (spec §8).
-- These tables are not in the Realtime publication: every mutating RPC also updates the rooms row,
-- and clients refetch the whole room on any rooms change.

create table public.races (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  length text not null check (length in ('short', 'long')),
  prize text not null default '',
  -- Lane order (room_players ids), fixed when odds lock.
  horses uuid[] not null default '{}',
  -- {"<player id>": {"win": 3.4, "place": 1.6}}, set when odds lock.
  odds jsonb,
  finish_order uuid[],
  started_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index races_room_id_idx on public.races (room_id);

alter table public.rooms add column race_id uuid references public.races (id) on delete set null;

-- Packed Timeline (src/sim/pack.ts). Own table so refetching races never pulls it.
create table public.race_timelines (
  race_id uuid primary key references public.races (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  timeline jsonb not null
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.room_players (id) on delete cascade,
  box text not null check (box in ('speed', 'attack', 'defense')),
  price integer not null check (price > 0),
  created_at timestamptz not null default now()
);
create index purchases_race_id_idx on public.purchases (race_id);

create table public.bets (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.room_players (id) on delete cascade, -- bettor
  horse_id uuid not null references public.room_players (id) on delete cascade,
  kind text not null check (kind in ('win', 'place')),
  stake integer not null check (stake > 0),
  odds numeric(5, 2) not null,
  -- Null until Start; 0 for a losing bet.
  payout integer,
  created_at timestamptz not null default now()
);
create index bets_race_id_idx on public.bets (race_id);

create table public.coin_ledger (
  id bigint generated always as identity primary key,
  race_id uuid not null references public.races (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.room_players (id) on delete cascade,
  type text not null check (type in ('topup', 'purchase', 'bet', 'unbet', 'payout')),
  amount integer not null,
  created_at timestamptz not null default now()
);
create index coin_ledger_race_player_idx on public.coin_ledger (race_id, player_id);

revoke all on public.races, public.race_timelines, public.purchases, public.bets, public.coin_ledger
  from anon, authenticated;
grant select on public.races, public.race_timelines, public.purchases, public.bets, public.coin_ledger
  to authenticated;

alter table public.races enable row level security;
alter table public.race_timelines enable row level security;
alter table public.purchases enable row level security;
alter table public.bets enable row level security;
alter table public.coin_ledger enable row level security;

create policy "members read races" on public.races
  for select to authenticated using (private.is_room_member(room_id));
create policy "members read timelines" on public.race_timelines
  for select to authenticated using (private.is_room_member(room_id));
create policy "members read purchases" on public.purchases
  for select to authenticated using (private.is_room_member(room_id));
create policy "members read bets" on public.bets
  for select to authenticated using (private.is_room_member(room_id));
create policy "members read ledger" on public.coin_ledger
  for select to authenticated using (private.is_room_member(room_id));

-- The ledger is the single source of truth (spec §8).
create function private.balance(p_race uuid, p_player uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::integer
  from public.coin_ledger where race_id = p_race and player_id = p_player;
$$;
revoke execute on function private.balance(uuid, uuid) from public;

-- v2: opening the shop starts a race; going back cancels it; Next race keeps the finished one.
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
  if v_room.phase || '>' || coalesce(p_phase, '') not in ('LOBBY>SHOP', 'SHOP>LOBBY', 'PODIUM>LOBBY') then
    raise exception 'bad_transition';
  end if;
  if p_phase = 'SHOP' then
    if (select count(*) from public.room_players where room_id = p_room and ticked) < 2 then
      raise exception 'need_two_horses';
    end if;
    insert into public.races (room_id, length, prize)
    values (p_room, v_room.race_length, v_room.prize)
    returning id into v_race;
    insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
    select v_race, p_room, id, 'topup', 100
    from public.room_players where room_id = p_room and uid is not null;
  elsif v_room.phase = 'SHOP' then
    -- Coins are per race, so cancelling it loses nothing; reopening tops up again.
    delete from public.races where id = v_room.race_id;
  end if;
  update public.room_players set ready = false where room_id = p_room and ready;
  update public.rooms set phase = p_phase, race_id = v_race where id = p_room returning * into v_room;
  return v_room;
end;
$$;
```

- [ ] **Step 5: Apply and test.** Run `npx supabase migration up`, then `npm run test:db`. All DB tests should PASS: the new ones, plus the Phase 2 `phases.test.ts` against `set_phase` v2. If the realtime test fails once right after a migration, rerun it (known flake, see README).

- [ ] **Step 6: Commit.** `git add supabase/migrations/20261030000005_races.sql tests/db/raceFixtures.ts tests/db/races.test.ts && git commit -m "feat(db): races, purchases, bets and coin ledger; topups at shop open"`

---

### Task 4: Odds lock, Start and finish RPCs

**Files:**
- Create: `supabase/migrations/20261030000006_race_flow.sql`
- Test: `tests/db/flow.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/db/flow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { adminClient, fails, ok } from './helpers.ts';
import { bettingRoom, fixtureOdds, shopRoom } from './raceFixtures.ts';

const phaseOf = async (r: Awaited<ReturnType<typeof shopRoom>>) =>
  (await ok(r.host.from('rooms').select('phase').eq('id', r.room.id).single())).phase;

describe('lock_odds', () => {
  it('closes the shop, fixes lane order and returns the race input; retry returns the same', async () => {
    const r = await shopRoom();
    const input = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(input).toEqual({
      race_id: r.raceId,
      length: 'short',
      horses: [r.ali.player.id, r.bea.player.id, r.siti.id],
      bought: {},
    });
    expect(await phaseOf(r)).toBe('ODDS_LOCKED');
    expect(await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }))).toEqual(input);
  });

  it('is host-only and needs the shop open', async () => {
    const r = await shopRoom();
    expect(await fails(r.ali.client.rpc('lock_odds_begin', { p_room: r.room.id }))).toBe('not_host');
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
    expect(await fails(r.host.rpc('lock_odds_begin', { p_room: r.room.id }))).toBe('wrong_phase');
  });

  it('lock_odds_finish is service-only, needs odds for every horse and opens betting', async () => {
    const r = await shopRoom();
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(
      await fails(r.host.rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) })),
    ).toMatch(/permission denied/);

    const admin = adminClient();
    const partial = { [r.ali.player.id]: { win: 2, place: 1.2 } };
    expect(await fails(admin.rpc('lock_odds_finish', { p_race: r.raceId, p_odds: partial }))).toBe(
      'bad_odds',
    );
    await ok(admin.rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) }));
    expect(await phaseOf(r)).toBe('BETTING');
    const race = await ok(r.host.from('races').select('odds').eq('id', r.raceId).single());
    expect(race.odds).toEqual(fixtureOdds(r));
  });
});

describe('start_race', () => {
  it('writes the result once and refuses a second Start', async () => {
    const r = await bettingRoom();
    expect(await fails(r.ali.client.rpc('start_race_begin', { p_room: r.room.id }))).toBe('not_host');
    const input = await ok(r.host.rpc('start_race_begin', { p_room: r.room.id }));
    expect(input.horses).toHaveLength(3);

    const admin = adminClient();
    const finish = [r.bea.player.id, r.ali.player.id, r.siti.id];
    const args = { p_race: r.raceId, p_timeline: { finishOrder: finish }, p_finish: finish, p_seconds: 118.5 };
    await ok(admin.rpc('start_race_finish', args));
    expect(await fails(admin.rpc('start_race_finish', args))).toBe('wrong_phase');
    expect(await fails(r.host.rpc('start_race_begin', { p_room: r.room.id }))).toBe('wrong_phase');

    expect(await phaseOf(r)).toBe('RUNNING');
    const race = await ok(r.host.from('races').select('*').eq('id', r.raceId).single());
    expect(race.finish_order).toEqual(finish);
    expect(Date.parse(race.ends_at) - Date.parse(race.started_at)).toBeCloseTo(118_500, -1);
    const timelines = await ok(r.cal.client.from('race_timelines').select('timeline').eq('race_id', r.raceId));
    expect(timelines).toEqual([{ timeline: { finishOrder: finish } }]);
  });

  it('rejects a finish order that is not exactly the field', async () => {
    const r = await bettingRoom();
    const short = [r.ali.player.id, r.bea.player.id];
    expect(
      await fails(
        adminClient().rpc('start_race_finish', {
          p_race: r.raceId,
          p_timeline: {},
          p_finish: short,
          p_seconds: 100,
        }),
      ),
    ).toBe('bad_result');
  });
});

describe('finish_race', () => {
  it('moves to PODIUM only after the race has run; Next race keeps the result', async () => {
    const r = await bettingRoom();
    const admin = adminClient();
    const finish = [r.siti.id, r.ali.player.id, r.bea.player.id];
    await ok(
      admin.rpc('start_race_finish', { p_race: r.raceId, p_timeline: {}, p_finish: finish, p_seconds: 100 }),
    );
    expect(await fails(r.host.rpc('finish_race', { p_room: r.room.id }))).toBe('race_not_finished');

    await ok(
      admin.from('races').update({ ends_at: new Date(Date.now() - 1000).toISOString() }).eq('id', r.raceId),
    );
    expect(await fails(r.ali.client.rpc('finish_race', { p_room: r.room.id }))).toBe('not_host');
    expect((await ok(r.host.rpc('finish_race', { p_room: r.room.id }))).phase).toBe('PODIUM');

    const lobby = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
    expect(lobby.race_id).toBeNull();
    expect(await ok(r.host.from('races').select('finish_order').eq('id', r.raceId))).toEqual([
      { finish_order: finish },
    ]);
  });
});
```

- [ ] **Step 2: Run it.** `npm run test:db -- tests/db/flow.test.ts` should FAIL because the functions are missing.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261030000006_race_flow.sql`:

```sql
-- Odds lock and race start. The Edge Functions (supabase/functions/lock-odds, start-race) run the sim:
--   *_begin runs with the host's token: checks host + phase and returns the race input;
--   *_finish is service-role only and writes the result and the next phase in one transaction.

-- {race_id, length, horses: [lane order], bought: {player id: [box, ...]}} for src/sim.
create function private.race_input(p_race uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'race_id', r.id,
    'length', r.length,
    'horses', to_jsonb(r.horses),
    'bought', coalesce(
      (select jsonb_object_agg(b.player_id, b.boxes)
       from (select player_id, jsonb_agg(box order by created_at, id) as boxes
             from public.purchases where race_id = r.id group by player_id) b),
      '{}'::jsonb))
  from public.races r where r.id = p_race;
$$;
revoke execute on function private.race_input(uuid) from public;

create function public.lock_odds_begin(p_room uuid)
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
                         where room_id = p_room and ticked order by joined_at, id)
      where id = v_room.race_id;
    update public.room_players set ready = false where room_id = p_room and ready;
    update public.rooms set phase = 'ODDS_LOCKED' where id = p_room;
  end if;
  return private.race_input(v_room.race_id);
end;
$$;
revoke execute on function public.lock_odds_begin(uuid) from public, anon;
grant execute on function public.lock_odds_begin(uuid) to authenticated;

create function public.lock_odds_finish(p_race uuid, p_odds jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_race public.races;
  v_room public.rooms;
begin
  select * into v_race from public.races where id = p_race;
  if not found then
    raise exception 'race_not_found';
  end if;
  select * into v_room from public.rooms where id = v_race.room_id for update;
  if v_room.race_id is distinct from p_race or v_room.phase <> 'ODDS_LOCKED' then
    raise exception 'wrong_phase';
  end if;
  if exists (
    select 1 from unnest(v_race.horses) as h
    where coalesce(jsonb_typeof(p_odds -> h::text -> 'win'), '') <> 'number'
       or coalesce(jsonb_typeof(p_odds -> h::text -> 'place'), '') <> 'number'
  ) then
    raise exception 'bad_odds';
  end if;
  update public.races set odds = p_odds where id = p_race;
  update public.rooms set phase = 'BETTING', last_activity_at = now() where id = v_room.id;
end;
$$;
revoke execute on function public.lock_odds_finish(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.lock_odds_finish(uuid, jsonb) to service_role;

create function public.start_race_begin(p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_host_room(p_room);
begin
  if v_room.phase <> 'BETTING' then
    raise exception 'wrong_phase';
  end if;
  return private.race_input(v_room.race_id);
end;
$$;
revoke execute on function public.start_race_begin(uuid) from public, anon;
grant execute on function public.start_race_begin(uuid) to authenticated;

-- Idempotent: the room row lock + BETTING check let exactly one Start through (spec §5).
create function public.start_race_finish(p_race uuid, p_timeline jsonb, p_finish uuid[], p_seconds numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_race public.races;
  v_room public.rooms;
begin
  select * into v_race from public.races where id = p_race;
  if not found then
    raise exception 'race_not_found';
  end if;
  select * into v_room from public.rooms where id = v_race.room_id for update;
  if v_room.race_id is distinct from p_race or v_room.phase <> 'BETTING' then
    raise exception 'wrong_phase';
  end if;
  if p_finish is null or p_seconds is null or p_seconds <= 0
     or cardinality(p_finish) <> cardinality(v_race.horses)
     or exists (select unnest(v_race.horses) except select unnest(p_finish)) then
    raise exception 'bad_result';
  end if;

  insert into public.race_timelines (race_id, room_id, timeline) values (p_race, v_room.id, p_timeline);
  update public.races
    set finish_order = p_finish,
        started_at = now(),
        ends_at = now() + make_interval(secs => p_seconds::double precision)
    where id = p_race;
  update public.bets
    set payout = case
      when (kind = 'win' and horse_id = p_finish[1])
        or (kind = 'place' and horse_id = any (p_finish[1:3]))
      then round(stake * odds)::integer
      else 0
    end
    where race_id = p_race;
  insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
    select race_id, room_id, player_id, 'payout', payout
    from public.bets where race_id = p_race and payout > 0;
  update public.room_players set ready = false where room_id = v_room.id and ready;
  update public.rooms set phase = 'RUNNING', last_activity_at = now() where id = v_room.id;
end;
$$;
revoke execute on function public.start_race_finish(uuid, jsonb, uuid[], numeric) from public, anon, authenticated;
grant execute on function public.start_race_finish(uuid, jsonb, uuid[], numeric) to service_role;

create function public.finish_race(p_room uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_host_room(p_room);
begin
  if v_room.phase <> 'RUNNING' then
    raise exception 'wrong_phase';
  end if;
  if now() < (select ends_at from public.races where id = v_room.race_id) then
    raise exception 'race_not_finished';
  end if;
  update public.rooms set phase = 'PODIUM' where id = p_room returning * into v_room;
  return v_room;
end;
$$;
revoke execute on function public.finish_race(uuid) from public, anon;
grant execute on function public.finish_race(uuid) to authenticated;
```

- [ ] **Step 4: Apply and test.** `npx supabase migration up && npm run test:db` should leave all DB tests PASSING.

- [ ] **Step 5: Commit.** `git add supabase/migrations/20261030000006_race_flow.sql tests/db/flow.test.ts && git commit -m "feat(db): odds lock, idempotent start with payouts, finish race"`

---

### Task 5: Buy, bet and unbet RPCs

**Files:**
- Create: `supabase/migrations/20261030000007_shop_bets.sql`
- Test: `tests/db/shop.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/db/shop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PRICES } from '../../src/sim/config.ts';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { balance, bettingRoom, shopRoom } from './raceFixtures.ts';

describe('buy_box', () => {
  it('charges PRICES and records the box', async () => {
    const r = await shopRoom();
    const c = r.ali.client;
    const bought = await ok(c.rpc('buy_box', { p_room: r.room.id, p_box: 'speed' }));
    expect(bought).toMatchObject({ player_id: r.ali.player.id, box: 'speed', price: PRICES.speed });
    const attack = await ok(c.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }));
    expect(attack.price).toBe(PRICES.attack);
    expect(await balance(c, r.raceId, r.ali.player.id)).toBe(100 - PRICES.speed - PRICES.attack);
    expect(await fails(c.rpc('buy_box', { p_room: r.room.id, p_box: 'defense' }))).toBe(
      'not_enough_coins',
    );
  });

  it('prices defense from PRICES too', async () => {
    const r = await shopRoom();
    const bought = await ok(r.bea.client.rpc('buy_box', { p_room: r.room.id, p_box: 'defense' }));
    expect(bought.price).toBe(PRICES.defense);
  });

  it('allows at most 3 boxes', async () => {
    const r = await shopRoom();
    for (let i = 0; i < 3; i++) {
      await ok(r.bea.client.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }));
    }
    expect(await fails(r.bea.client.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }))).toBe(
      'max_boxes',
    );
  });

  it('is for racing phones while the shop is open', async () => {
    const r = await shopRoom();
    expect(await fails(r.cal.client.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }))).toBe(
      'not_racing',
    );
    const stranger = await anonClient();
    expect(await fails(stranger.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }))).toBe(
      'not_in_room',
    );
    expect(await fails(r.ali.client.rpc('buy_box', { p_room: r.room.id, p_box: 'turbo' }))).toBe(
      'bad_box',
    );
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(await fails(r.ali.client.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }))).toBe(
      'wrong_phase',
    );
  });

  it('feeds bought boxes into the race input', async () => {
    const r = await shopRoom();
    await ok(r.ali.client.rpc('buy_box', { p_room: r.room.id, p_box: 'speed' }));
    await ok(r.ali.client.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }));
    await ok(r.bea.client.rpc('buy_box', { p_room: r.room.id, p_box: 'defense' }));
    const input = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(input.bought).toEqual({
      [r.ali.player.id]: ['speed', 'attack'],
      [r.bea.player.id]: ['defense'],
    });
  });
});

describe('place_bet and cancel_bet', () => {
  it('takes the stake at the frozen odds; cancelling refunds it in full', async () => {
    const r = await bettingRoom();
    const c = r.cal.client;
    const bet = await ok(
      c.rpc('place_bet', { p_room: r.room.id, p_horse: r.bea.player.id, p_kind: 'win', p_stake: 30 }),
    );
    expect(bet).toMatchObject({ stake: 30, odds: 3, payout: null, player_id: r.cal.player.id });
    expect(await balance(c, r.raceId, r.cal.player.id)).toBe(70);

    await ok(c.rpc('cancel_bet', { p_bet: bet.id }));
    expect(await balance(c, r.raceId, r.cal.player.id)).toBe(100);
    const types = await ok(
      c.from('coin_ledger').select('type').eq('race_id', r.raceId).eq('player_id', r.cal.player.id).order('id'),
    );
    expect(types.map((t: { type: string }) => t.type)).toEqual(['topup', 'bet', 'unbet']);
    expect(await ok(c.from('bets').select('id').eq('id', bet.id))).toEqual([]);
  });

  it('validates stake, kind, horse and ownership', async () => {
    const r = await bettingRoom();
    const c = r.cal.client;
    const bet = (horse: string, kind: string, stake: number) =>
      c.rpc('place_bet', { p_room: r.room.id, p_horse: horse, p_kind: kind, p_stake: stake });
    expect(await fails(bet(r.ali.player.id, 'win', 0))).toBe('bad_stake');
    expect(await fails(bet(r.ali.player.id, 'win', 101))).toBe('not_enough_coins');
    expect(await fails(bet(r.ali.player.id, 'show', 10))).toBe('bad_bet');
    expect(await fails(bet(r.cal.player.id, 'win', 10))).toBe('not_in_race');

    const mine = await ok(bet(r.ali.player.id, 'win', 10));
    expect(await fails(r.ali.client.rpc('cancel_bet', { p_bet: mine.id }))).toBe('bet_not_found');
  });

  it('needs the BETTING phase', async () => {
    const r = await shopRoom();
    expect(
      await fails(
        r.cal.client.rpc('place_bet', {
          p_room: r.room.id,
          p_horse: r.ali.player.id,
          p_kind: 'win',
          p_stake: 10,
        }),
      ),
    ).toBe('wrong_phase');
  });

  it('pays winners at Start in the same transaction', async () => {
    const r = await bettingRoom();
    const bet = (who: typeof r.ali, horse: string, kind: string, stake: number) =>
      ok(who.client.rpc('place_bet', { p_room: r.room.id, p_horse: horse, p_kind: kind, p_stake: stake }));
    const aliWin = await bet(r.ali, r.ali.player.id, 'win', 10); // Ali finishes 2nd: lost
    const aliPlace = await bet(r.ali, r.bea.player.id, 'place', 20); // Bea 1st: 20 × 1.2 = 24
    await bet(r.bea, r.siti.id, 'win', 30); // Siti 3rd: lost
    await bet(r.bea, r.siti.id, 'place', 10); // 10 × 1.6 = 16

    const finish = [r.bea.player.id, r.ali.player.id, r.siti.id];
    await ok(
      adminClient().rpc('start_race_finish', {
        p_race: r.raceId,
        p_timeline: {},
        p_finish: finish,
        p_seconds: 100,
      }),
    );
    expect(await balance(r.ali.client, r.raceId, r.ali.player.id)).toBe(100 - 10 - 20 + 24);
    expect(await balance(r.bea.client, r.raceId, r.bea.player.id)).toBe(100 - 30 - 10 + 16);
    expect(await balance(r.cal.client, r.raceId, r.cal.player.id)).toBe(100);

    const payouts = await ok(r.ali.client.from('bets').select('id, payout').eq('player_id', r.ali.player.id));
    expect(payouts).toContainEqual({ id: aliWin.id, payout: 0 });
    expect(payouts).toContainEqual({ id: aliPlace.id, payout: 24 });
    expect(await fails(r.ali.client.rpc('cancel_bet', { p_bet: aliPlace.id }))).toBe('wrong_phase');
  });
});
```

- [ ] **Step 2: Run it.** `npm run test:db -- tests/db/shop.test.ts` should FAIL because the functions are missing.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261030000007_shop_bets.sql`:

```sql
-- Phone actions: buy boxes (SHOP), bet and unbet (BETTING).
-- Prices mirror PRICES in src/sim/config.ts (tests/db/shop.test.ts checks them).

-- Locks the room (so a phase change can't interleave) and then the caller's own player row
-- (serializing their coin spending). Bumps room activity, which also pings Realtime clients.
create function private.lock_my_player(p_room uuid, p_phase text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase text;
  v_player public.room_players;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  select phase into v_phase from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  select * into v_player from public.room_players where room_id = p_room and uid = auth.uid() for update;
  if not found then
    raise exception 'not_in_room';
  end if;
  if v_phase <> p_phase then
    raise exception 'wrong_phase';
  end if;
  update public.rooms set last_activity_at = now() where id = p_room;
  return v_player;
end;
$$;
revoke execute on function private.lock_my_player(uuid, text) from public;

create function public.buy_box(p_room uuid, p_box text)
returns public.purchases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_my_player(p_room, 'SHOP');
  v_race uuid := (select race_id from public.rooms where id = p_room);
  v_price integer := case p_box when 'speed' then 60 when 'defense' then 35 when 'attack' then 20 end;
  v_purchase public.purchases;
begin
  if v_price is null then
    raise exception 'bad_box';
  end if;
  if not v_player.ticked then
    raise exception 'not_racing';
  end if;
  if (select count(*) from public.purchases where race_id = v_race and player_id = v_player.id) >= 3 then
    raise exception 'max_boxes';
  end if;
  if private.balance(v_race, v_player.id) < v_price then
    raise exception 'not_enough_coins';
  end if;
  insert into public.purchases (race_id, room_id, player_id, box, price)
  values (v_race, p_room, v_player.id, p_box, v_price)
  returning * into v_purchase;
  insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
  values (v_race, p_room, v_player.id, 'purchase', -v_price);
  return v_purchase;
end;
$$;
revoke execute on function public.buy_box(uuid, text) from public, anon;
grant execute on function public.buy_box(uuid, text) to authenticated;

create function public.place_bet(p_room uuid, p_horse uuid, p_kind text, p_stake integer)
returns public.bets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_my_player(p_room, 'BETTING');
  v_race public.races;
  v_bet public.bets;
begin
  select r.* into v_race from public.races r join public.rooms m on m.race_id = r.id where m.id = p_room;
  if p_kind is null or p_kind not in ('win', 'place') then
    raise exception 'bad_bet';
  end if;
  if p_horse is null or not (p_horse = any (v_race.horses)) then
    raise exception 'not_in_race';
  end if;
  if p_stake is null or p_stake < 1 then
    raise exception 'bad_stake';
  end if;
  if private.balance(v_race.id, v_player.id) < p_stake then
    raise exception 'not_enough_coins';
  end if;
  if (select count(*) from public.bets where race_id = v_race.id and player_id = v_player.id) >= 50 then
    raise exception 'too_many_bets';
  end if;
  insert into public.bets (race_id, room_id, player_id, horse_id, kind, stake, odds)
  values (v_race.id, p_room, v_player.id, p_horse, p_kind, p_stake,
          (v_race.odds -> p_horse::text ->> p_kind)::numeric)
  returning * into v_bet;
  insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
  values (v_race.id, p_room, v_player.id, 'bet', -p_stake);
  return v_bet;
end;
$$;
revoke execute on function public.place_bet(uuid, uuid, text, integer) from public, anon;
grant execute on function public.place_bet(uuid, uuid, text, integer) to authenticated;

create function public.cancel_bet(p_bet uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_player public.room_players;
  v_bet public.bets;
begin
  select room_id into v_room_id from public.bets where id = p_bet;
  if not found then
    raise exception 'bet_not_found';
  end if;
  v_player := private.lock_my_player(v_room_id, 'BETTING');
  -- Recheck under the lock: own bet, current race, not yet settled.
  select b.* into v_bet from public.bets b join public.rooms m on m.race_id = b.race_id
    where b.id = p_bet and b.player_id = v_player.id and m.id = v_room_id and b.payout is null;
  if not found then
    raise exception 'bet_not_found';
  end if;
  delete from public.bets where id = p_bet;
  insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
  values (v_bet.race_id, v_room_id, v_player.id, 'unbet', v_bet.stake);
end;
$$;
revoke execute on function public.cancel_bet(uuid) from public, anon;
grant execute on function public.cancel_bet(uuid) to authenticated;
```

Note: in `cancel_bet` after Start, the phase check in `lock_my_player` raises `wrong_phase` before the ownership recheck. The test above expects exactly that.

- [ ] **Step 4: Apply and test.** `npx supabase migration up && npm run test:db` should leave all DB tests PASSING.

- [ ] **Step 5: Commit.** `git add supabase/migrations/20261030000007_shop_bets.sql tests/db/shop.test.ts && git commit -m "feat(db): buy boxes, place and cancel bets via the ledger"`

---

### Task 6: Edge Functions `lock-odds` and `start-race`

**Files:**
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/lock-odds/index.ts`
- Create: `supabase/functions/start-race/index.ts`
- Modify: `supabase/config.toml` (append)
- Modify: `tests/db/helpers.ts` (append `invoke`, `failsInvoke`)
- Test: `tests/db/functions.test.ts`

- [ ] **Step 1: Add the test helpers.** Append to `tests/db/helpers.ts`, and add `FunctionsHttpError` to the existing `@supabase/supabase-js` import:

```ts
/** Calls an Edge Function; returns its JSON or throws its `{ error }` code (same contract as RPCs). */
export async function invoke<T = unknown>(client: SupabaseClient, name: string, body: unknown): Promise<T> {
  const { data, error } = await client.functions.invoke(name, { body });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError) {
    const payload = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (payload?.error) throw new Error(payload.error);
  }
  throw error;
}

export async function failsInvoke(client: SupabaseClient, name: string, body: unknown): Promise<string> {
  try {
    await invoke(client, name, body);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error('expected the call to fail');
}
```

- [ ] **Step 2: Write the failing test** — `tests/db/functions.test.ts`. The first call boots the function worker and downloads `supabase-js`, hence the 60 s timeouts.

```ts
import { describe, expect, it } from 'vitest';
import { ODDS } from '../../src/sim/odds.ts';
import { anonClient, failsInvoke, guestClient, invoke, ok } from './helpers.ts';
import { balance, shopRoom } from './raceFixtures.ts';

type Bet = { horse_id: string; kind: string; stake: number; odds: number; payout: number };

describe('lock-odds and start-race', () => {
  it('runs a whole race: odds, bets, exactly one Start, payouts', { timeout: 60_000 }, async () => {
    const r = await shopRoom();
    await ok(r.ali.client.rpc('buy_box', { p_room: r.room.id, p_box: 'speed' }));

    const { sims } = await invoke<{ sims: number }>(r.host, 'lock-odds', { room: r.room.id });
    expect(sims).toBeGreaterThanOrEqual(ODDS.minSims);
    const race = await ok(r.host.from('races').select('*').eq('id', r.raceId).single());
    expect(race.horses).toEqual([r.ali.player.id, r.bea.player.id, r.siti.id]);
    for (const id of race.horses) {
      const line = race.odds[id];
      expect(line.win).toBeGreaterThanOrEqual(ODDS.win.min);
      expect(line.win).toBeLessThanOrEqual(ODDS.win.max);
      expect(line.place).toBe(ODDS.place.min); // everyone places in a 3-horse race
    }

    const bet = (horse: string, kind: string, stake: number) =>
      ok(r.cal.client.rpc('place_bet', { p_room: r.room.id, p_horse: horse, p_kind: kind, p_stake: stake }));
    await bet(r.siti.id, 'win', 40);
    await bet(r.ali.player.id, 'place', 60);

    const results = await Promise.allSettled([
      invoke(r.host, 'start-race', { room: r.room.id }),
      invoke(r.host, 'start-race', { room: r.room.id }),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as Error).message).toBe('wrong_phase');

    const done = await ok(r.host.from('races').select('*').eq('id', r.raceId).single());
    expect([...done.finish_order].sort()).toEqual([...race.horses].sort());
    const bets = (await ok(r.cal.client.from('bets').select('*').eq('race_id', r.raceId))) as Bet[];
    for (const b of bets) {
      const won =
        b.kind === 'win'
          ? done.finish_order[0] === b.horse_id
          : done.finish_order.slice(0, 3).includes(b.horse_id);
      expect(b.payout).toBe(won ? Math.round(b.stake * b.odds) : 0);
    }
    const paid = bets.reduce((sum, b) => sum + b.payout, 0);
    expect(await balance(r.cal.client, r.raceId, r.cal.player.id)).toBe(100 - 40 - 60 + paid);

    const [stored] = await ok(r.cal.client.from('race_timelines').select('timeline').eq('race_id', r.raceId));
    expect(stored.timeline.finishOrder).toEqual(done.finish_order);
    expect(stored.timeline.progressDm[r.ali.player.id].length).toBeGreaterThan(100);
  });

  it('refuses non-hosts, signed-out callers and wrong phases', { timeout: 60_000 }, async () => {
    const r = await shopRoom();
    expect(await failsInvoke(r.ali.client, 'lock-odds', { room: r.room.id })).toBe('not_host');
    expect(await failsInvoke(guestClient(), 'lock-odds', { room: r.room.id })).toMatch(/permission denied/);
    expect(await failsInvoke(r.host, 'start-race', { room: r.room.id })).toBe('wrong_phase');

    const other = await anonClient();
    const lobby = await ok(other.rpc('create_room', {}));
    expect(await failsInvoke(other, 'lock-odds', { room: lobby.id })).toBe('wrong_phase');
  });
});
```

- [ ] **Step 3: Run it.** `npm run test:db -- tests/db/functions.test.ts` should FAIL with a 404 / function-not-found error.

- [ ] **Step 4: Shared helpers** — `supabase/functions/_shared/http.ts`:

```ts
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { BoxType, RaceLength } from '../../../src/sim/types.ts';

/** What lock_odds_begin / start_race_begin return (private.race_input in SQL). */
export interface RaceInputRow {
  race_id: string;
  length: RaceLength;
  horses: string[];
  bought: Record<string, BoxType[]>;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Serves a host action. `user` carries the caller's token (RLS and host checks apply);
 * `admin` is service-role for the *_finish RPCs. Errors go back as 400 `{ error: code }`.
 */
export function serve(
  handler: (body: { room?: string }, user: SupabaseClient, admin: SupabaseClient) => Promise<unknown>,
) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const url = Deno.env.get('SUPABASE_URL')!;
    const auth = { persistSession: false, autoRefreshToken: false };
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth,
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth });
    try {
      const body = await req.json().catch(() => ({}));
      return Response.json((await handler(body, user, admin)) ?? {}, { headers: CORS });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return Response.json({ error }, { status: 400, headers: CORS });
    }
  });
}

export async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
```

- [ ] **Step 5: `lock-odds`** — `supabase/functions/lock-odds/index.ts`:

```ts
import { simulateOdds } from '../../../src/sim/odds.ts';
import { createCryptoRng } from '../../../src/sim/rng.ts';
import { rpc, serve, type RaceInputRow } from '../_shared/http.ts';

// SHOP -> ODDS_LOCKED (begin, as the host) -> odds from simulations -> BETTING (finish, service role).
serve(async ({ room }, user, admin) => {
  const input = await rpc<RaceInputRow>(user, 'lock_odds_begin', { p_room: room });
  const { odds, sims } = simulateOdds(input, createCryptoRng());
  await rpc(admin, 'lock_odds_finish', { p_race: input.race_id, p_odds: odds });
  return { sims };
});
```

- [ ] **Step 6: `start-race`** — `supabase/functions/start-race/index.ts`:

```ts
import { packTimeline } from '../../../src/sim/pack.ts';
import { createCryptoRng } from '../../../src/sim/rng.ts';
import { simulateRace } from '../../../src/sim/simulate.ts';
import { rpc, serve, type RaceInputRow } from '../_shared/http.ts';

// BETTING -> crypto seed -> one simulation -> results, payouts and RUNNING in one transaction.
serve(async ({ room }, user, admin) => {
  const input = await rpc<RaceInputRow>(user, 'start_race_begin', { p_room: room });
  const seed = createCryptoRng().nextInt(2 ** 32);
  const timeline = simulateRace({ seed, horses: input.horses, bought: input.bought, length: input.length });
  await rpc(admin, 'start_race_finish', {
    p_race: input.race_id,
    p_timeline: packTimeline(timeline),
    p_finish: timeline.finishOrder,
    p_seconds: Math.max(...Object.values(timeline.finishTimes)),
  });
  return { race: input.race_id };
});
```

- [ ] **Step 7: Config.** Append to `supabase/config.toml`:

```toml
# The functions prove the caller is the host by calling *_begin RPCs with the caller's own token.
[functions.lock-odds]
verify_jwt = false

[functions.start-race]
verify_jwt = false
```

Restart the stack so the edge runtime picks up the config: `npx supabase stop && npx supabase start`.

- [ ] **Step 8: Run it.** `npm run test:db` should PASS (all files).
  - If the guest call returns a different message than `permission denied`, look at what came back. Anything other than success is acceptable for that assertion. Loosen it to `.not.toBe('')` only if the message is a gateway error. Keep the `not_host` and `wrong_phase` assertions exact.

- [ ] **Step 9: Lint check.** Run `npm run lint`. If oxlint flags `Deno` as undefined in `supabase/functions`, add `"ignorePatterns": ["supabase/functions"]` to the oxlint config instead of sprinkling disables. Deno code isn't part of the Vite/tsc project.

- [ ] **Step 10: Commit.** `git add supabase/functions supabase/config.toml tests/db/helpers.ts tests/db/functions.test.ts && git commit -m "feat(functions): lock-odds and start-race Edge Functions running src/sim"` (also add the lint config if it changed).

---

### Task 7: Client library

**Files:**
- Modify: `src/net/database.types.ts` (regenerate)
- Modify: `src/net/rooms.ts`
- Create: `src/betting/betting.ts`
- Test: `src/betting/betting.test.ts`
- Create: `src/betting/useSecondsLeft.ts`

- [ ] **Step 1: Regenerate types** (Git Bash): `npx supabase gen types typescript --local > src/net/database.types.ts && npx prettier --write src/net/database.types.ts`. The diff should add `races`, `race_timelines`, `purchases`, `bets`, `coin_ledger`, `rooms.race_id` and the new functions.

- [ ] **Step 2: Write the failing test** — `src/betting/betting.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { balanceOf, boxesOf, formatOdds, nameOf, oddsOf, ordinal, potOf } from './betting.ts';

describe('betting helpers', () => {
  it('sums one player’s ledger rows', () => {
    const ledger = [
      { player_id: 'a', amount: 100 },
      { player_id: 'b', amount: 100 },
      { player_id: 'a', amount: -60 },
    ];
    expect(balanceOf(ledger, 'a')).toBe(40);
    expect(balanceOf(ledger, 'z')).toBe(0);
  });

  it('lists a player’s boxes and the pot', () => {
    const purchases = [
      { player_id: 'a', box: 'speed' },
      { player_id: 'b', box: 'attack' },
      { player_id: 'a', box: 'defense' },
    ];
    expect(boxesOf(purchases, 'a')).toEqual(['speed', 'defense']);
    expect(potOf([{ stake: 10 }, { stake: 25 }])).toBe(35);
  });

  it('reads odds, names, and formats them', () => {
    expect(oddsOf(null)).toEqual({});
    expect(oddsOf({ odds: { a: { win: 2, place: 1.2 } } })).toEqual({ a: { win: 2, place: 1.2 } });
    expect(nameOf([{ id: 'a', name: 'Ali' }], 'a')).toBe('Ali');
    expect(nameOf([], 'x')).toBe('?');
    expect(formatOdds(1.05)).toBe('1.05×');
    expect(formatOdds(1.6)).toBe('1.6×');
    expect(formatOdds(undefined)).toBe('–');
  });

  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
  ])('ordinal(%i) = %s', (n, s) => {
    expect(ordinal(n)).toBe(s);
  });
});
```

- [ ] **Step 3: Run it.** `npx vitest run src/betting/betting.test.ts` should FAIL because the module is missing.

- [ ] **Step 4: Implement** — `src/betting/betting.ts`:

```ts
import type { Json } from '../net/database.types.ts';
import type { OddsLine } from '../sim/odds.ts';
import type { BoxType } from '../sim/types.ts';

export const BOX_TYPES = ['speed', 'defense', 'attack'] as const satisfies readonly BoxType[];
export const BOX_ICON: Record<BoxType, string> = { speed: '⚡', defense: '🛡️', attack: '💥' };
export const BOX_NAME: Record<BoxType, string> = { speed: 'Speed', defense: 'Defense', attack: 'Attack' };

type Owned = { player_id: string };

export const balanceOf = (ledger: readonly (Owned & { amount: number })[], playerId: string) =>
  ledger.reduce((sum, row) => (row.player_id === playerId ? sum + row.amount : sum), 0);

export const boxesOf = (purchases: readonly (Owned & { box: string })[], playerId: string) =>
  purchases.filter((p) => p.player_id === playerId).map((p) => p.box as BoxType);

export const potOf = (bets: readonly { stake: number }[]) => bets.reduce((sum, b) => sum + b.stake, 0);

/** races.odds is jsonb written by lock-odds: { [player id]: OddsLine }. */
export const oddsOf = (race: { odds: Json | null } | null) =>
  (race?.odds ?? {}) as Record<string, OddsLine | undefined>;

export const nameOf = (players: readonly { id: string; name: string }[], id: string | undefined) =>
  players.find((p) => p.id === id)?.name ?? '?';

export const formatOdds = (odds: number | undefined) =>
  odds === undefined ? '–' : `${Number(odds.toFixed(2))}×`;

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' }) as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}
```

- [ ] **Step 5: Countdown hook** — `src/betting/useSecondsLeft.ts`:

```ts
import { useEffect, useState } from 'react';

/** Whole seconds until `endsAt` (ISO), ticking twice a second; 0 once passed or when null. */
export function useSecondsLeft(endsAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  return endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000)) : 0;
}
```

- [ ] **Step 6: Extend `src/net/rooms.ts`.**

Replace the import and type block at the top (everything before `type Res<T>`) with:

```ts
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { BoxType, RaceLength } from '../sim/types.ts';
import type { Database } from './database.types.ts';
import { supabase } from './supabase.ts';

type Tables = Database['public']['Tables'];
export type Room = Tables['rooms']['Row'];
export type RoomPlayer = Tables['room_players']['Row'];
export type Race = Tables['races']['Row'];
export type Purchase = Tables['purchases']['Row'];
export type Bet = Tables['bets']['Row'];
export type LedgerRow = Tables['coin_ledger']['Row'];
export type BetKind = 'win' | 'place';
export type RoomState = {
  room: Room;
  players: RoomPlayer[];
  /** The current race (SHOP..PODIUM) and its rows; null / empty in the LOBBY. */
  race: Race | null;
  purchases: Purchase[];
  bets: Bet[];
  ledger: LedgerRow[];
};
```

After `setReady`, add:

```ts
export const buyBox = (roomId: string, box: BoxType) =>
  call(supabase.rpc('buy_box', { p_room: roomId, p_box: box }));
export const placeBet = (roomId: string, horseId: string, kind: BetKind, stake: number) =>
  call(supabase.rpc('place_bet', { p_room: roomId, p_horse: horseId, p_kind: kind, p_stake: stake }));
export const cancelBet = (betId: string) => call(supabase.rpc('cancel_bet', { p_bet: betId }));
export const finishRace = (roomId: string) => call(supabase.rpc('finish_race', { p_room: roomId }));

/** Edge Functions answer errors as 400 `{ error: code }`, the same codes RPCs raise. */
async function invoke(name: 'lock-odds' | 'start-race', roomId: string): Promise<void> {
  const { error } = await supabase.functions.invoke(name, { body: { room: roomId } });
  if (!error) return;
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (body?.error) throw new Error(body.error);
  }
  throw new Error(error.message);
}
export const lockOdds = (roomId: string) => invoke('lock-odds', roomId);
export const startRace = (roomId: string) => invoke('start-race', roomId);
```

Replace `fetchRoom` with:

```ts
/** Null when the room doesn't exist or this device isn't in it (RLS hides it). */
export async function fetchRoom(code: string): Promise<RoomState | null> {
  const room = await call(supabase.from('rooms').select('*').eq('code', code).maybeSingle());
  if (!room) return null;
  const raceId = room.race_id;
  const [players, race, purchases, bets, ledger] = await Promise.all([
    call(supabase.from('room_players').select('*').eq('room_id', room.id).order('joined_at')),
    raceId ? call(supabase.from('races').select('*').eq('id', raceId).maybeSingle()) : null,
    raceId ? call(supabase.from('purchases').select('*').eq('race_id', raceId).order('created_at')) : [],
    raceId ? call(supabase.from('bets').select('*').eq('race_id', raceId).order('created_at')) : [],
    raceId ? call(supabase.from('coin_ledger').select('*').eq('race_id', raceId).order('id')) : [],
  ]);
  return {
    room,
    players: players ?? [],
    race,
    purchases: purchases ?? [],
    bets: bets ?? [],
    ledger: ledger ?? [],
  };
}
```

Add these entries to `ERROR_TEXT`:

```ts
  not_racing: 'Only horses in this race can buy boxes.',
  max_boxes: 'A horse can carry at most 3 bought boxes.',
  not_enough_coins: 'Not enough coins.',
  bad_box: 'Unknown box type.',
  bad_bet: 'Pick Win or Place.',
  bad_stake: 'Stake must be at least 1 coin.',
  not_in_race: "That horse isn't in this race.",
  bet_not_found: 'That bet is gone.',
  too_many_bets: 'That’s enough bets for one race.',
  race_not_finished: 'The race is still running.',
  race_not_found: 'That race no longer exists.',
  bad_odds: 'Odds calculation failed. Try again.',
  bad_result: 'Race calculation failed. Try again.',
```

- [ ] **Step 7: Verify.** `npm test` should PASS, and `npm run typecheck` should be clean. `useRoom` needs no change: every new RPC updates the `rooms` row, which already triggers a refetch.

- [ ] **Step 8: Commit.** `git add src/net src/betting && git commit -m "feat(net): race state, shop/bet wrappers and betting helpers"`

---

### Task 8: Big screen boards

**Files:**
- Modify: `src/track/TrackPage.tsx`
- Modify: `src/app/app.css`

- [ ] **Step 1: Header and `TrackPage`.** In `src/track/TrackPage.tsx`, replace everything from the first line down to (not including) `function LobbyBoard` with:

```tsx
import { useEffect, useRef, useState, type ComponentType, type FormEvent } from 'react';
import { BOX_ICON, BOX_NAME, BOX_TYPES, boxesOf, formatOdds, nameOf, oddsOf, potOf } from '../betting/betting.ts';
import { useSecondsLeft } from '../betting/useSecondsLeft.ts';
import { canOpenShop, joinUrl } from '../lobby/lobby.ts';
import {
  addPlayer,
  errorText,
  finishRace,
  lockOdds,
  removePlayer,
  setPhase,
  setTicked,
  setPrize as savePrizeRpc,
  setRaceLength,
  startRace,
  type RoomPlayer,
  type RoomState,
} from '../net/rooms.ts';
import { useRoom } from '../net/useRoom.ts';
import { MAX_HORSES, PRICES } from '../sim/config.ts';
import type { RaceLength } from '../sim/types.ts';
import { JoinQr } from './JoinQr.tsx';

type Act = (fn: () => Promise<unknown>) => void;
type BoardProps = RoomState & { online: ReadonlySet<string>; act: Act; busy: boolean };

const LENGTH_LABEL: Record<RaceLength, string> = { short: 'Short (~2 min)', long: 'Long (~3 min)' };

/** Big screen for the host device. */
export function TrackPage() {
  const code = new URLSearchParams(window.location.search).get('code') ?? '';
  const { state, online, error, refresh } = useRoom(code);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) {
    return (
      <main className="track">
        <p role="alert">{error}</p>
        <a href="/">Home</a>
      </main>
    );
  }
  if (!state) return <main className="track">Loading…</main>;

  const act: Act = (fn) => {
    setActionError(null);
    setBusy(true);
    fn()
      .then(refresh, (e: unknown) => setActionError(errorText(e)))
      .finally(() => setBusy(false));
  };
  const Board = BOARDS[state.room.phase];

  return (
    <main className="track">
      {Board ? <Board {...state} online={online} act={act} busy={busy} /> : <p>Phase: {state.room.phase}</p>}
      {actionError && <p role="alert">{actionError}</p>}
    </main>
  );
}

```

- [ ] **Step 2: Keep `LobbyBoard` exactly as it is.** Its signature `function LobbyBoard({ room, players, online, act }: BoardProps)` still type-checks against the wider `BoardProps`.

- [ ] **Step 3: Replace the old `ShopBoard`.** Replace everything after `LobbyBoard` (the old `ShopBoard` function) with:

```tsx
const boxIcons = (purchases: RoomState['purchases'], playerId: string) =>
  boxesOf(purchases, playerId)
    .map((b) => BOX_ICON[b])
    .join(' ');

function ReadyLine({ players }: { players: RoomPlayer[] }) {
  const phones = players.filter((p) => p.uid);
  return (
    <p>
      Ready: {phones.filter((p) => p.ready).length}/{phones.length}
    </p>
  );
}

function ShopBoard({ room, players, purchases, online, act, busy }: BoardProps) {
  return (
    <section>
      <h1>Shop open · room {room.code}</h1>
      <p>
        Phones: up to 3 boxes for your own lane —{' '}
        {BOX_TYPES.map((b) => `${BOX_ICON[b]} ${BOX_NAME[b]} ${PRICES[b]}`).join(' · ')}
      </p>
      <ReadyLine players={players} />
      <ul className="roster">
        {players
          .filter((p) => p.ticked)
          .map((p) => (
            <li key={p.id}>
              🐎 {p.name} {boxIcons(purchases, p.id)}
              {p.uid && !online.has(p.id) && ' (offline)'}
            </li>
          ))}
      </ul>
      <p>
        <button type="button" disabled={busy} onClick={() => act(() => setPhase(room.id, 'LOBBY'))}>
          Back to lobby (cancels purchases)
        </button>{' '}
        <button type="button" className="primary" disabled={busy} onClick={() => act(() => lockOdds(room.id))}>
          Lock odds
        </button>
      </p>
    </section>
  );
}

function OddsLockedBoard({ room, act, busy }: BoardProps) {
  return (
    <section>
      <h1>Calculating odds…</h1>
      <p>The shop is closed.</p>
      {/* Only needed if a calculation failed; lock-odds treats ODDS_LOCKED as a retry. */}
      <button type="button" disabled={busy} onClick={() => act(() => lockOdds(room.id))}>
        Retry
      </button>
    </section>
  );
}

function BettingBoard({ room, players, race, purchases, bets, act, busy }: BoardProps) {
  const odds = oddsOf(race);
  return (
    <section>
      <h1>Place your bets · room {room.code}</h1>
      <table className="odds">
        <thead>
          <tr>
            <th>Horse</th>
            <th>Boxes</th>
            <th>Win</th>
            <th>Place</th>
          </tr>
        </thead>
        <tbody>
          {(race?.horses ?? []).map((id) => (
            <tr key={id}>
              <td>{nameOf(players, id)}</td>
              <td>{boxIcons(purchases, id)}</td>
              <td>{formatOdds(odds[id]?.win)}</td>
              <td>{formatOdds(odds[id]?.place)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Bought boxes change a horse's chances. Pot: {potOf(bets)} coins in {bets.length} bets.
      </p>
      <ReadyLine players={players} />
      <button type="button" className="primary" disabled={busy} onClick={() => act(() => startRace(room.id))}>
        Start race
      </button>
    </section>
  );
}

function RunningBoard({ room, race, act }: BoardProps) {
  const left = useSecondsLeft(race?.ends_at ?? null);
  const asked = useRef(false);
  useEffect(() => {
    if (left > 0 || asked.current) return;
    asked.current = true;
    act(() => finishRace(room.id));
  }, [left, act, room.id]);
  return (
    <section>
      <h1>And they're off! 🏇</h1>
      <p>Race playback arrives in the next update. Results in {left} s.</p>
      {left === 0 && (
        <button type="button" onClick={() => act(() => finishRace(room.id))}>
          Show results
        </button>
      )}
    </section>
  );
}

function PodiumBoard({ room, players, race, bets, act, busy }: BoardProps) {
  const top3 = (race?.finish_order ?? []).slice(0, 3);
  const winners = bets
    .filter((b) => (b.payout ?? 0) > 0)
    .sort((a, b) => (b.payout ?? 0) - (a.payout ?? 0));
  return (
    <section>
      <h1>Results</h1>
      <ol className="podium">
        {top3.map((id) => (
          <li key={id}>{nameOf(players, id)}</li>
        ))}
      </ol>
      {race?.prize && (
        <p>
          🏆 {nameOf(players, top3[0])}: {race.prize}
        </p>
      )}
      <h2>Payouts</h2>
      {winners.length === 0 ? (
        <p>No winning bets.</p>
      ) : (
        <ul>
          {winners.map((b) => (
            <li key={b.id}>
              {nameOf(players, b.player_id)} won {b.payout} on {nameOf(players, b.horse_id)} ({b.kind})
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="primary" disabled={busy} onClick={() => act(() => setPhase(room.id, 'LOBBY'))}>
        Next race
      </button>
    </section>
  );
}

const BOARDS: Record<string, ComponentType<BoardProps> | undefined> = {
  LOBBY: LobbyBoard,
  SHOP: ShopBoard,
  ODDS_LOCKED: OddsLockedBoard,
  BETTING: BettingBoard,
  RUNNING: RunningBoard,
  PODIUM: PodiumBoard,
};
```

- [ ] **Step 4: Styles.** Append to `src/app/app.css`:

```css
.odds {
  border-collapse: collapse;
  margin: 8px 0;
}
.odds th,
.odds td {
  padding: 4px 16px;
  text-align: left;
}
.odds tbody tr:nth-child(odd) {
  background: color-mix(in srgb, currentColor 6%, transparent);
}
.shop {
  display: grid;
  gap: 8px;
}
.podium {
  font-size: 2rem;
}
```

- [ ] **Step 5: Verify.** `npm run typecheck && npm run lint && npm test` should be clean.

- [ ] **Step 6: Commit.** `git add src/track/TrackPage.tsx src/app/app.css && git commit -m "feat(track): shop, odds, betting, running and podium boards"`

---

### Task 9: Phone panels

**Files:**
- Modify: `src/play/PlayPage.tsx` (`PlayPage` stays; replace `PlayRoom`, add panels)

- [ ] **Step 1: Update the imports.** Replace the import block at the top of `src/play/PlayPage.tsx` with:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import {
  BOX_ICON,
  BOX_NAME,
  BOX_TYPES,
  balanceOf,
  boxesOf,
  formatOdds,
  nameOf,
  oddsOf,
  ordinal,
} from '../betting/betting.ts';
import { useSecondsLeft } from '../betting/useSecondsLeft.ts';
import { normalizeCode } from '../lobby/lobby.ts';
import {
  buyBox,
  cancelBet,
  errorText,
  joinRoom,
  placeBet,
  setReady,
  type BetKind,
  type RoomPlayer,
  type RoomState,
} from '../net/rooms.ts';
import { ensureSignedIn } from '../net/supabase.ts';
import { useRoom } from '../net/useRoom.ts';
import { MAX_BOUGHT, PRICES } from '../sim/config.ts';
```

- [ ] **Step 2: Replace `function PlayRoom`** (to the end of the file) with:

```tsx
type Act = (fn: () => Promise<unknown>) => void;
type PanelProps = RoomState & { mine: RoomPlayer; balance: number; act: Act };

function PlayRoom({ code, me }: { code: string; me: RoomPlayer }) {
  const { state, error, refresh } = useRoom(code, me.id);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) {
    return (
      <main className="play">
        <p role="alert">{error}</p>
        <a href="/">Home</a>
      </main>
    );
  }
  if (!state) return <main className="play">Loading…</main>;
  const { room } = state;
  const mine = state.players.find((p) => p.id === me.id);
  if (!mine) {
    return (
      <main className="play">
        <p>You were removed from this room.</p>
        <a href="/">Home</a>
      </main>
    );
  }

  const act: Act = (fn) => {
    setActionError(null);
    fn().then(refresh, (e: unknown) => setActionError(errorText(e)));
  };
  const props: PanelProps = { ...state, mine, balance: balanceOf(state.ledger, mine.id), act };

  return (
    <main className="play">
      <h1>{mine.name}</h1>
      <p>
        Room {room.code} · {room.race_length === 'long' ? 'Long (~3 min)' : 'Short (~2 min)'}
        {room.prize && ` · Prize: ${room.prize}`}
      </p>
      {room.phase === 'LOBBY' && (
        <p>{mine.ticked ? "You're racing today! 🐎" : 'Waiting for the host to tick you in.'}</p>
      )}
      {room.phase === 'SHOP' && <ShopPanel {...props} />}
      {room.phase === 'ODDS_LOCKED' && <p>The shop is closed. Calculating odds…</p>}
      {room.phase === 'BETTING' && <BetPanel {...props} />}
      {room.phase === 'RUNNING' && <RunningPanel endsAt={state.race?.ends_at ?? null} />}
      {room.phase === 'PODIUM' && <ResultPanel {...props} />}
      {(room.phase === 'SHOP' || room.phase === 'BETTING') && (
        <p>
          <button type="button" onClick={() => act(() => setReady(room.id, !mine.ready))}>
            {mine.ready ? 'Ready ✅ (tap to undo)' : "I'm ready"}
          </button>
        </p>
      )}
      {actionError && <p role="alert">{actionError}</p>}
    </main>
  );
}

function ShopPanel({ room, mine, purchases, balance, act }: PanelProps) {
  if (!mine.ticked) {
    return <p>💰 {balance} coins. You're not racing, but you can bet once the odds lock.</p>;
  }
  const boxes = boxesOf(purchases, mine.id);
  return (
    <>
      <p>
        💰 {balance} coins · your boxes: {boxes.length ? boxes.map((b) => BOX_ICON[b]).join(' ') : 'none'} (
        {boxes.length}/{MAX_BOUGHT})
      </p>
      <div className="shop">
        {BOX_TYPES.map((box) => (
          <button
            key={box}
            type="button"
            disabled={boxes.length >= MAX_BOUGHT || balance < PRICES[box]}
            onClick={() => act(() => buyBox(room.id, box))}
          >
            {BOX_ICON[box]} {BOX_NAME[box]} · {PRICES[box]}
          </button>
        ))}
      </div>
      <p>Boxes go in your own lane and open automatically. No refunds.</p>
    </>
  );
}

function BetPanel({ room, players, race, bets, mine, balance, act }: PanelProps) {
  const odds = oddsOf(race);
  const horses = race?.horses ?? [];
  const [horse, setHorse] = useState(horses[0] ?? '');
  const [kind, setKind] = useState<BetKind>('win');
  const [stake, setStake] = useState('10');
  const amount = Number(stake);
  const myBets = bets.filter((b) => b.player_id === mine.id);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    act(() => placeBet(room.id, horse, kind, amount));
  };

  return (
    <>
      <p>💰 {balance} coins</p>
      <form className="shop" onSubmit={submit}>
        <label>
          Horse{' '}
          <select value={horse} onChange={(e) => setHorse(e.target.value)}>
            {horses.map((id) => (
              <option key={id} value={id}>
                {nameOf(players, id)} — Win {formatOdds(odds[id]?.win)} · Place {formatOdds(odds[id]?.place)}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Bet</legend>
          <label>
            <input type="radio" name="kind" checked={kind === 'win'} onChange={() => setKind('win')} /> Win
            (1st)
          </label>{' '}
          <label>
            <input type="radio" name="kind" checked={kind === 'place'} onChange={() => setKind('place')} />{' '}
            Place (top 3)
          </label>
        </fieldset>
        <label>
          Stake{' '}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={balance}
            step={1}
            value={stake}
            onChange={(e) => setStake(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="primary"
          disabled={!horse || !Number.isInteger(amount) || amount < 1 || amount > balance}
        >
          Bet
        </button>
      </form>
      <h2>Your bets</h2>
      {myBets.length === 0 ? (
        <p>None yet. You can cancel bets until the race starts.</p>
      ) : (
        <ul>
          {myBets.map((b) => (
            <li key={b.id}>
              {b.stake} on {nameOf(players, b.horse_id)} to {b.kind} @ {formatOdds(b.odds)}{' '}
              <button type="button" aria-label="Cancel bet" onClick={() => act(() => cancelBet(b.id))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RunningPanel({ endsAt }: { endsAt: string | null }) {
  const left = useSecondsLeft(endsAt);
  return <p>🏇 The race is on! Results in {left} s.</p>;
}

function ResultPanel({ players, race, bets, mine, balance }: PanelProps) {
  const place = (race?.finish_order ?? []).indexOf(mine.id);
  const myBets = bets.filter((b) => b.player_id === mine.id);
  return (
    <>
      {place >= 0 && <p>Your horse finished {ordinal(place + 1)}.</p>}
      {myBets.length > 0 && (
        <ul>
          {myBets.map((b) => (
            <li key={b.id}>
              {b.stake} on {nameOf(players, b.horse_id)} to {b.kind}:{' '}
              {b.payout ? `won ${b.payout}` : 'lost'}
            </li>
          ))}
        </ul>
      )}
      <p>💰 Final balance: {balance} coins</p>
    </>
  );
}
```

- [ ] **Step 3: Verify.** `npm run typecheck && npm run lint && npm test && npm run build` should be clean.

- [ ] **Step 4: Commit.** `git add src/play/PlayPage.tsx && git commit -m "feat(play): shop, bet slip, running and result panels"`

---

### Task 10: Multi-device smoke test + docs

- [ ] **Step 1: Smoke test** in the in-app browser.
  - **Setup:** use separate origins as separate devices (`localhost:5173`, `127.0.0.1:5173`, `a.localhost:5173`, `b.localhost:5173`). Run `npm run dev -- --host` with the stack running. Host on one origin; join Ali, Bea and Cal on the others; host types "Siti".
  - **Checks:**
    1. Tick Ali, Bea and Siti, then Open shop. Every phone shows 💰 100. Cal sees "not racing".
    2. Ali buys ⚡ then 💥 and sees 20 left; the Defense button is disabled. The big screen shows Ali's icons live.
    3. Back to lobby, then Open shop again: Ali is back to 100 with no boxes.
    4. Ali buys ⚡ again, then Lock odds. Screens show "Calculating odds…", then the odds board appears and phones show the bet slip. Ali's Win odds should be shortest or near it.
    5. Cal bets 30 Win on Siti and then cancels it (back to 100). Then Cal bets 40 Win and 60 Place. The pot updates on the big screen.
    6. Start race. Phones show the countdown and no balances. Double-click Start: one race, no error screen, at most a "That isn't possible right now." line.
    7. At 0 the big screen auto-shows Results: podium, prize line and payouts. Each phone shows its own placing, its bets won/lost and its final balance, and these match the payouts.
    8. Next race returns everyone to LOBBY. Open shop again gives a fresh 100.
  - **Afterwards:** check the console for errors.

- [ ] **Step 2: README.** In "Local development", add:
  - `supabase start` also serves the Edge Functions in `supabase/functions` (hot reload).
  - After editing `supabase/config.toml`, run `npx supabase stop && npx supabase start`.
  - Function logs: `docker logs -f supabase_edge_runtime_HorseRacingTurfClub`.

- [ ] **Step 3: Task 13 note.** In `docs/superpowers/plans/2026-10-30-phase2-private-rooms-lobby.md` Task 13, add a step: `npx supabase functions deploy lock-odds start-race`. Then a smoke test of Lock odds on the hosted project. If deploy can't bundle `../../../src/sim`, apply the fallback from this plan's scope decisions.

- [ ] **Step 4: PROJECT_STATUS.**
  - Add a "Phase 3 — Shop, odds, betting, ledger (branch `phase3-betting`)" checklist (Tasks 0–10).
  - Add a 2026-10-30 log entry with the checks and the decisions:
    - per-race Private coins
    - SHOP→LOBBY cancels the race
    - odds time budget (sims per field size)
    - seed at Start
    - packed timeline 2 Hz
    - rooms-row Realtime ping
  - Remove the Phase 2 deferred note about `set_ready`/activity bumping where it no longer applies. Player RPCs now bump activity; `set_ready` still doesn't.
  - Set "Next: Phase 4 (playback + podium)".

- [ ] **Step 5: Spec.** In §4 (after the Postgres Changes bullet) add: "Phase 3: coin/bet tables are not published; every mutating RPC updates the `rooms` row instead, so each action costs one Realtime event." In §7 add: "Simulation count is time-budgeted (≤500, ≥50, ~800 ms) to fit the Edge Function CPU limit."

- [ ] **Step 6: Final checks.** `npm test && npm run test:db && npm run typecheck && npm run lint && npm run build` should all be clean.

- [ ] **Step 7: Commit.** `git add README.md PROJECT_STATUS.md docs && git commit -m "docs: Phase 3 status, functions dev notes, spec notes"`
