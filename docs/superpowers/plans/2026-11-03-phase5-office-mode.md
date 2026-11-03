# Phase 5 — Office Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Office mode, which completes the MVP:
- One permanent Office room.
- Members sign in on their phone with their name and a 4-digit PIN.
- Coins carry over from race to race: +100 for each race raced, and nobody drops below 50.
- Odds blend in past results.
- Members customise their horse.
- `/admin`, behind one password, manages people, PINs, coins and races, and unlocks the Office big screen.

**Architecture:** Office mode reuses the Private room machinery instead of building a second one.

- **The Office is a `rooms` row** with `kind = 'office'` and the fixed code `TURF`.
  - Its `room_players` rows are the members. Removing a member archives the row (`archived_at`), so their history stays.
  - A member's phone is linked by setting `room_players.uid` at PIN login.
  - PIN hashes live in `private.office_pins`, a schema clients can't read.
- **Wallets:**
  - `coin_ledger.race_id` becomes nullable, for coins that belong to no race (the starting 100 and admin adjustments).
  - `private.balance` sums all of an office member's rows. For Private rooms it stays per race.
  - A new `room_balances` RPC gives clients every balance in one call. It replaces the per-race ledger fetch.
- **Host and admin:** the Office host is whoever unlocks the big screen with the admin password.
  - A new `admin` Edge Function checks the password (a server secret), then calls service-role-only `admin_*` RPCs.
  - Unlocking the big screen is one of those actions (`admin_claim_host`).
- **Odds:** `private.race_input` adds per-horse history for Office races, and `lock-odds` blends it in as `p = 0.7·p_sim + 0.3·p_hist` (spec §7).

**Tech Stack:** Supabase (Postgres + `pgcrypto`, Edge Functions on Deno), `@supabase/supabase-js` 2, React 19, TypeScript strict, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-horse-racing-turf-club-design.md` §2 (modes), §3 (customisation), §7 (odds with `p_hist`), §8 (economy), §10 (identity & admin), §12 phase 5.

---

## Scope decisions (read first)

- **Owner decisions (2026-11-03):**
  - The Office big screen needs the **admin password**.
  - **Odds history comes now.**
  - Customisation is **coat + silk colour + optional horse name**, with no silk patterns.
- **One office, built in.** A migration inserts it: `kind = 'office'`, code `TURF`, `host_uid = null`.
  - `cleanup_rooms` skips it.
  - A unique partial index allows only one office.
- **Host.** `rooms.host_uid` becomes nullable.
  - `private.lock_host_room` must use `is distinct from`. With the old `<>`, a null host would let **anyone** through. Task 2 fixes this and tests it.
  - Unlocking the big screen = `admin` function action `claim_host`, which calls `admin_claim_host(caller uid)`.
  - The previous host device loses access, because RLS no longer counts it as a member.
- **Members:**
  - Only `/admin` adds, renames, archives or resets a PIN. In the Office, `add_player` / `remove_player` raise `admin_only`.
  - Archived members don't appear in the roster, can't log in and can't be ticked. Their ledger, bets and races stay.
- **PIN login (spec §10):**
  - The phone picks a name from `office_roster()`, which returns only id, name and has_pin. It then calls `office_login(player, pin)`.
  - **First login sets the PIN.** Anyone could claim an unclaimed name first; the admin can reset the PIN. That is acceptable for fake coins. The UI warns not to reuse a real PIN.
  - **5 wrong PINs lock the name for 5 minutes.**
    - A wrong PIN must *persist* the fail count, so `office_login` returns **null** instead of raising. A raise would roll the count back.
    - `pin_locked` and the other errors still raise. The client maps null to `wrong_pin`.
  - **Login links this device to the member.** It clears any other member this device was signed in as, and replaces the member's previous phone. One phone per person, one person per phone.
  - `office_logout` unlinks the device ("Not you? Switch person").
  - `join_room` on the Office raises `office_room` after its rejoin probe, and the phone then shows the PIN login.
- **Economy (spec §8):**
  - A new member gets a 100-coin `topup` with `race_id = null`.
  - **LOBBY→SHOP:**
    - +100 `topup` for every **ticked** member, phone or not.
    - Then a `floor` row lifts every active member below 50 up to 50.
    - Both rows carry the race id, so SHOP→LOBBY, which deletes the race, undoes them.
  - **PODIUM→LOBBY** keeps the race, so the coins carry over.
  - New ledger types: `floor` and `admin_adjust`. `admin_adjust` needs a `reason`.
- **Odds (spec §7, Office only):**
  - `p_hist(win) = (wins + 5·(1/N)) / (races + 5)`.
  - `p_hist(place) = (top3 + 5·(min(3,N)/N)) / (races + 5)`.
  - Then `p = 0.7·p_sim + 0.3·p_hist`.
  - History counts the member's finished office races, excluding the current one. Private races pass no history.
- **Customisation:**
  - `room_players.coat` (0–5), `silk` (0–10) and `horse_name` (≤24 characters).
  - A null colour means the lane default, so Private horses are unchanged.
  - Members change these in the LOBBY only, through `set_my_horse`.
  - Horses are named by `horse_name` if set, else by the person; bettors are always named by the person.
- **Admin password:**
  - `ADMIN_PASSWORD` is an Edge Function secret.
  - Locally it lives in `supabase/functions/.env`, which `.gitignore` already covers.
  - Hosted, the owner runs `npx supabase secrets set ADMIN_PASSWORD=…` themselves. It never goes in chat.
  - A wrong password waits 1 s before answering, to slow guessing.
  - The `/admin` page keeps the password in `sessionStorage`, so it lasts only while the tab is open.
- **Not in this phase:**
  - Phase 6: leaderboards, horse records, last-5 form on the odds board, badges.
  - Later: cosmetics bought with coins.

## File structure

```
src/sim/odds.ts                      MOD  HorseHistory, HISTORY, blendHistory; simulateOdds(…, history?)
src/sim/odds.test.ts                 MOD
supabase/migrations/20261103000008_office.sql        NEW  kind, nullable host + lock_host_room fix, office room,
                                                          member columns, private.office_pins, ledger v2, balance v2,
                                                          room_balances, cleanup v2
supabase/migrations/20261103000009_office_login.sql  NEW  admin_add_member, admin_claim_host (first version),
                                                          office_roster, office_login, office_logout, join_room v3,
                                                          set_my_horse
supabase/migrations/20261103000010_office_race.sql   NEW  set_phase v3, add/remove/set_ticked v2, race_input v2
supabase/migrations/20261103000011_admin.sql         NEW  remaining admin_* RPCs (service role only)
supabase/functions/_shared/http.ts   MOD  generic body + caller token
supabase/functions/admin/index.ts    NEW  password check + actions
supabase/functions/lock-odds/index.ts MOD passes history
supabase/config.toml                 MOD  [functions.admin] verify_jwt = false
supabase/functions/.env              NEW (gitignored) ADMIN_PASSWORD for local dev
tests/db/officeFixtures.ts           NEW  officeRow(), officeRoom(), member(), balanceOf(), adminPassword()
tests/db/office.test.ts              NEW
tests/db/admin.test.ts               NEW
src/net/database.types.ts            REGEN
src/net/rooms.ts                     MOD  balances, office + admin wrappers, error texts
src/lobby/lobby.ts                   MOD  OFFICE_CODE
src/betting/betting.ts (+test)       MOD  horseName, horseNameOf; drop balanceOf
src/render/palette.ts (+test)        MOD  COAT_COLORS, SILK_COLORS, colorsFor, colorsByPlayer
src/render/Pixel2DRenderer.ts, RaceView.tsx, src/play/MiniOval.tsx   MOD  per-horse colours
src/play/OfficeLogin.tsx             NEW
src/play/HorsePanel.tsx              NEW
src/play/PlayPage.tsx                MOD
src/track/OfficeHostLogin.tsx        NEW
src/track/TrackPage.tsx              MOD
src/admin/AdminPage.tsx              NEW
src/app/App.tsx, src/app/Home.tsx, src/app/app.css   MOD
README.md, PROJECT_STATUS.md         MOD
```

---

### Task 0: Branch

- [ ] **Step 1:** Branch `phase5-office` already exists (cut from `master` at `dfda65f`). Confirm with `git branch --show-current`.
- [ ] **Step 2:** Add the checklist under Phase 4 in `PROJECT_STATUS.md`:

```markdown
## Phase 5 — Office mode (branch `phase5-office`)

- [x] Task 0: Branch
- [ ] Task 1: Odds blend with history (pure)
- [ ] Task 2: Office schema, wallets, host fix
- [ ] Task 3: PIN login and horse settings
- [ ] Task 4: Office race flow and history input
- [ ] Task 5: Admin RPCs
- [ ] Task 6: Edge Functions: admin, lock-odds history
- [ ] Task 7: Client library
- [ ] Task 8: Per-horse colours in the renderer
- [ ] Task 9: Phone: PIN login and horse panel
- [ ] Task 10: Big screen: office unlock and lobby
- [ ] Task 11: Home and /admin
- [ ] Task 12: Smoke test, docs, hosted deploy
```

- [ ] **Step 3:** `git add PROJECT_STATUS.md docs/superpowers/plans/2026-11-03-phase5-office-mode.md && git commit -m "docs: Phase 5 plan"`

---

### Task 1: Odds blend with history (pure)

**Files:** Modify `src/sim/odds.ts`, `src/sim/odds.test.ts`

- [ ] **Step 1: Failing tests.** Add `blendHistory` to the existing import from `./odds.ts`, then append to `src/sim/odds.test.ts`:

```ts
describe('blendHistory', () => {
  it('is 0.7·p_sim + 0.3·p_hist, with p_hist pulled toward the field share', () => {
    // No history: p_hist = (0 + 5·0.25) / 5 = 0.25
    expect(blendHistory(0.5, 0, 0, 0.25)).toBeCloseTo(0.7 * 0.5 + 0.3 * 0.25);
    // 10 wins in 10 races: p_hist = (10 + 1.25) / 15 = 0.75
    expect(blendHistory(0.5, 10, 10, 0.25)).toBeCloseTo(0.7 * 0.5 + 0.3 * 0.75);
  });
});

describe('simulateOdds with history', () => {
  it('shortens a habitual winner and lengthens a habitual loser, same simulations', () => {
    const race = { horses: ids(4), bought: {}, length: 'short' as const };
    const plain = simulateOdds(race, createSeededRng(7), frozenClock);
    const hist = {
      h0: { races: 20, wins: 20, top3: 20 },
      h1: { races: 20, wins: 0, top3: 0 },
    };
    const blended = simulateOdds(race, createSeededRng(7), frozenClock, hist);
    expect(blended.sims).toBe(plain.sims);
    expect(blended.odds.h0!.win).toBeLessThan(plain.odds.h0!.win);
    expect(blended.odds.h1!.win).toBeGreaterThan(plain.odds.h1!.win);
    // A horse with no history entry blends toward the field share (25%), not toward 0.
    expect(Math.abs(blended.odds.h2!.win - plain.odds.h2!.win)).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/sim/odds.test.ts`. Expected: FAIL, `blendHistory` is not exported.
- [ ] **Step 3: Implement.** In `src/sim/odds.ts`, add after `ODDS`:

```ts
/** Past Office results for one horse: finished races, wins and top-3 finishes. */
export interface HorseHistory {
  readonly races: number;
  readonly wins: number;
  readonly top3: number;
}

/** Spec §7 (Office): share of past results in p, and the prior's strength in races. */
export const HISTORY = { weight: 0.3, priorRaces: 5 } as const;
const EMPTY: HorseHistory = { races: 0, wins: 0, top3: 0 };

/** p = 0.7·p_sim + 0.3·p_hist, where p_hist = (hits + 5·fieldShare) / (races + 5). */
export function blendHistory(pSim: number, hits: number, races: number, fieldShare: number): number {
  const pHist = (hits + HISTORY.priorRaces * fieldShare) / (races + HISTORY.priorRaces);
  return (1 - HISTORY.weight) * pSim + HISTORY.weight * pHist;
}
```

Change `simulateOdds` to take the history and blend it in before pricing. Update its doc comment, signature and the final mapping:

```ts
/**
 * Win/Place odds from repeated runs of this exact field, bought boxes and length.
 * Each run has a fresh seed, so box spots vary between runs. Office races pass `history`
 * (spec §7): horses missing from it count as having no past races.
 */
export function simulateOdds(
  race: Omit<RaceInput, 'seed'>,
  rng: Rng,
  now: () => number = () => performance.now(),
  history?: Readonly<Record<HorseId, HorseHistory>>,
): { odds: Record<HorseId, OddsLine>; sims: number } {
```

and replace the `const odds = Object.fromEntries(...)` block with:

```ts
  const n = race.horses.length;
  const blend = (h: HorseId, p: number, hits: (s: HorseHistory) => number, share: number) => {
    if (!history) return p;
    const s = history[h] ?? EMPTY;
    return blendHistory(p, hits(s), s.races, share);
  };
  const odds = Object.fromEntries(
    race.horses.map((h) => [
      h,
      {
        win: priceOdds(blend(h, wins.get(h)! / sims, (s) => s.wins, 1 / n), ODDS.win),
        place: priceOdds(blend(h, top3.get(h)! / sims, (s) => s.top3, Math.min(3, n) / n), ODDS.place),
      },
    ]),
  );
```

- [ ] **Step 4:** `npx vitest run src/sim/odds.test.ts` passes; then `npm test`, `npm run typecheck`, `npm run lint` all pass.
- [ ] **Step 5:** `git add src/sim/odds.ts src/sim/odds.test.ts && git commit -m "feat(sim): blend past results into odds"`

---

### Task 2: Office schema, wallets, host fix

**Files:** Create `supabase/migrations/20261103000008_office.sql`, `tests/db/officeFixtures.ts`, `tests/db/office.test.ts`

Needs the local stack (`npx supabase start`). After writing the migration run `npx supabase db reset`.

- [ ] **Step 1: Fixtures.** Create `tests/db/officeFixtures.ts`. `officeRoom()` and `member()` use RPCs from Task 3; this task's tests only use `officeRow()`.

```ts
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient, ok } from './helpers.ts';

/** ADMIN_PASSWORD from supabase/functions/.env (the local Edge Function secret; Task 6). */
export function adminPassword(): string {
  const text = readFileSync(new URL('../../supabase/functions/.env', import.meta.url), 'utf8');
  const m = /^ADMIN_PASSWORD=(.+)$/m.exec(text);
  if (!m) throw new Error('Set ADMIN_PASSWORD in supabase/functions/.env');
  return m[1]!.trim();
}

/** The office room row (service role). */
export async function officeRow() {
  const [room] = await ok(adminClient().from('rooms').select('*').eq('kind', 'office'));
  return room as { id: string; code: string; phase: string; race_id: string | null; host_uid: string | null };
}

/**
 * The single office room, reset to LOBBY with nobody ticked, hosted by a fresh device.
 * Tests share it, so each test resets it first (DB tests run one file at a time).
 */
export async function officeRoom() {
  const admin = adminClient();
  const room = await officeRow();
  await ok(admin.from('rooms').update({ phase: 'LOBBY', race_id: null }).eq('id', room.id));
  await ok(admin.from('room_players').update({ ticked: false, ready: false }).eq('room_id', room.id));
  const host = await anonClient();
  const { data } = await host.auth.getUser();
  await ok(admin.rpc('admin_claim_host', { p_uid: data.user!.id }));
  return { admin, host, room };
}

let seq = 0;
/** A new member with a unique name; `pin` set, the returned phone signed in as them. */
export async function member(prefix = 'M', pin = '1234') {
  const name = `${prefix}${Date.now().toString(36).slice(-5)}${seq++}`;
  const player = await ok(adminClient().rpc('admin_add_member', { p_name: name }));
  const client: SupabaseClient = await anonClient();
  await ok(client.rpc('office_login', { p_player: player.id, p_pin: pin }));
  return { client, player: player as { id: string; name: string }, name };
}

/** One member's balance through room_balances, as `client` sees it. */
export async function balanceOf(client: SupabaseClient, roomId: string, playerId: string) {
  const rows = (await ok(client.rpc('room_balances', { p_room: roomId }))) as {
    player_id: string;
    balance: number;
  }[];
  return rows.find((r) => r.player_id === playerId)?.balance;
}
```

- [ ] **Step 2: Failing tests.** Create `tests/db/office.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { officeRow } from './officeFixtures.ts';
import { balance, shopRoom } from './raceFixtures.ts';

describe('office room', () => {
  it('exists once, code TURF, and survives cleanup', async () => {
    const admin = adminClient();
    const rows = await ok(admin.from('rooms').select('code, kind').eq('kind', 'office'));
    expect(rows).toEqual([{ code: 'TURF', kind: 'office' }]);
    const room = await officeRow();
    await ok(admin.from('rooms').update({ last_activity_at: '2000-01-01T00:00:00Z' }).eq('id', room.id));
    await ok(admin.rpc('cleanup_rooms'));
    expect(await ok(admin.from('rooms').select('id').eq('id', room.id))).toHaveLength(1);
  });

  it('refuses host actions while it has no host (null host_uid is nobody)', async () => {
    const room = await officeRow();
    await ok(adminClient().from('rooms').update({ host_uid: null }).eq('id', room.id));
    const stranger = await anonClient();
    expect(await fails(stranger.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }))).toBe('not_host');
    expect(
      await fails(stranger.rpc('update_room_settings', { p_room: room.id, p_prize: 'x' })),
    ).toBe('not_host');
  });

  it('accepts ledger rows without a race only as topup or reasoned admin_adjust', async () => {
    const admin = adminClient();
    const room = await officeRow();
    const [p] = await ok(
      admin.from('room_players').insert({ room_id: room.id, name: `L${Date.now()}` }).select('id'),
    );
    const row = (type: string, reason: string | null) => ({
      room_id: room.id,
      player_id: (p as { id: string }).id,
      type,
      amount: 5,
      reason,
    });
    await ok(admin.from('coin_ledger').insert(row('topup', null)));
    await ok(admin.from('coin_ledger').insert(row('admin_adjust', 'prize money')));
    expect(await fails(admin.from('coin_ledger').insert(row('admin_adjust', null)))).toMatch(/check/);
    expect(await fails(admin.from('coin_ledger').insert(row('payout', 'why')))).toMatch(/check/);
  });

  it('room_balances: members see everyone, outsiders see nothing; Private stays per race', async () => {
    const r = await shopRoom();
    const rows = await ok(r.ali.client.rpc('room_balances', { p_room: r.room.id }));
    expect(rows).toContainEqual({ player_id: r.ali.player.id, balance: 100 });
    expect(await balance(r.ali.client, r.raceId, r.ali.player.id)).toBe(100);
    const stranger = await anonClient();
    expect(await ok(stranger.rpc('room_balances', { p_room: r.room.id }))).toEqual([]);
  });
});
```

- [ ] **Step 3:** `npx vitest run --config vitest.db.config.ts tests/db/office.test.ts`. Expected: FAIL, because the office room, the new columns and `room_balances` don't exist yet.
- [ ] **Step 4: Migration.** Create `supabase/migrations/20261103000008_office.sql`:

```sql
-- Phase 5: Office mode (spec §2, §8, §10). One permanent room, code TURF; its room_players are the members.

create extension if not exists pgcrypto with schema extensions;

alter table public.rooms
  add column kind text not null default 'private' check (kind in ('private', 'office')),
  alter column host_uid drop not null;
create unique index rooms_one_office_idx on public.rooms ((true)) where kind = 'office';

-- Office horses: cosmetic choices (null = lane default colours) and soft removal (history stays).
alter table public.room_players
  add column coat smallint check (coat between 0 and 5),
  add column silk smallint check (silk between 0 and 10),
  add column horse_name text
    check (horse_name is null or (char_length(horse_name) between 1 and 24 and horse_name = btrim(horse_name))),
  add column archived_at timestamptz;

-- PIN data lives in the private schema: no client can select it.
create table private.office_pins (
  player_id uuid primary key references public.room_players (id) on delete cascade,
  pin_hash text,
  fails integer not null default 0,
  locked_until timestamptz
);

-- Coins outside any race: the starting 100 (topup) and admin adjustments (with a reason).
alter table public.coin_ledger
  alter column race_id drop not null,
  add column reason text check (reason is null or char_length(reason) between 1 and 100),
  drop constraint coin_ledger_type_check,
  add constraint coin_ledger_type_check
    check (type in ('topup', 'floor', 'purchase', 'bet', 'unbet', 'payout', 'admin_adjust')),
  add constraint coin_ledger_admin_reason_check check ((type = 'admin_adjust') = (reason is not null)),
  add constraint coin_ledger_raceless_check check (race_id is not null or type in ('topup', 'admin_adjust'));
create index coin_ledger_player_idx on public.coin_ledger (player_id);

-- v2: a null host (the office before anyone unlocks it) is nobody. `<>` would let everyone through.
create or replace function private.lock_host_room(p_room uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_room.host_uid is distinct from auth.uid() then
    raise exception 'not_host';
  end if;
  update public.rooms set last_activity_at = now() where id = p_room;
  return v_room;
end;
$$;

-- v2: Office wallets carry over (every row of the member); Private coins live per race.
create or replace function private.balance(p_race uuid, p_player uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(l.amount), 0)::integer
  from public.coin_ledger l
  where l.player_id = p_player
    and (l.race_id = p_race
         or exists (select 1 from public.rooms r where r.id = l.room_id and r.kind = 'office'));
$$;

-- Every member's balance in one call (replaces fetching the ledger). Empty for non-members.
create function public.room_balances(p_room uuid)
returns table (player_id uuid, balance integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, private.balance(r.race_id, p.id)
  from public.rooms r
  join public.room_players p on p.room_id = r.id
  where r.id = p_room and p.archived_at is null and private.is_room_member(p_room);
$$;
revoke execute on function public.room_balances(uuid) from public, anon;
grant execute on function public.room_balances(uuid) to authenticated;

-- v2: only Private rooms expire.
create or replace function public.cleanup_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.rooms where kind = 'private' and last_activity_at < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

insert into public.rooms (code, kind) values ('TURF', 'office');
```

- [ ] **Step 5:** `npx supabase db reset`, then `npm run test:db`. Expected: the 4 new tests pass and the existing 54 still pass. If the realtime test fails once right after the reset, rerun it once.
- [ ] **Step 6:** `git add supabase/migrations/20261103000008_office.sql tests/db/officeFixtures.ts tests/db/office.test.ts && git commit -m "feat(db): office room, carried wallets, null-safe host check"`

---

### Task 3: PIN login and horse settings

**Files:** Create `supabase/migrations/20261103000009_office_login.sql`. Modify `tests/db/office.test.ts`.

The fixtures need `admin_add_member` and `admin_claim_host`, so **this migration defines both**. They are service role only. Task 5 adds the other admin RPCs and replaces `admin_claim_host` with the same body.

- [ ] **Step 1: Failing tests.** Change the officeFixtures import in `tests/db/office.test.ts` to `{ member, officeRoom, officeRow }` and append:

```ts
describe('office login', () => {
  it('first login sets the PIN; later logins check it', async () => {
    const m = await member('P', '4321');
    const roster = (await ok(m.client.rpc('office_roster'))) as { id: string; has_pin: boolean }[];
    expect(roster).toContainEqual({ id: m.player.id, name: m.name, has_pin: true });
    const other = await anonClient();
    expect(await ok(other.rpc('office_login', { p_player: m.player.id, p_pin: '0000' }))).toBeNull();
    const again = await ok(other.rpc('office_login', { p_player: m.player.id, p_pin: '4321' }));
    expect(again.id).toBe(m.player.id);
  });

  it('moves the member to the new phone; the old phone loses the room', async () => {
    const m = await member('D');
    const room = await officeRow();
    const phone2 = await anonClient();
    await ok(phone2.rpc('office_login', { p_player: m.player.id, p_pin: '1234' }));
    expect(await ok(m.client.from('rooms').select('id').eq('id', room.id))).toEqual([]);
    expect(await ok(phone2.from('rooms').select('id').eq('id', room.id))).toHaveLength(1);
  });

  it('locks a name for 5 minutes after 5 wrong PINs', async () => {
    const m = await member('K');
    const phone = await anonClient();
    for (let i = 0; i < 5; i++) {
      expect(await ok(phone.rpc('office_login', { p_player: m.player.id, p_pin: '9999' }))).toBeNull();
    }
    expect(await fails(phone.rpc('office_login', { p_player: m.player.id, p_pin: '1234' }))).toBe(
      'pin_locked',
    );
  });

  it('rejects malformed PINs and Private-style joins', async () => {
    const m = await member('B');
    const phone = await anonClient();
    expect(await fails(phone.rpc('office_login', { p_player: m.player.id, p_pin: '12a4' }))).toBe('bad_pin');
    expect(await fails(phone.rpc('join_room', { p_code: 'TURF', p_name: 'Someone' }))).toBe('office_room');
    // A signed-in member's rejoin probe still returns their entry.
    expect((await ok(m.client.rpc('join_room', { p_code: 'TURF', p_name: '' }))).id).toBe(m.player.id);
  });

  it('logout unlinks the phone', async () => {
    const m = await member('O');
    const room = await officeRow();
    await ok(m.client.rpc('office_logout', { p_room: room.id }));
    expect(await ok(m.client.from('rooms').select('id').eq('id', room.id))).toEqual([]);
  });

  it('members set their own horse in the LOBBY', async () => {
    const { room } = await officeRoom();
    const m = await member('H');
    const horse = await ok(
      m.client.rpc('set_my_horse', { p_room: room.id, p_coat: 2, p_silk: 9, p_horse_name: ' Thunder ' }),
    );
    expect(horse).toMatchObject({ coat: 2, silk: 9, horse_name: 'Thunder' });
    const cleared = await ok(
      m.client.rpc('set_my_horse', { p_room: room.id, p_coat: null, p_silk: null, p_horse_name: '' }),
    );
    expect(cleared).toMatchObject({ coat: null, silk: null, horse_name: null });
    expect(
      await fails(m.client.rpc('set_my_horse', { p_room: room.id, p_coat: 6, p_silk: 0, p_horse_name: '' })),
    ).toBe('bad_horse');
  });
});
```

- [ ] **Step 2:** Run the office tests. Expected: FAIL, the functions are missing.
- [ ] **Step 3: Migration.** Create `supabase/migrations/20261103000009_office_login.sql`:

```sql
-- Phones join the office by picking their name and entering a 4-digit PIN (spec §10).

-- Service role only (the admin Edge Function). Defined here so login can be tested; more admin RPCs in 011.
create function public.admin_add_member(p_name text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid := (select id from public.rooms where kind = 'office');
  v_name text := btrim(coalesce(p_name, ''));
  v_player public.room_players;
begin
  if char_length(v_name) not between 1 and 24 then
    raise exception 'bad_name';
  end if;
  insert into public.room_players (room_id, name) values (v_room, v_name) returning * into v_player;
  -- New members start with 100 (spec §8); this row belongs to no race.
  insert into public.coin_ledger (room_id, player_id, type, amount) values (v_room, v_player.id, 'topup', 100);
  update public.rooms set last_activity_at = now() where id = v_room;
  return v_player;
exception when unique_violation then
  raise exception 'name_taken';
end;
$$;
revoke execute on function public.admin_add_member(text) from public, anon, authenticated;
grant execute on function public.admin_add_member(text) to service_role;

-- The device that unlocked the big screen with the admin password becomes the office host.
create function public.admin_claim_host(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.rooms set host_uid = p_uid, last_activity_at = now() where kind = 'office';
$$;
revoke execute on function public.admin_claim_host(uuid) from public, anon, authenticated;
grant execute on function public.admin_claim_host(uuid) to service_role;

-- Names to pick from on the login screen. Anyone signed in may read it; it shows nothing secret.
create function public.office_roster()
returns table (id uuid, name text, has_pin boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, coalesce(o.pin_hash is not null, false)
  from public.room_players p
  join public.rooms r on r.id = p.room_id and r.kind = 'office'
  left join private.office_pins o on o.player_id = p.id
  where p.archived_at is null
  order by lower(p.name);
$$;
revoke execute on function public.office_roster() from public, anon;
grant execute on function public.office_roster() to authenticated;

-- Returns the member on success and NULL for a wrong PIN: raising would roll back the fail count.
create function public.office_login(p_player uuid, p_pin text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players;
  v_pin private.office_pins;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  select p.* into v_player
    from public.room_players p join public.rooms r on r.id = p.room_id
    where p.id = p_player and r.kind = 'office' and p.archived_at is null
    for update of p;
  if not found then
    raise exception 'player_not_found';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'bad_pin';
  end if;
  insert into private.office_pins (player_id) values (p_player) on conflict do nothing;
  select * into v_pin from private.office_pins where player_id = p_player for update;
  if v_pin.locked_until > now() then
    raise exception 'pin_locked';
  end if;
  if v_pin.pin_hash is null then
    -- First login chooses the PIN.
    update private.office_pins
      set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), fails = 0, locked_until = null
      where player_id = p_player;
  elsif v_pin.pin_hash <> extensions.crypt(p_pin, v_pin.pin_hash) then
    -- 5 wrong tries lock the name for 5 minutes.
    update private.office_pins
      set fails = case when fails + 1 >= 5 then 0 else fails + 1 end,
          locked_until = case when fails + 1 >= 5 then now() + interval '5 minutes' end
      where player_id = p_player;
    return null;
  else
    update private.office_pins set fails = 0 where player_id = p_player;
  end if;
  -- One person per phone, one phone per person.
  update public.room_players set uid = null, ready = false
    where room_id = v_player.room_id and uid = auth.uid() and id <> p_player;
  update public.room_players set uid = auth.uid() where id = p_player returning * into v_player;
  update public.rooms set last_activity_at = now() where id = v_player.room_id;
  return v_player;
end;
$$;
revoke execute on function public.office_login(uuid, text) from public, anon;
grant execute on function public.office_login(uuid, text) to authenticated;

create function public.office_logout(p_room uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.room_players p set uid = null, ready = false
    from public.rooms r
    where r.id = p_room and r.kind = 'office' and p.room_id = r.id and p.uid = auth.uid();
  update public.rooms set last_activity_at = now() where id = p_room and kind = 'office';
end;
$$;
revoke execute on function public.office_logout(uuid) from public, anon;
grant execute on function public.office_logout(uuid) to authenticated;

-- v3: the office is joined with office_login; the rejoin probe ('' name) still returns your entry.
create or replace function public.join_room(p_code text, p_name text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_phase text;
  v_kind text;
  v_name text := btrim(coalesce(p_name, ''));
  v_player public.room_players;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  select id, phase, kind into v_room_id, v_phase, v_kind from public.rooms where code = upper(btrim(p_code));
  if not found then
    raise exception 'room_not_found';
  end if;

  -- Same device again: return its entry (the name is ignored, so '' works as a rejoin probe).
  select * into v_player from public.room_players
    where room_id = v_room_id and uid = auth.uid() and archived_at is null;
  if found then
    return v_player;
  end if;
  if v_kind = 'office' then
    raise exception 'office_room';
  end if;

  if v_phase <> 'LOBBY' then
    raise exception 'wrong_phase';
  end if;
  if char_length(v_name) not between 1 and 24 then
    raise exception 'bad_name';
  end if;
  update public.rooms set last_activity_at = now() where id = v_room_id;

  -- A name the host typed (no phone yet) is claimed by the first phone that joins with it.
  update public.room_players set uid = auth.uid()
    where room_id = v_room_id and lower(name) = lower(v_name) and uid is null
    returning * into v_player;
  if found then
    return v_player;
  end if;

  if exists (select 1 from public.room_players where room_id = v_room_id and lower(name) = lower(v_name)) then
    raise exception 'name_taken';
  end if;
  if (select count(*) from public.room_players where room_id = v_room_id) >= 40 then
    raise exception 'room_full';
  end if;
  insert into public.room_players (room_id, uid, name)
  values (v_room_id, auth.uid(), v_name)
  returning * into v_player;
  return v_player;
exception when unique_violation then
  -- lost a race: same device joined twice (return its entry) or same name taken
  select * into v_player from public.room_players where room_id = v_room_id and uid = auth.uid();
  if found then
    return v_player;
  end if;
  raise exception 'name_taken';
end;
$$;

-- Office members style their own horse in the LOBBY. Null colour = lane default; '' name = none.
create function public.set_my_horse(p_room uuid, p_coat integer, p_silk integer, p_horse_name text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_my_player(p_room, 'LOBBY');
  v_name text := nullif(btrim(coalesce(p_horse_name, '')), '');
begin
  if (select kind from public.rooms where id = p_room) <> 'office' then
    raise exception 'office_only';
  end if;
  if p_coat not between 0 and 5 or p_silk not between 0 and 10 or char_length(v_name) > 24 then
    raise exception 'bad_horse';
  end if;
  update public.room_players set coat = p_coat, silk = p_silk, horse_name = v_name
    where id = v_player.id returning * into v_player;
  return v_player;
end;
$$;
revoke execute on function public.set_my_horse(uuid, integer, integer, text) from public, anon;
grant execute on function public.set_my_horse(uuid, integer, integer, text) to authenticated;
```

- [ ] **Step 4:** `npx supabase db reset && npm run test:db`. All pass.
- [ ] **Step 5:** `git add supabase/migrations/20261103000009_office_login.sql tests/db/office.test.ts && git commit -m "feat(db): office PIN login, logout and horse settings"`

---

### Task 4: Office race flow and history input

**Files:** Create `supabase/migrations/20261103000010_office_race.sql`. Modify `tests/db/office.test.ts`.

- [ ] **Step 1: Failing tests.** Add `balanceOf` to the officeFixtures import in `tests/db/office.test.ts`, then append:

```ts
describe('office race flow', () => {
  it('roster is admin-managed: no add/remove from the big screen, archived can not be ticked', async () => {
    const { host, room, admin } = await officeRoom();
    const m = await member('R');
    expect(await fails(host.rpc('add_player', { p_room: room.id, p_name: 'Zed' }))).toBe('admin_only');
    expect(await fails(host.rpc('remove_player', { p_player: m.player.id }))).toBe('admin_only');
    await ok(admin.from('room_players').update({ archived_at: new Date().toISOString() }).eq('id', m.player.id));
    expect(await fails(host.rpc('set_ticked', { p_player: m.player.id, p_ticked: true }))).toBe(
      'player_not_found',
    );
  });

  it('opening the shop pays +100 to horses in the race and lifts others to 50; cancel undoes it', async () => {
    const { host, room, admin } = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const watcher = await member('W');
    // The watcher has spent down to 10.
    await ok(
      admin.from('coin_ledger').insert({
        room_id: room.id, player_id: watcher.player.id, type: 'admin_adjust', amount: -90, reason: 'test',
      }),
    );
    for (const p of [a, b]) await ok(host.rpc('set_ticked', { p_player: p.player.id, p_ticked: true }));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(200);
    expect(await balanceOf(a.client, room.id, watcher.player.id)).toBe(50);
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'LOBBY' }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(100);
    expect(await balanceOf(a.client, room.id, watcher.player.id)).toBe(10);
  });

  it('carries coins across races and feeds history into the next race input', async () => {
    const { host, room, admin } = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    for (const p of [a, b]) await ok(host.rpc('set_ticked', { p_player: p.player.id, p_ticked: true }));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    await ok(a.client.rpc('buy_box', { p_room: room.id, p_box: 'attack' })); // 200 - 20
    const input = await ok(host.rpc('lock_odds_begin', { p_room: room.id }));
    expect(input.history).toEqual({
      [a.player.id]: { races: 0, wins: 0, top3: 0 },
      [b.player.id]: { races: 0, wins: 0, top3: 0 },
    });
    const odds = { [a.player.id]: { win: 2, place: 1.1 }, [b.player.id]: { win: 2, place: 1.1 } };
    await ok(admin.rpc('lock_odds_finish', { p_race: input.race_id, p_odds: odds }));
    await ok(host.rpc('start_race_begin', { p_room: room.id }));
    await ok(
      admin.rpc('start_race_finish', {
        p_race: input.race_id, p_timeline: {}, p_finish: [a.player.id, b.player.id], p_seconds: 0.01,
      }),
    );
    await new Promise((r) => setTimeout(r, 50));
    await ok(host.rpc('finish_race', { p_room: room.id }));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'LOBBY' }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(180);

    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(280);
    const next = await ok(host.rpc('lock_odds_begin', { p_room: room.id }));
    expect(next.history[a.player.id]).toEqual({ races: 1, wins: 1, top3: 1 });
    expect(next.history[b.player.id]).toEqual({ races: 1, wins: 0, top3: 1 });
  });

  it('Private races carry no history', async () => {
    const r = await shopRoom();
    const input = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(input.history).toBeNull();
  });
});
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Migration.** Create `supabase/migrations/20261103000010_office_race.sql`:

```sql
-- Office race flow: wallet topups and floor (spec §8), admin-managed roster, history for odds (spec §7).

-- v3: Office pays +100 to every horse in the race and lifts any member under 50 to 50.
-- Both rows carry the race id, so cancelling the race (SHOP -> LOBBY) undoes them.
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
  elsif v_room.phase = 'SHOP' then
    -- Cancelling deletes the race and, with it, this race's topups, floors and purchases.
    delete from public.races where id = v_room.race_id;
  end if;
  update public.room_players set ready = false where room_id = p_room and ready;
  update public.rooms set phase = p_phase, race_id = v_race where id = p_room returning * into v_room;
  return v_room;
end;
$$;

-- v2: the office roster is managed in /admin.
create or replace function public.add_player(p_room uuid, p_name text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_host_room(p_room);
  v_name text := btrim(coalesce(p_name, ''));
  v_player public.room_players;
begin
  if v_room.kind = 'office' then
    raise exception 'admin_only';
  end if;
  if v_room.phase <> 'LOBBY' then
    raise exception 'wrong_phase';
  end if;
  if char_length(v_name) not between 1 and 24 then
    raise exception 'bad_name';
  end if;
  if (select count(*) from public.room_players where room_id = p_room) >= 40 then
    raise exception 'room_full';
  end if;
  insert into public.room_players (room_id, name) values (p_room, v_name) returning * into v_player;
  return v_player;
exception when unique_violation then
  raise exception 'name_taken';
end;
$$;

create or replace function public.remove_player(p_player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_room public.rooms;
begin
  select room_id into v_room_id from public.room_players where id = p_player;
  if not found then
    raise exception 'player_not_found';
  end if;
  v_room := private.lock_host_room(v_room_id);
  if v_room.kind = 'office' then
    raise exception 'admin_only';
  end if;
  perform 1 from public.room_players where id = p_player for update;
  if not found then
    raise exception 'player_not_found';
  end if;
  if v_room.phase <> 'LOBBY' then
    raise exception 'wrong_phase';
  end if;
  delete from public.room_players where id = p_player;
end;
$$;

-- v2: archived members can't be ticked.
create or replace function public.set_ticked(p_player uuid, p_ticked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_room public.rooms;
begin
  select room_id into v_room_id from public.room_players where id = p_player and archived_at is null;
  if not found then
    raise exception 'player_not_found';
  end if;
  v_room := private.lock_host_room(v_room_id);
  perform 1 from public.room_players where id = p_player and archived_at is null for update;
  if not found then
    raise exception 'player_not_found';
  end if;
  if v_room.phase <> 'LOBBY' then
    raise exception 'wrong_phase';
  end if;
  -- 22 = MAX_HORSES in src/sim/config.ts
  if p_ticked and (
    select count(*) from public.room_players
    where room_id = v_room_id and ticked and id <> p_player
  ) >= 22 then
    raise exception 'field_full';
  end if;
  update public.room_players set ticked = coalesce(p_ticked, false) where id = p_player;
end;
$$;

-- v2: Office races add {player id: {races, wins, top3}} from the member's finished office races.
create or replace function private.race_input(p_race uuid)
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
```

- [ ] **Step 4:** `npx supabase db reset && npm run test:db`. All pass, including the Phase 3 race tests (Private flow unchanged).
- [ ] **Step 5:** `git add supabase/migrations/20261103000010_office_race.sql tests/db/office.test.ts && git commit -m "feat(db): office wallets per race, admin-managed roster, odds history input"`

---

### Task 5: Admin RPCs

**Files:** Create `supabase/migrations/20261103000011_admin.sql`, `tests/db/admin.test.ts`

These RPCs are service role only. The `admin` Edge Function (Task 6) is the only caller.

- [ ] **Step 1: Failing tests.** Create `tests/db/admin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { balanceOf, member, officeRoom, officeRow } from './officeFixtures.ts';

type Overview = {
  members: { id: string; name: string; balance: number; has_pin: boolean; phone: boolean; archived: boolean }[];
  races: { id: string; current: boolean; finished: boolean }[];
};

describe('admin RPCs', () => {
  it('are not callable by clients', async () => {
    const phone = await anonClient();
    for (const call of [
      phone.rpc('admin_overview'),
      phone.rpc('admin_add_member', { p_name: 'Hack' }),
      phone.rpc('admin_claim_host', { p_uid: '00000000-0000-0000-0000-000000000000' }),
    ]) {
      expect(await fails(call)).toMatch(/permission denied/);
    }
  });

  it('overview lists members with balance, PIN and phone status', async () => {
    const m = await member('V');
    const o = (await ok(adminClient().rpc('admin_overview'))) as Overview;
    expect(o.members).toContainEqual(
      expect.objectContaining({ id: m.player.id, name: m.name, balance: 100, has_pin: true, phone: true, archived: false }),
    );
  });

  it('renames, resets a PIN, adjusts coins with a reason', async () => {
    const admin = adminClient();
    const room = await officeRow();
    const m = await member('N');
    const renamed = `${m.name}x`;
    expect((await ok(admin.rpc('admin_rename', { p_player: m.player.id, p_name: renamed }))).name).toBe(renamed);
    await ok(admin.rpc('admin_reset_pin', { p_player: m.player.id }));
    const phone = await anonClient();
    // After a reset, the next login sets a new PIN.
    expect(await ok(phone.rpc('office_login', { p_player: m.player.id, p_pin: '7777' }))).not.toBeNull();
    expect(await fails(admin.rpc('admin_adjust', { p_player: m.player.id, p_amount: 50, p_reason: ' ' }))).toBe(
      'bad_reason',
    );
    expect(await fails(admin.rpc('admin_adjust', { p_player: m.player.id, p_amount: 0, p_reason: 'x' }))).toBe(
      'bad_amount',
    );
    await ok(admin.rpc('admin_adjust', { p_player: m.player.id, p_amount: -30, p_reason: 'Lunch IOU' }));
    expect(await balanceOf(phone, room.id, m.player.id)).toBe(70);
  });

  it('archives in the LOBBY only; the member disappears but the ledger stays', async () => {
    const { admin, host, room } = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    for (const p of [a, b]) await ok(host.rpc('set_ticked', { p_player: p.player.id, p_ticked: true }));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    expect(await fails(admin.rpc('admin_archive', { p_player: a.player.id }))).toBe('wrong_phase');
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'LOBBY' }));
    await ok(admin.rpc('admin_archive', { p_player: a.player.id }));
    const roster = (await ok(b.client.rpc('office_roster'))) as { id: string }[];
    expect(roster.map((r) => r.id)).not.toContain(a.player.id);
    expect(await fails(a.client.rpc('office_login', { p_player: a.player.id, p_pin: '1234' }))).toBe(
      'player_not_found',
    );
    expect(await ok(admin.from('coin_ledger').select('id').eq('player_id', a.player.id))).not.toEqual([]);
  });

  it('never deletes the race in progress; deletes a finished one and reverses its coins', async () => {
    const { admin, host, room } = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    for (const p of [a, b]) await ok(host.rpc('set_ticked', { p_player: p.player.id, p_ticked: true }));
    const shop = await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    expect(await fails(admin.rpc('admin_delete_race', { p_race: shop.race_id }))).toBe('race_in_use');
    // Make it "finished" and leave it (PODIUM -> LOBBY keeps the race).
    await ok(admin.from('races').update({ finish_order: [a.player.id, b.player.id] }).eq('id', shop.race_id));
    await ok(admin.from('rooms').update({ phase: 'PODIUM' }).eq('id', room.id));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'LOBBY' }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(200);
    await ok(admin.rpc('admin_delete_race', { p_race: shop.race_id }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(100);
    const o = (await ok(admin.rpc('admin_overview'))) as Overview;
    expect(o.races.map((r) => r.id)).not.toContain(shop.race_id);
  });

  it('claim_host moves the office to a new big screen', async () => {
    const { admin, host, room } = await officeRoom();
    const screen = await anonClient();
    const { data } = await screen.auth.getUser();
    await ok(admin.rpc('admin_claim_host', { p_uid: data.user!.id }));
    expect(await ok(screen.from('rooms').select('id').eq('id', room.id))).toHaveLength(1);
    expect(await fails(host.rpc('update_room_settings', { p_room: room.id, p_prize: 'x' }))).toBe('not_host');
  });
});
```

- [ ] **Step 2:** Run the tests. Expected: FAIL (`admin_overview` and the others are missing).
- [ ] **Step 3: Migration.** Create `supabase/migrations/20261103000011_admin.sql`:

```sql
-- /admin actions (spec §10). Service role only: the admin Edge Function checks the password first.

-- Locks an office member; p_active = false also finds archived ones.
create function private.office_member(p_player uuid, p_active boolean default true)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players;
begin
  select p.* into v_player
    from public.room_players p join public.rooms r on r.id = p.room_id
    where p.id = p_player and r.kind = 'office' and (not p_active or p.archived_at is null)
    for update of p;
  if not found then
    raise exception 'player_not_found';
  end if;
  return v_player;
end;
$$;
revoke execute on function private.office_member(uuid, boolean) from public;

create function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'room', jsonb_build_object('id', r.id, 'code', r.code, 'phase', r.phase),
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

create function public.admin_rename(p_player uuid, p_name text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.office_member(p_player, false);
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) not between 1 and 24 then
    raise exception 'bad_name';
  end if;
  update public.room_players set name = v_name where id = p_player returning * into v_player;
  update public.rooms set last_activity_at = now() where id = v_player.room_id;
  return v_player;
exception when unique_violation then
  raise exception 'name_taken';
end;
$$;

-- Removing keeps history (spec §10); only in the LOBBY so a race in progress keeps its horse.
create function public.admin_archive(p_player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.office_member(p_player);
begin
  if (select phase from public.rooms where id = v_player.room_id for update) <> 'LOBBY' then
    raise exception 'wrong_phase';
  end if;
  update public.room_players set archived_at = now(), ticked = false, ready = false, uid = null
    where id = p_player;
  update public.rooms set last_activity_at = now() where id = v_player.room_id;
end;
$$;

create function public.admin_reset_pin(p_player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.office_member(p_player);
begin
  update private.office_pins set pin_hash = null, fails = 0, locked_until = null where player_id = v_player.id;
end;
$$;

create function public.admin_adjust(p_player uuid, p_amount integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.office_member(p_player, false);
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then
    raise exception 'bad_amount';
  end if;
  if char_length(v_reason) not between 1 and 100 then
    raise exception 'bad_reason';
  end if;
  insert into public.coin_ledger (room_id, player_id, type, amount, reason)
  values (v_player.room_id, p_player, 'admin_adjust', p_amount, v_reason);
  update public.rooms set last_activity_at = now() where id = v_player.room_id;
end;
$$;

-- Deleting a race reverses its coin flows (its ledger rows cascade away).
create function public.admin_delete_race(p_race uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  select m.* into v_room from public.races x join public.rooms m on m.id = x.room_id
    where x.id = p_race and m.kind = 'office' for update of m;
  if not found then
    raise exception 'race_not_found';
  end if;
  if v_room.race_id = p_race then
    raise exception 'race_in_use';
  end if;
  delete from public.races where id = p_race;
  update public.rooms set last_activity_at = now() where id = v_room.id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_overview()', 'public.admin_rename(uuid, text)', 'public.admin_archive(uuid)',
    'public.admin_reset_pin(uuid)', 'public.admin_adjust(uuid, integer, text)', 'public.admin_delete_race(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
```

- [ ] **Step 4:** `npx supabase db reset && npm run test:db`. All pass.
- [ ] **Step 5:** `git add supabase/migrations/20261103000011_admin.sql tests/db/admin.test.ts && git commit -m "feat(db): admin RPCs for members, coins and races"`

---

### Task 6: Edge Functions: admin, lock-odds history

**Files:**
- Modify: `supabase/functions/_shared/http.ts`, `supabase/functions/lock-odds/index.ts`, `supabase/config.toml`, `tests/db/functions.test.ts`.
- Create: `supabase/functions/admin/index.ts`.
- Create, never commit: `supabase/functions/.env`.

- [ ] **Step 1: Local secret.** Create `supabase/functions/.env` with one line: `ADMIN_PASSWORD=local-admin-password`. Check that git ignores it: `git check-ignore supabase/functions/.env` should print the path. Then add to `supabase/config.toml` after the `[functions.start-race]` block:

```toml
[functions.admin]
verify_jwt = false
```

- [ ] **Step 2: Failing tests.** Append to `tests/db/functions.test.ts` (import `adminPassword`, `member`, `officeRoom` from `./officeFixtures.ts`):

```ts
describe('admin function', () => {
  it('needs the password', { timeout: 30_000 }, async () => {
    const phone = await anonClient();
    expect(await failsInvoke(phone, 'admin', { password: 'nope', action: 'overview' })).toBe('bad_password');
  });

  it('runs actions and unlocks the big screen for the calling device', { timeout: 30_000 }, async () => {
    const { room } = await officeRoom();
    const m = await member('F');
    const screen = await anonClient();
    const password = adminPassword();
    const o = await invoke<{ members: { id: string }[] }>(screen, 'admin', { password, action: 'overview' });
    expect(o.members.map((x) => x.id)).toContain(m.player.id);
    await invoke(screen, 'admin', { password, action: 'claim_host' });
    expect(await ok(screen.from('rooms').select('id').eq('id', room.id))).toHaveLength(1);
    expect(await failsInvoke(screen, 'admin', { password, action: 'fly' })).toBe('bad_action');
  });

  it('lock-odds prices an office race (with history)', { timeout: 60_000 }, async () => {
    const { host, room } = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    for (const p of [a, b]) await ok(host.rpc('set_ticked', { p_player: p.player.id, p_ticked: true }));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    await invoke(host, 'lock-odds', { room: room.id });
    const [race] = await ok(host.from('races').select('odds').eq('room_id', room.id).is('finish_order', null));
    expect(Object.keys(race.odds)).toEqual(expect.arrayContaining([a.player.id, b.player.id]));
  });
});
```

- [ ] **Step 3:** `npx vitest run --config vitest.db.config.ts tests/db/functions.test.ts`. Expected: FAIL, because there is no `admin` function yet.
- [ ] **Step 4: `_shared/http.ts`.** Let the handler take any JSON body and see the caller's token:

```ts
export type Body = Record<string, unknown> & { room?: string };

/**
 * Serves an action. `user` carries the caller's token (RLS and host checks apply); `admin` is
 * service-role for the *_finish and admin_* RPCs; `token` is the caller's JWT ('' if none).
 * Errors go back as 400 `{ error: code }`.
 */
export function serve(
  handler: (body: Body, user: SupabaseClient, admin: SupabaseClient, token: string) => Promise<unknown>,
) {
```

Inside, compute `const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');` and call `handler(body, user, admin, token)`. Keep everything else unchanged.

`RaceInputRow` gains `history: Record<string, HorseHistory> | null;`. Import `HorseHistory` as a type from `../../../src/sim/odds.ts`.

- [ ] **Step 5: lock-odds.** Pass the history:

```ts
  const { odds, sims } = simulateOdds(input, createCryptoRng(), undefined, input.history ?? undefined);
```

- [ ] **Step 6: admin function.** Create `supabase/functions/admin/index.ts`:

```ts
import { rpc, serve, type Body } from '../_shared/http.ts';

const RPC: Record<string, (b: Body) => [string, Record<string, unknown>]> = {
  overview: () => ['admin_overview', {}],
  add: (b) => ['admin_add_member', { p_name: b.name }],
  rename: (b) => ['admin_rename', { p_player: b.player, p_name: b.name }],
  archive: (b) => ['admin_archive', { p_player: b.player }],
  reset_pin: (b) => ['admin_reset_pin', { p_player: b.player }],
  adjust: (b) => ['admin_adjust', { p_player: b.player, p_amount: b.amount, p_reason: b.reason }],
  delete_race: (b) => ['admin_delete_race', { p_race: b.race }],
};

/** Constant-time compare; a wrong password waits 1 s to slow guessing. */
async function checkPassword(given: unknown) {
  const expected = Deno.env.get('ADMIN_PASSWORD');
  if (!expected) throw new Error('admin_not_configured');
  const a = new TextEncoder().encode(typeof given === 'string' ? given : '');
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]!;
  if (diff !== 0) {
    await new Promise((r) => setTimeout(r, 1000));
    throw new Error('bad_password');
  }
}

// /admin (spec §10): every action needs ADMIN_PASSWORD; claim_host makes the calling device the office host.
serve(async (body, _user, admin, token) => {
  await checkPassword(body.password);
  if (body.action === 'claim_host') {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) throw new Error('not_signed_in');
    await rpc(admin, 'admin_claim_host', { p_uid: data.user.id });
    return {};
  }
  const make = typeof body.action === 'string' ? RPC[body.action] : undefined;
  if (!make) throw new Error('bad_action');
  const [fn, args] = make(body);
  return (await rpc(admin, fn, args)) ?? {};
});
```

- [ ] **Step 6b: Restart the local stack.** The edge runtime only notices new files when it starts, so it won't see the new function or secret until a restart. Run `npx supabase stop && npx supabase start` (data is kept).
  - Check with `npx vitest run --config vitest.db.config.ts tests/db/functions.test.ts`.
  - If the result is `admin_not_configured`, the runtime didn't load `supabase/functions/.env`. Add the block below to `supabase/config.toml`, stop, then start again with `ADMIN_PASSWORD=local-admin-password npx supabase start`.
  - Write down which method worked; it goes in the README in Task 12.

```toml
[edge_runtime.secrets]
ADMIN_PASSWORD = "env(ADMIN_PASSWORD)"
```

- [ ] **Step 7:** Run `npm run test:db` (all pass), then `npm run typecheck && npm run lint`.
- [ ] **Step 8:** `git add supabase/functions/_shared/http.ts supabase/functions/lock-odds/index.ts supabase/functions/admin/index.ts supabase/config.toml tests/db/functions.test.ts && git commit -m "feat(functions): admin function; lock-odds blends office history"`. **Never** `git add` the `.env` file.

---

### Task 7: Client library

**Files:** Modify `src/net/database.types.ts` (regenerate), `src/net/rooms.ts`, `src/lobby/lobby.ts`, `src/betting/betting.ts`, `src/betting/betting.test.ts`, `src/render/palette.ts`, `src/render/palette.test.ts`, `src/play/PlayPage.tsx` (one line)

- [ ] **Step 1: Regenerate types** (Git Bash): `npx supabase gen types typescript --local > src/net/database.types.ts`, then `npx prettier --write src/net/database.types.ts`.
- [ ] **Step 2: Failing unit tests.**
  - `src/betting/betting.test.ts`: remove the `balanceOf` test and import; add:

```ts
  it('names horses by horse name when set, else by person', () => {
    const players = [
      { id: 'a', name: 'Ali', horse_name: 'Thunder' },
      { id: 'b', name: 'Bea', horse_name: null },
    ];
    expect(horseNameOf(players, 'a')).toBe('Thunder');
    expect(horseNameOf(players, 'b')).toBe('Bea');
    expect(horseNameOf(players, 'zz')).toBe('?');
  });
```

  - `src/render/palette.test.ts`: add (import `COAT_COLORS`, `SILK_COLORS`, `colorsFor`, `colorsOf`):

```ts
describe('colorsFor', () => {
  it('uses the member choice and falls back to the lane colours', () => {
    expect(colorsFor(3, { coat: null, silk: null })).toEqual(colorsOf(3));
    expect(colorsFor(3, { coat: 0, silk: 1 })).toEqual({
      coat: COAT_COLORS[0],
      mane: colorsOf(0).mane,
      silk: SILK_COLORS[1],
    });
    expect(colorsFor(4, undefined)).toEqual(colorsOf(4));
  });
});
```

- [ ] **Step 3: Implement.**

`src/lobby/lobby.ts`:

```ts
/** The built-in Office room (supabase/migrations/20261103000008_office.sql). */
export const OFFICE_CODE = 'TURF';
```

`src/betting/betting.ts`: delete `balanceOf` and add:

```ts
type Named = { id: string; name: string; horse_name?: string | null };

/** Office horses may have their own name; Private horses are named after their person. */
export const horseName = (p: Pick<Named, 'name' | 'horse_name'>) => p.horse_name || p.name;

export const horseNameOf = (players: readonly Named[], id: string | undefined) => {
  const p = players.find((x) => x.id === id);
  return p ? horseName(p) : '?';
};
```

`src/render/palette.ts`:
- Rename the arrays to exported `COAT_COLORS` and `SILK_COLORS`. Keep `MANES` private.
- Update `colorsOf` to use them.
- Add:

```ts
/** A member's chosen coat/silk (null = lane default). */
export function colorsFor(lane: number, choice?: { coat: number | null; silk: number | null }): HorseColors {
  const base = colorsOf(lane);
  if (!choice) return base;
  return {
    coat: choice.coat === null ? base.coat : COAT_COLORS[choice.coat]!,
    mane: choice.coat === null ? base.mane : MANES[choice.coat]!,
    silk: choice.silk === null ? base.silk : SILK_COLORS[choice.silk]!,
  };
}

/** Colour lookup for the renderer: horse id + lane -> colours, from the room's players. */
export const colorsByPlayer =
  (players: readonly { id: string; coat: number | null; silk: number | null }[]) =>
  (horse: string, lane: number) =>
    colorsFor(lane, players.find((p) => p.id === horse));
```

`src/net/rooms.ts`:
1. `RoomState`: remove `ledger` and the `LedgerRow` type. Add `balances: Record<string, number>`.
2. `fetchRoom`:
   - Add `.is('archived_at', null)` to the players query.
   - Replace the ledger query with `call(supabase.rpc('room_balances', { p_room: room.id }))`.
   - Return `balances: Object.fromEntries((rows ?? []).map((r) => [r.player_id, r.balance]))`.
3. Replace `invoke` with a general helper (same error contract) and add the wrappers:

```ts
/** Edge Functions answer errors as 400 `{ error: code }`, the same codes RPCs raise. */
async function callFunction<T>(
  name: 'lock-odds' | 'start-race' | 'admin',
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError) {
    const payload = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (payload?.error) throw new Error(payload.error);
  }
  throw new Error(error.message);
}
export const lockOdds = (roomId: string) => callFunction('lock-odds', { room: roomId });
export const startRace = (roomId: string) => callFunction('start-race', { room: roomId });
export const adminAction = <T = unknown>(password: string, action: string, args: Record<string, unknown> = {}) =>
  callFunction<T>('admin', { ...args, password, action });

export const officeRoster = () => call(supabase.rpc('office_roster'));
/** Null from the server means a wrong PIN (the fail count must commit, so it doesn't raise). */
export async function officeLogin(playerId: string, pin: string): Promise<RoomPlayer> {
  const player = await call(supabase.rpc('office_login', { p_player: playerId, p_pin: pin }));
  if (!player) throw new Error('wrong_pin');
  return player;
}
export const officeLogout = (roomId: string) => call(supabase.rpc('office_logout', { p_room: roomId }));
export const setMyHorse = (roomId: string, coat: number | null, silk: number | null, horseName: string) =>
  call(supabase.rpc('set_my_horse', { p_room: roomId, p_coat: coat, p_silk: silk, p_horse_name: horseName }));
```

   If the generated types mark these nullable arguments as non-null, cast that one args object `as never`, with a one-line comment that the SQL accepts null. Change nothing else to satisfy the types.

4. `ERROR_TEXT`: add:

```ts
  office_room: 'This is the office race: pick your name and enter your PIN.',
  wrong_pin: 'Wrong PIN.',
  pin_locked: 'Too many wrong PINs. Try again in 5 minutes.',
  bad_pin: 'PINs are 4 digits.',
  admin_only: 'People are managed in /admin.',
  office_only: 'Only office horses can be customised.',
  bad_horse: 'Pick a coat and silk from the list; horse names are up to 24 characters.',
  bad_password: 'Wrong admin password.',
  admin_not_configured: 'The admin password is not set on the server.',
  bad_action: 'Unknown admin action.',
  bad_amount: 'Amount must be a whole number, not 0.',
  bad_reason: 'Give a reason (up to 100 characters).',
  race_in_use: "Can't delete the race in progress.",
```

- [ ] **Step 4:** In `src/play/PlayPage.tsx`, change `balance: balanceOf(state.ledger, mine.id)` to `balance: state.balances[mine.id] ?? 0` and drop the `balanceOf` import. Then `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` must all pass.
- [ ] **Step 5:** Check `git status` (only `src/` changed), then `git add src && git commit -m "feat(net): balances, office and admin wrappers; horse names and colours"`.

---

### Task 8: Per-horse colours in the renderer

**Files:** Modify `src/render/Pixel2DRenderer.ts`, `src/render/RaceView.tsx`, `src/play/MiniOval.tsx`, `src/track/TrackPage.tsx` (Silk call sites only).

- [ ] **Step 1: Renderer.** In `Pixel2DRenderer.ts`, export the colour lookup type and its lane default. Add a `private readonly colors: ColorsOf;` field, take it in the constructor, and replace `colorsOf(h.lane)` in `draw` with `this.colors(h.horse, h.lane)`:

```ts
import { BOX_COLOR, colorsOf, type HorseColors } from './palette.ts';

export type ColorsOf = (horse: HorseId, lane: number) => HorseColors;
/** Private rooms and the sandbox: colours by lane. */
export const defaultColors: ColorsOf = (_horse, lane) => colorsOf(lane);

  constructor(canvas: HTMLCanvasElement, colors: ColorsOf = defaultColors) {
    this.canvas = canvas;
    this.colors = colors;
  }
```

- [ ] **Step 2: RaceView.** Add an optional `colors?: ColorsOf` prop. Hold it in a ref so a room refetch doesn't restart the race:

```tsx
  const colorsRef = useRef(colors ?? defaultColors);
  useEffect(() => {
    colorsRef.current = colors ?? defaultColors;
  });
  // in the renderer effect:
  const renderer = new Pixel2DRenderer(el, (h, lane) => colorsRef.current(h, lane));
```

  Change `Silk` to take a colour: `export function Silk({ color }: { color: string })`, rendering `style={{ background: color }}`. The standings render `<Silk color={(colors ?? defaultColors)(h, timeline.horses.indexOf(h)).silk} />`.

- [ ] **Step 3: MiniOval.** Add an optional `colors?: ColorsOf` prop. The dot fill becomes `(colors ?? defaultColors)(id, lane).silk`. Import `defaultColors` and `ColorsOf` from `../render/Pixel2DRenderer.ts`.
- [ ] **Step 4: TrackPage podium.** Change `<Silk lane={…} />` to `<Silk color={colorsByPlayer(players)(id, (race?.horses ?? []).indexOf(id)).silk} />`, importing `colorsByPlayer` from `../render/palette.ts`.
- [ ] **Step 5:** typecheck, lint, test and build. Then `npm run dev` and check `/sandbox` still plays with lane colours. Stop the dev server.
- [ ] **Step 6:** `git add src/render src/play/MiniOval.tsx src/track/TrackPage.tsx && git commit -m "feat(render): per-horse colours"`

---

### Task 9: Phone: PIN login and horse panel

**Files:** Create `src/play/OfficeLogin.tsx`, `src/play/HorsePanel.tsx`. Modify `src/play/PlayPage.tsx`, `src/app/app.css`.

- [ ] **Step 1: OfficeLogin.** Create `src/play/OfficeLogin.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { errorText, officeLogin, officeRoster, type RoomPlayer } from '../net/rooms.ts';

type Entry = { id: string; name: string; has_pin: boolean };

/** Office phones: pick your name, enter (or on first login choose) your 4-digit PIN. */
export function OfficeLogin({ onLogin }: { onLogin: (player: RoomPlayer) => void }) {
  const [roster, setRoster] = useState<Entry[] | null>(null);
  const [pick, setPick] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    officeRoster().then(
      (rows) => setRoster(rows ?? []),
      (e: unknown) => setError(errorText(e)),
    );
  }, []);

  const chosen = roster?.find((r) => r.id === pick);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    officeLogin(pick, pin).then(onLogin, (err: unknown) => {
      setError(errorText(err));
      setPin('');
      setBusy(false);
    });
  };

  if (!roster) return <main className="play">{error ? <p role="alert">{error}</p> : 'Loading…'}</main>;
  return (
    <main className="play">
      <h1>Office race</h1>
      {roster.length === 0 ? (
        <p>No members yet. Ask the admin to add you at /admin.</p>
      ) : (
        <form className="shop" onSubmit={submit}>
          <label>
            Who are you?{' '}
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Pick your name</option>
              {roster.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {chosen && (
            <>
              <label>
                {chosen.has_pin ? 'Your PIN' : 'Choose a 4-digit PIN'}{' '}
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                />
              </label>
              {!chosen.has_pin && (
                <p>First time: this PIN only guards game coins. Don't reuse a real PIN (bank, phone).</p>
              )}
              <button type="submit" className="primary" disabled={busy || pin.length !== 4}>
                {chosen.has_pin ? 'Sign in' : 'Set PIN and sign in'}
              </button>
            </>
          )}
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 2: HorsePanel.** Create `src/play/HorsePanel.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { setMyHorse, type RoomPlayer } from '../net/rooms.ts';
import { COAT_COLORS, SILK_COLORS } from '../render/palette.ts';

type Act = (fn: () => Promise<unknown>) => void;
type Props = { roomId: string; mine: RoomPlayer; act: Act; busy: boolean };

function Swatches(props: {
  label: string;
  colors: readonly string[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const { label, colors, value, onChange } = props;
  return (
    <fieldset className="swatches">
      <legend>{label}</legend>
      <label>
        <input type="radio" checked={value === null} onChange={() => onChange(null)} /> Lane colour
      </label>
      {colors.map((c, i) => (
        <label key={c}>
          <input type="radio" checked={value === i} onChange={() => onChange(i)} aria-label={`${label} ${i + 1}`} />
          <span className="silk" style={{ background: c }} />
        </label>
      ))}
    </fieldset>
  );
}

/** Office LOBBY: coat, silk colour and horse name (cosmetic only). */
export function HorsePanel({ roomId, mine, act, busy }: Props) {
  const [coat, setCoat] = useState<number | null>(mine.coat);
  const [silk, setSilk] = useState<number | null>(mine.silk);
  const [name, setName] = useState(mine.horse_name ?? '');
  const save = (e: FormEvent) => {
    e.preventDefault();
    act(() => setMyHorse(roomId, coat, silk, name));
  };
  return (
    <form className="shop" onSubmit={save}>
      <h2>Your horse</h2>
      <Swatches label="Coat" colors={COAT_COLORS} value={coat} onChange={setCoat} />
      <Swatches label="Silks" colors={SILK_COLORS} value={silk} onChange={setSilk} />
      <label>
        Horse name (optional){' '}
        <input value={name} maxLength={24} placeholder={mine.name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button type="submit" disabled={busy}>
        Save horse
      </button>
    </form>
  );
}
```

- [ ] **Step 3: PlayPage.**
  - **Office login:** add `const [office, setOffice] = useState(false);`. In the join-probe effect, an `office_room` error sets it instead of showing an error:

```tsx
      .then(setMe, (e: unknown) => {
        if (e instanceof Error && e.message === 'office_room') setOffice(true);
        else if (!(e instanceof Error && e.message === 'bad_name')) setError(errorText(e));
      })
```

    When `office && !me`, render `<OfficeLogin onLogin={setMe} />` in place of the name form.
  - **Signed in elsewhere:** in `PlayRoom`, right after the existing `!mine` check, handle `mine.uid !== me.uid` (the member signed in on another phone). Show "You signed in on another phone." with a "Sign in here" button that reloads the page.
  - **Office LOBBY** (`room.kind === 'office' && room.phase === 'LOBBY'`), render:
    - `💰 {balance} coins`, since office coins carry over;
    - `<HorsePanel roomId={room.id} mine={mine} act={act} busy={busy} />`;
    - a "Not you? Switch person" button that runs `act(() => officeLogout(room.id).then(() => window.location.reload()))`.
  - **Horse names:** use `horseNameOf` instead of `nameOf` wherever a *horse* is named: bet slip options, bet lines in BetPanel, RunningPanel and ResultPanel. Bettor names stay `nameOf`.
  - **Colours:** pass `colors={colorsByPlayer(players)}` to `MiniOval`.
- [ ] **Step 4: CSS.** Append to `src/app/app.css`:

```css
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.swatches .silk {
  width: 1.4em;
  height: 1.4em;
}
```

- [ ] **Step 5:** typecheck, lint, test and build. Commit: `git add src/play src/app/app.css && git commit -m "feat(play): office PIN login and horse panel"`

---

### Task 10: Big screen: office unlock and lobby

**Files:** Create `src/track/OfficeHostLogin.tsx`. Modify `src/track/TrackPage.tsx`.

- [ ] **Step 1: OfficeHostLogin.** Create `src/track/OfficeHostLogin.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { adminAction, errorText } from '../net/rooms.ts';
import { ensureSignedIn } from '../net/supabase.ts';

/** The office big screen is unlocked with the admin password; this device becomes the host. */
export function OfficeHostLogin() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    ensureSignedIn()
      .then(() => adminAction(password, 'claim_host'))
      .then(
        () => window.location.reload(),
        (err: unknown) => {
          setError(errorText(err));
          setBusy(false);
        },
      );
  };
  return (
    <main className="track">
      <h1>Office race · big screen</h1>
      <form onSubmit={submit}>
        <label>
          Admin password{' '}
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>{' '}
        <button type="submit" className="primary" disabled={busy || !password}>
          Unlock
        </button>
      </form>
      <p>Opening the big screen here takes it over from any other screen.</p>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 2: TrackPage.**
  - **Unlock screen:** in `TrackPage`, when `error` is set and `code === OFFICE_CODE`, render `<OfficeHostLogin />` instead of the error. This covers a device that isn't the host and one whose screen was taken over.
  - **Office lobby** (`LobbyBoard` when `room.kind === 'office'`):
    - Hide the "Add a name" form and the ✕ remove buttons.
    - Show `<p>People, PINs and coins are managed at <a href="/admin">/admin</a>.</p>`.
    - Show `💰 {balances[p.id] ?? 0}` next to each roster name.
  - **Horse names:** use `horseNameOf` for horses in ShopBoard (the roster line), BettingBoard (Horse column) and PodiumBoard (top 3, the prize line, and "on <horse>" in payouts). Use `horseName` in the `names` map passed to `RaceView`.
  - **Colours:** pass `colors={colorsByPlayer(players)}` to `RaceView`.
- [ ] **Step 3:** typecheck, lint, test and build. Commit: `git add src/track && git commit -m "feat(track): office big screen unlock, admin-managed roster, horse names and colours"`

---

### Task 11: Home and /admin

**Files:** Create `src/admin/AdminPage.tsx`. Modify `src/app/App.tsx`, `src/app/Home.tsx`, `src/app/app.css`.

- [ ] **Step 1: Home.** Replace the Office "Coming soon." section with the block below, and import `OFFICE_CODE` from `../lobby/lobby.ts`:

```tsx
      <section>
        <h2>Office</h2>
        <p>
          <a className="button primary" href={`/track?code=${OFFICE_CODE}`}>
            Office big screen
          </a>{' '}
          <a className="button" href={`/play?code=${OFFICE_CODE}`}>
            Join the office race (phone)
          </a>
        </p>
        <p>
          <a href="/admin">Admin</a>
        </p>
      </section>
```

  Add to `app.css`:

```css
a.button {
  display: inline-block;
  padding: 8px 16px;
  border: 1px solid currentColor;
  border-radius: 4px;
  text-decoration: none;
  color: inherit;
}
a.button.primary {
  font-size: 1.25rem;
  padding: 12px 24px;
}
```

- [ ] **Step 2: Route.** In `App.tsx`, add `case '/admin': return <AdminPage />;` and import it.
- [ ] **Step 3: AdminPage.** Create `src/admin/AdminPage.tsx`:

```tsx
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminAction, errorText } from '../net/rooms.ts';

type Member = {
  id: string;
  name: string;
  horse_name: string | null;
  balance: number;
  has_pin: boolean;
  phone: boolean;
  archived: boolean;
};
type RaceRow = {
  id: string;
  created_at: string;
  length: string;
  prize: string;
  horses: number;
  finished: boolean;
  current: boolean;
};
type Overview = { room: { phase: string }; members: Member[]; races: RaceRow[] };

const KEY = 'hrtc-admin';
const loadPassword = () => {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};
const storePassword = (v: string) => {
  try {
    if (v) sessionStorage.setItem(KEY, v);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): the password is just asked again next time.
  }
};

/** /admin (spec §10): people, PINs, coins and races. The password stays in this tab only. */
export function AdminPage() {
  const [password, setPassword] = useState(loadPassword);
  const [typed, setTyped] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');

  const lock = () => {
    storePassword('');
    setPassword('');
    setData(null);
  };
  const refresh = useCallback(
    (pw: string) =>
      adminAction<Overview>(pw, 'overview').then(setData, (e: unknown) => {
        setError(errorText(e));
        if (e instanceof Error && e.message === 'bad_password') {
          storePassword('');
          setPassword('');
        }
      }),
    [],
  );

  useEffect(() => {
    if (password) void refresh(password);
  }, [password, refresh]);

  const run = (action: string, args: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    adminAction(password, action, args)
      .then(
        () => refresh(password),
        (e: unknown) => setError(errorText(e)),
      )
      .finally(() => setBusy(false));
  };

  if (!password) {
    const open = (e: FormEvent) => {
      e.preventDefault();
      storePassword(typed);
      setPassword(typed);
    };
    return (
      <main>
        <h1>Admin</h1>
        <form onSubmit={open}>
          <label>
            Admin password{' '}
            <input
              type="password"
              value={typed}
              autoComplete="current-password"
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>{' '}
          <button type="submit" disabled={!typed}>
            Open
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  }

  const add = (e: FormEvent) => {
    e.preventDefault();
    run('add', { name: newName });
    setNewName('');
  };
  const rename = (m: Member) => {
    const name = window.prompt(`New name for ${m.name}`, m.name);
    if (name && name !== m.name) run('rename', { player: m.id, name });
  };
  const adjust = (m: Member) => {
    const amount = Number(window.prompt(`Coins to add to ${m.name} (negative to take away)`, '0'));
    if (!Number.isInteger(amount) || amount === 0) return;
    const reason = window.prompt('Reason (required)');
    if (reason) run('adjust', { player: m.id, amount, reason });
  };

  return (
    <main>
      <h1>Admin</h1>
      <p>
        Office phase: {data?.room.phase ?? '…'}{' '}
        <button type="button" onClick={lock}>
          Lock
        </button>
      </p>
      <h2>People</h2>
      <form onSubmit={add}>
        <input
          aria-label="New member name"
          placeholder="Name"
          maxLength={24}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />{' '}
        <button type="submit" disabled={busy || !newName.trim()}>
          Add person
        </button>
      </form>
      <table className="odds">
        <thead>
          <tr>
            <th>Name</th>
            <th>Coins</th>
            <th>PIN</th>
            <th>Phone</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data?.members.map((m) => (
            <tr key={m.id}>
              <td>
                {m.name}
                {m.horse_name && ` (🐎 ${m.horse_name})`}
                {m.archived && ' — removed'}
              </td>
              <td>{m.balance}</td>
              <td>{m.has_pin ? 'set' : '—'}</td>
              <td>{m.phone ? '📱' : ''}</td>
              <td>
                <button type="button" disabled={busy} onClick={() => rename(m)}>
                  Rename
                </button>{' '}
                <button type="button" disabled={busy} onClick={() => adjust(m)}>
                  Coins
                </button>{' '}
                {!m.archived && (
                  <>
                    <button
                      type="button"
                      disabled={busy || !m.has_pin}
                      onClick={() => window.confirm(`Reset ${m.name}'s PIN?`) && run('reset_pin', { player: m.id })}
                    >
                      Reset PIN
                    </button>{' '}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        window.confirm(`Remove ${m.name}? Their history stays.`) && run('archive', { player: m.id })
                      }
                    >
                      Remove
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Recent races</h2>
      <ul>
        {data?.races.map((r) => (
          <li key={r.id}>
            {new Date(r.created_at).toLocaleString()} · {r.length} · {r.horses} horses
            {r.prize && ` · ${r.prize}`} · {r.current ? 'in progress' : r.finished ? 'finished' : 'not run'}{' '}
            {!r.current && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  window.confirm('Delete this race? Its bets, payouts and coins are reversed.') &&
                  run('delete_race', { race: r.id })
                }
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 4:** typecheck, lint, test and build. Commit: `git add src/admin src/app && git commit -m "feat(admin): /admin page and office links on the home page"`

---

### Task 12: Smoke test, docs, hosted deploy

- [ ] **Step 1: Local smoke test.**
  - **Setup:** big screen on `http://localhost:5173`; phones on `127.0.0.1`, `a.localhost` and `b.localhost`, each its own device.
  - **Admin:** open `/admin` with the local password and add Ali, Bea, Cal and Dan. Expect balance 100 each.
  - **Big screen:** Home → Office big screen → unlock with the password. Expect the lobby with balances and no add/remove controls.
  - **Phones:** each goes to `/play?code=TURF`.
    - Ali, Bea and Cal pick their name and set a PIN.
    - Ali sets a coat, a silk and the horse name "Thunder"; the big-screen roster updates.
    - Expect: a wrong PIN shows "Wrong PIN"; after 5 wrong, the name is locked.
  - **Race 1:**
    - Tick Ali, Bea, Cal and Dan (Dan has no phone) → Open shop. Expect: each racer at 200.
    - Ali buys a box, Cal bets.
    - Lock odds → Start. Expect Thunder in Ali's colours on the track, standings and mini oval.
    - Podium → Next race.
  - **Carry-over:** expect balances to carry over, with ledger arithmetic matching. In the second race, expect the previous winner's odds to shift (history).
  - **Admin actions:**
    - Adjust Bea +25 "test" → her phone balance updates.
    - Reset Cal's PIN → Cal sets a new one.
    - Remove Dan → gone from the roster.
    - Delete race 1 → its coins reverse.
  - **Second screen:** unlocking on a second screen takes over; the first falls back to the unlock form.
  - **Console:** no errors except the known `bad_name` probe.
- [ ] **Step 2:** All checks: `npm test`, `npm run test:db`, typecheck, lint, build.
- [ ] **Step 3: Docs.**
  - **README:** Office mode setup:
    - `supabase/functions/.env` holds `ADMIN_PASSWORD` locally; note the loading method that worked in Task 6.
    - Hosted: the owner runs `npx supabase secrets set ADMIN_PASSWORD=…`.
    - `/admin`, and the office code `TURF`.
  - **PROJECT_STATUS:** tick Phase 5, add a log entry, decisions and deferred items. Deferred:
    - First login can claim an unclaimed name.
    - Admin-password guessing is slowed only by the 1 s delay.
    - No last-5 form yet.
    - The office ledger grows forever (fine: `room_balances` sums per member).
    - Then set "Next: Phase 6".
- [ ] **Step 4:** `git add README.md PROJECT_STATUS.md && git commit -m "docs: Phase 5 status and notes"`
- [ ] **Step 5: Hosted (after merge, with the owner).**
  - The owner sets the secret themselves: `npx supabase secrets set ADMIN_PASSWORD=<their password>`.
  - Then `npx supabase db push --linked` (4 new migrations) and `npx supabase functions deploy admin lock-odds start-race`.
  - Push `master`, and Vercel builds.
  - Hosted check: `/admin` overview loads, the office big screen unlocks, and one phone signs in.
