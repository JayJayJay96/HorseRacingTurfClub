# Phase 6 — History & Fun Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Office remembers its races.
- A `/stats` page shows:
  - leaderboards: richest, biggest single payout, biggest loss in one race, best betting profit;
  - horse records: races, wins, places, win %, last 5;
  - all 10 badges from the spec;
  - recent races, each with a **Replay** button.
- Three small touches on the game screens:
  - last-5 form on the odds board;
  - top-3 richest on the office lobby;
  - your own record and badges on your phone.

**Architecture:**

- **No new history to collect.** Races, bets, the coin ledger and race timelines are already stored.
  - One `office_stats()` RPC returns everything as one JSON object, for office members and the host only.
  - It skips the race being run until its podium, so nothing on the page spoils it.
- **Badges** are rows in a new `badges` table, one per member per badge (each is earned once).
  - They are awarded in `start_race_finish`, in the same transaction as the payouts.
  - Five badges need the race events: photo finish, comeback, Banana King, untouchable, sniper.
    - A new pure `src/sim/awards.ts` works them out from the Timeline in the `start-race` Edge Function.
    - It passes them in through a new `p_awards` argument.
  - The other five come from SQL: first win, hat-trick, long shot, big spender, broke.
- **Timelines are kept 90 days.** `cleanup_rooms` deletes older office timelines; results stay forever.

**Tech Stack:** Supabase Postgres + Edge Functions (Deno), React 19, TypeScript strict, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-horse-racing-turf-club-design.md` §7 ("last-5 form" on the odds board), §9 (history and badges).

---

## Scope decisions (read first)

- **Owner decisions (2026-11-04):** all 10 badges; a `/stats` page plus small touches on the game screens.
- **Office only.** Private rooms are temporary (spec §2), so they get no badges and no stats.
- **Badge rules:**
  - `first_win`: won an office race.
  - `hat_trick`: won this race and the horse's previous 2 finished office races.
  - `photo_finish`: won by less than 0.2 s.
  - `comeback`: won, and was last at half the winner's finish time. This is a time-based "halfway"; document it in code.
  - `banana_king`: most attacks landed in the race (`hit` events as sender), at least 2. Ties all get it.
  - `untouchable`: won without being hit.
  - `long_shot`: a winning bet at 10× or more. It goes to the bettor.
  - `big_spender`: bought 3 boxes in a race, in 5 different races.
  - `broke`: got a `floor` top-up, meaning the balance was lifted to 50.
  - `sniper`: landed a Golden Lasso (an `attack:leader` hit).
- **Each badge is earned once per member** (`unique (player_id, badge)`) and keeps the race it was first earned in. Deleting that race in `/admin` removes the badge (`on delete cascade`), the same way its coins are reversed.
- **Spoilers:**
  - Badges and payouts are written at Start, as now.
  - `office_stats` hides the current race until the room reaches PODIUM, and hides its badges too.
  - The database already lets members read results during a race; that has been deferred since Phase 3.
- **`start_race_finish` gets a 5th argument, `p_awards jsonb default '{}'`.**
  - The migration **drops** the old function and creates the new one; otherwise Postgres would treat it as an overload.
  - The default keeps 4-argument calls working, so the live `start-race` keeps working between the DB push and the function deploy.
  - The function only inserts badges for horses actually in the race.
- **Leaderboards show active members only.** Archived members drop off; their history stays in the database.
- **Replay** plays a stored timeline with the existing `RaceView`. Races older than 90 days get no Replay button.
- **Not in this phase:** sound and commentator (Phase 7). Cheers are still deferred; they could go with Phase 7.

## File structure

```
src/sim/awards.ts (+test)            NEW  EVENT_BADGES, raceAwards(timeline)
supabase/migrations/20261104000013_history.sql  NEW  badges table, start_race_finish v2 (+p_awards, SQL badges),
                                                     cleanup_rooms v3 (90-day timelines), office_stats()
supabase/functions/start-race/index.ts  MOD  passes p_awards
tests/db/officeFixtures.ts           MOD  officeRace(), badgesOf()
tests/db/history.test.ts             NEW
src/net/database.types.ts            REGEN
src/net/stats.ts                     NEW  OfficeStats type, fetchOfficeStats, useOfficeStats(key, enabled)
src/history/badges.ts (+test)        NEW  BADGES (name, icon, description), formatForm
src/history/StatsPage.tsx            NEW  /stats: leaderboards, horses, badges, recent races + replay
src/app/App.tsx, src/app/Home.tsx, src/app/app.css   MOD  /stats route + link + styles
src/track/TrackPage.tsx              MOD  office lobby top-3 richest + /stats link; odds board Form column
src/play/PlayPage.tsx                MOD  office lobby: my record and badges
README.md, PROJECT_STATUS.md         MOD
```

---

### Task 0: Branch

- [ ] Branch `phase6-history` already exists (cut from `master`). Add this checklist after the 2026-11-04 entry in `PROJECT_STATUS.md`:

```markdown
## Phase 6 — History & fun (branch `phase6-history`)

- [x] Task 0: Branch
- [ ] Task 1: Event badges (pure)
- [ ] Task 2: Badges table and awarding at Start
- [ ] Task 3: office_stats and 90-day timelines
- [ ] Task 4: start-race passes awards
- [ ] Task 5: Client stats library and badge labels
- [ ] Task 6: /stats page with replays
- [ ] Task 7: Game-screen touches
- [ ] Task 8: Smoke test, docs, deploy
```

- [ ] `git add PROJECT_STATUS.md docs/superpowers/plans/2026-11-04-phase6-history.md && git commit -m "docs: Phase 6 plan"`

---

### Task 1: Event badges (pure)

**Files:** Create `src/sim/awards.ts`, `src/sim/awards.test.ts`

- [ ] **Step 1: Failing tests.** Create `src/sim/awards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { raceAwards } from './awards.ts';
import { fakeTimeline } from './testTimeline.ts';
import type { ItemCode, RaceEvent, Timeline } from './types.ts';

const hit = (t: number, by: string, horse: string, item: ItemCode): RaceEvent => ({
  t,
  type: 'hit',
  by,
  horse,
  item,
});

describe('raceAwards', () => {
  it('photo finish: won by less than 0.2 s', () => {
    expect(raceAwards(fakeTimeline({ a: 10, b: 9.95 })).photo_finish).toEqual(['a']);
    expect(raceAwards(fakeTimeline({ a: 10, b: 5 })).photo_finish).toEqual([]);
  });

  it('untouchable: the winner was never hit', () => {
    expect(raceAwards(fakeTimeline({ a: 10, b: 5 })).untouchable).toEqual(['a']);
    const hitWinner = fakeTimeline({ a: 10, b: 5 }, 100, [hit(1, 'b', 'a', 'attack:front1')]);
    expect(raceAwards(hitWinner).untouchable).toEqual([]);
  });

  it('banana king: most hits landed, at least 2, ties share it', () => {
    const events = [
      hit(1, 'b', 'a', 'attack:front1'),
      hit(2, 'b', 'c', 'attack:behind1'),
      hit(3, 'c', 'a', 'attack:front1'),
    ];
    expect(raceAwards(fakeTimeline({ a: 10, b: 9, c: 8 }, 100, events)).banana_king).toEqual(['b']);
    const tie = [...events, hit(4, 'c', 'b', 'attack:front1')];
    expect(raceAwards(fakeTimeline({ a: 10, b: 9, c: 8 }, 100, tie)).banana_king.sort()).toEqual(['b', 'c']);
    const one = [hit(1, 'b', 'a', 'attack:front1')];
    expect(raceAwards(fakeTimeline({ a: 10, b: 9 }, 100, one)).banana_king).toEqual([]);
  });

  it('sniper: landed a Golden Lasso', () => {
    const events = [hit(1, 'c', 'a', 'attack:leader'), hit(2, 'c', 'b', 'attack:leader')];
    expect(raceAwards(fakeTimeline({ a: 10, b: 9, c: 8 }, 100, events)).sniper).toEqual(['c']);
  });

  it('comeback: the winner was last at half its finish time', () => {
    // a crawls for 5 s, then sprints; b runs steadily and finishes second.
    const ticks = 106;
    const a = Array.from({ length: ticks }, (_, i) => {
      const t = i / 10;
      return Math.min(100, t < 5 ? 2 * t : 10 + 18 * (t - 5));
    });
    const b = Array.from({ length: ticks }, (_, i) => Math.min(100, 9.6 * (i / 10)));
    const tl: Timeline = {
      ...fakeTimeline({ a: 10, b: 9.6 }),
      progress: { a, b },
      finishOrder: ['a', 'b'],
      finishTimes: { a: 10, b: 100 / 9.6 },
    };
    expect(raceAwards(tl).comeback).toEqual(['a']);
    expect(raceAwards(fakeTimeline({ a: 10, b: 5 })).comeback).toEqual([]);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/sim/awards.test.ts`. It should FAIL, because the module doesn't exist yet.
- [ ] **Step 3: Implement** `src/sim/awards.ts`. Keep it pure and Deno-safe, with `.ts` imports:

```ts
import { standingsAt } from './playback.ts';
import type { HorseId, RaceEvent, Timeline } from './types.ts';

/** Spec §9 badges only the race itself can tell; the rest come from results, bets and coins in SQL. */
export const EVENT_BADGES = ['photo_finish', 'comeback', 'banana_king', 'untouchable', 'sniper'] as const;
export type EventBadge = (typeof EVENT_BADGES)[number];

export const PHOTO_FINISH_SECONDS = 0.2;
export const BANANA_KING_MIN_HITS = 2;

type Hit = Extract<RaceEvent, { type: 'hit' }>;
const isHit = (e: RaceEvent): e is Hit => e.type === 'hit';

export function raceAwards(timeline: Timeline): Record<EventBadge, HorseId[]> {
  const awards: Record<EventBadge, HorseId[]> = {
    photo_finish: [],
    comeback: [],
    banana_king: [],
    untouchable: [],
    sniper: [],
  };
  const [winner, second] = timeline.finishOrder;
  if (winner === undefined) return awards;
  const won = timeline.finishTimes[winner]!;
  if (second !== undefined && timeline.finishTimes[second]! - won < PHOTO_FINISH_SECONDS) {
    awards.photo_finish.push(winner);
  }
  // "Last at halfway" uses half the winner's time, not half the distance: simple and close enough.
  const atHalf = standingsAt(timeline, won / 2);
  if (atHalf.length > 1 && atHalf[atHalf.length - 1] === winner) awards.comeback.push(winner);

  const hits = timeline.events.filter(isHit);
  if (!hits.some((e) => e.horse === winner)) awards.untouchable.push(winner);
  const landed = new Map<HorseId, number>();
  for (const e of hits) landed.set(e.by, (landed.get(e.by) ?? 0) + 1);
  const most = Math.max(0, ...landed.values());
  if (most >= BANANA_KING_MIN_HITS) {
    for (const [horse, n] of landed) if (n === most) awards.banana_king.push(horse);
  }
  for (const e of hits) {
    if (e.item === 'attack:leader' && !awards.sniper.includes(e.by)) awards.sniper.push(e.by);
  }
  return awards;
}
```

- [ ] **Step 4:** Run the tests and confirm they pass. Then run `npm test`, `npm run typecheck` and `npm run lint`.
- [ ] **Step 5:** `git add src/sim/awards.ts src/sim/awards.test.ts && git commit -m "feat(sim): event badges from the race timeline"`

---

### Task 2: Badges table and awarding at Start

**Files:**
- Create `supabase/migrations/20261104000013_history.sql`. Tasks 2 and 3 both add to it, with a commit after each.
- Modify `tests/db/officeFixtures.ts`.
- Create `tests/db/history.test.ts`.

- [ ] **Step 1: Fixtures.** Append to `tests/db/officeFixtures.ts`:

```ts
type Room = Awaited<ReturnType<typeof officeRoom>>;
type Horse = { player: { id: string } };

/**
 * Runs one office race with a fixed finish order: SHOP -> odds -> BETTING -> Start -> PODIUM -> LOBBY.
 * `shop` / `betting` hooks run in those phases (buy boxes, bet). `stopAt: 'RUNNING'` stops after Start.
 * Unticks the horses afterwards. Returns the race id.
 */
export async function officeRace(
  r: Room,
  horses: Horse[],
  finish: string[],
  opts: {
    odds?: Record<string, { win: number; place: number }>;
    shop?: () => Promise<unknown>;
    betting?: () => Promise<unknown>;
    awards?: Record<string, string[]>;
    stopAt?: 'RUNNING';
  } = {},
): Promise<string> {
  for (const h of horses) await ok(r.host.rpc('set_ticked', { p_player: h.player.id, p_ticked: true }));
  const shop = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
  await opts.shop?.();
  await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
  const odds = opts.odds ?? Object.fromEntries(horses.map((h) => [h.player.id, { win: 2, place: 1.1 }]));
  await ok(r.admin.rpc('lock_odds_finish', { p_race: shop.race_id, p_odds: odds }));
  await opts.betting?.();
  await ok(r.host.rpc('start_race_begin', { p_room: r.room.id }));
  await ok(
    r.admin.rpc('start_race_finish', {
      p_race: shop.race_id,
      p_timeline: {},
      p_finish: finish,
      p_seconds: 0.01,
      p_awards: opts.awards ?? {},
    }),
  );
  if (opts.stopAt === 'RUNNING') return shop.race_id as string;
  await new Promise((res) => setTimeout(res, 50));
  await ok(r.host.rpc('finish_race', { p_room: r.room.id }));
  await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
  for (const h of horses) await ok(r.host.rpc('set_ticked', { p_player: h.player.id, p_ticked: false }));
  return shop.race_id as string;
}

/** Badge codes a member holds (service role), sorted. */
export async function badgesOf(playerId: string): Promise<string[]> {
  const rows = (await ok(adminClient().from('badges').select('badge').eq('player_id', playerId))) as {
    badge: string;
  }[];
  return rows.map((b) => b.badge).sort();
}
```

- [ ] **Step 2: Failing tests.** Create `tests/db/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { adminClient, anonClient, ok } from './helpers.ts';
import { badgesOf, member, officeRace, officeRoom } from './officeFixtures.ts';
import { bettingRoom } from './raceFixtures.ts';

describe('badges at Start', () => {
  it('first win, then a hat-trick after three wins in a row', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    await officeRace(r, [a, b], [a.player.id, b.player.id]);
    expect(await badgesOf(a.player.id)).toEqual(['first_win']);
    await officeRace(r, [a, b], [a.player.id, b.player.id]);
    expect(await badgesOf(a.player.id)).toEqual(['first_win']);
    await officeRace(r, [a, b], [a.player.id, b.player.id]);
    expect(await badgesOf(a.player.id)).toEqual(['first_win', 'hat_trick']);
    expect(await badgesOf(b.player.id)).toEqual([]);
  });

  it('long shot: a winning bet at 10x or more goes to the bettor', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const fan = await member('F');
    await officeRace(r, [a, b], [b.player.id, a.player.id], {
      odds: { [a.player.id]: { win: 1.2, place: 1.05 }, [b.player.id]: { win: 12, place: 4 } },
      betting: () =>
        ok(fan.client.rpc('place_bet', { p_room: r.room.id, p_horse: b.player.id, p_kind: 'win', p_stake: 5 })),
    });
    expect(await badgesOf(fan.player.id)).toEqual(['long_shot']);
  });

  it('broke: lifted to the floor; event badges only for horses in the race', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const poor = await member('P');
    const outsider = await member('X');
    await ok(r.admin.rpc('admin_adjust', { p_player: poor.player.id, p_amount: -95, p_reason: 'test' }));
    await officeRace(r, [a, b], [a.player.id, b.player.id], {
      awards: { photo_finish: [a.player.id], sniper: [b.player.id], banana_king: [outsider.player.id] },
    });
    expect(await badgesOf(poor.player.id)).toEqual(['broke']);
    expect(await badgesOf(a.player.id)).toEqual(['first_win', 'photo_finish']);
    expect(await badgesOf(b.player.id)).toEqual(['sniper']);
    expect(await badgesOf(outsider.player.id)).toEqual([]);
  });

  it('big spender: 3 boxes in 5 races', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const buy3 = async () => {
      for (let i = 0; i < 3; i++) await ok(a.client.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }));
    };
    for (let race = 1; race <= 5; race++) {
      await officeRace(r, [a, b], [b.player.id, a.player.id], { shop: buy3 });
      expect((await badgesOf(a.player.id)).includes('big_spender')).toBe(race === 5);
    }
  });

  it('Private races award nothing; deleting a race removes its badges', async () => {
    const p = await bettingRoom();
    await ok(p.host.rpc('start_race_begin', { p_room: p.room.id }));
    await ok(
      adminClient().rpc('start_race_finish', {
        p_race: p.raceId,
        p_timeline: {},
        p_finish: [p.ali.player.id, p.bea.player.id, p.siti.id, p.dan.id],
        p_seconds: 1,
        p_awards: { photo_finish: [p.ali.player.id] },
      }),
    );
    expect(await badgesOf(p.ali.player.id)).toEqual([]);

    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const race = await officeRace(r, [a, b], [a.player.id, b.player.id]);
    expect(await badgesOf(a.player.id)).toEqual(['first_win']);
    await ok(r.admin.rpc('admin_delete_race', { p_race: race }));
    expect(await badgesOf(a.player.id)).toEqual([]);
  });

  it('clients read badges of their own room only', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    await officeRace(r, [a, b], [a.player.id, b.player.id]);
    expect(await ok(b.client.from('badges').select('badge').eq('player_id', a.player.id))).toEqual([
      { badge: 'first_win' },
    ]);
    const stranger = await anonClient();
    expect(await ok(stranger.from('badges').select('badge').eq('player_id', a.player.id))).toEqual([]);
  });
});
```

- [ ] **Step 3:** Run `npx vitest run --config vitest.db.config.ts tests/db/history.test.ts`. It should FAIL, because there is no `badges` table and no `p_awards` argument yet.
- [ ] **Step 4: Migration, part 1.** First grep `start_race_finish` in `supabase/migrations` and read its latest definition. It is `20261030000006_race_flow.sql` unless a later migration replaced it. Keep its body exactly and only **add** the office block. Then create `supabase/migrations/20261104000013_history.sql`:

```sql
-- Phase 6: history & fun (spec §9). Badges are awarded at Start, in the same transaction as payouts.

create table public.badges (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.room_players (id) on delete cascade,
  badge text not null check (badge in (
    'first_win', 'hat_trick', 'photo_finish', 'comeback', 'banana_king',
    'untouchable', 'long_shot', 'big_spender', 'broke', 'sniper')),
  -- The race it was first earned in; deleting that race (admin) removes the badge.
  race_id uuid references public.races (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (player_id, badge)
);
create index badges_room_id_idx on public.badges (room_id);
revoke all on public.badges from anon, authenticated;
grant select on public.badges to authenticated;
alter table public.badges enable row level security;
create policy "members read badges" on public.badges
  for select to authenticated using (private.is_room_member(room_id));

-- v2: + p_awards (event badges from src/sim/awards.ts) and the SQL badges. Dropped and recreated so the
-- new argument doesn't become an overload; the default keeps 4-argument callers working.
drop function public.start_race_finish(uuid, jsonb, uuid[], numeric);
create function public.start_race_finish(
  p_race uuid, p_timeline jsonb, p_finish uuid[], p_seconds numeric, p_awards jsonb default '{}'
)
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

  if v_room.kind = 'office' then
    -- Event badges computed from the timeline, only for horses in this race.
    insert into public.badges (room_id, player_id, badge, race_id)
    select v_room.id, h.horse::uuid, a.key, p_race
    from jsonb_each(coalesce(p_awards, '{}'::jsonb)) a
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(a.value) = 'array' then a.value else '[]'::jsonb end) h(horse)
    where a.key in ('photo_finish', 'comeback', 'banana_king', 'untouchable', 'sniper')
      and h.horse::uuid = any (v_race.horses)
    on conflict do nothing;
    -- First win.
    insert into public.badges (room_id, player_id, badge, race_id)
    values (v_room.id, p_finish[1], 'first_win', p_race)
    on conflict do nothing;
    -- Hat-trick: this win and the winner's previous two finished office races.
    if (select count(*) = 2 and bool_and(o.finish_order[1] = p_finish[1])
        from (select finish_order from public.races
              where room_id = v_room.id and id <> p_race and finish_order is not null
                and p_finish[1] = any (horses)
              order by started_at desc limit 2) o) then
      insert into public.badges (room_id, player_id, badge, race_id)
      values (v_room.id, p_finish[1], 'hat_trick', p_race)
      on conflict do nothing;
    end if;
    -- Long shot: a winning bet at 10x or more.
    insert into public.badges (room_id, player_id, badge, race_id)
    select distinct v_room.id, player_id, 'long_shot', p_race
    from public.bets where race_id = p_race and payout > 0 and odds >= 10
    on conflict do nothing;
    -- Big spender: 3 boxes in a race, in 5 races (this one included).
    insert into public.badges (room_id, player_id, badge, race_id)
    select v_room.id, p.player_id, 'big_spender', p_race
    from (select player_id from public.purchases where race_id = p_race
          group by player_id having count(*) >= 3) p
    where (select count(*) from (
             select pu.race_id from public.purchases pu join public.races r on r.id = pu.race_id
             where pu.player_id = p.player_id and r.room_id = v_room.id
             group by pu.race_id having count(*) >= 3) full_races) >= 5
    on conflict do nothing;
    -- Broke: lifted to the 50-coin floor for this race.
    insert into public.badges (room_id, player_id, badge, race_id)
    select distinct v_room.id, player_id, 'broke', p_race
    from public.coin_ledger where race_id = p_race and type = 'floor'
    on conflict do nothing;
  end if;

  update public.room_players set ready = false where room_id = v_room.id and ready;
  update public.rooms set phase = 'RUNNING', last_activity_at = now() where id = v_room.id;
end;
$$;
revoke execute on function public.start_race_finish(uuid, jsonb, uuid[], numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.start_race_finish(uuid, jsonb, uuid[], numeric, jsonb) to service_role;
```

- [ ] **Step 5:** `npx supabase db reset`, then `npm run test:db`. Old and new tests must all pass; the realtime test may need one rerun right after a reset.
- [ ] **Step 6:** `git add supabase/migrations/20261104000013_history.sql tests/db/officeFixtures.ts tests/db/history.test.ts && git commit -m "feat(db): badges, awarded at Start"`

---

### Task 3: office_stats and 90-day timelines

**Files:** Modify `supabase/migrations/20261104000013_history.sql` (append) and `tests/db/history.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `tests/db/history.test.ts`:

```ts
type Stats = {
  members: { id: string; name: string }[];
  richest: { id: string; value: number }[];
  biggest_payout: { id: string; value: number }[];
  biggest_loss: { id: string; value: number }[];
  best_profit: { id: string; value: number }[];
  horses: { id: string; races: number; wins: number; places: number; last5: number[] }[];
  badges: { id: string; badge: string }[];
  recent: { race: string; podium: string[]; replay: boolean }[];
};

describe('office_stats', () => {
  it('is null for non-members and the full picture for members', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const fan = await member('F');
    const box = (kind: string) => ok(b.client.rpc('buy_box', { p_room: r.room.id, p_box: kind }));
    await officeRace(r, [a, b], [a.player.id, b.player.id], {
      // B spends 60 + 35 + 20 = 115 and wins nothing: the biggest loss in one race.
      shop: async () => {
        await box('speed');
        await box('defense');
        await box('attack');
      },
      betting: () =>
        ok(fan.client.rpc('place_bet', { p_room: r.room.id, p_horse: a.player.id, p_kind: 'win', p_stake: 30 })),
    });
    await officeRace(r, [a, b], [b.player.id, a.player.id]);

    const stranger = await anonClient();
    expect(await ok(stranger.rpc('office_stats'))).toBeNull();

    const s = (await ok(fan.client.rpc('office_stats'))) as Stats;
    expect(s.members.map((m) => m.id)).toEqual(
      expect.arrayContaining([a.player.id, b.player.id, fan.player.id]),
    );
    expect(s.horses.find((h) => h.id === a.player.id)).toEqual({
      id: a.player.id,
      races: 2,
      wins: 1,
      places: 2,
      last5: [2, 1],
    });
    expect(s.biggest_payout).toContainEqual(expect.objectContaining({ id: fan.player.id, value: 60 }));
    expect(s.best_profit).toContainEqual(expect.objectContaining({ id: fan.player.id, value: 30 }));
    expect(s.biggest_loss).toContainEqual(expect.objectContaining({ id: b.player.id, value: 115 }));
    expect(s.badges).toContainEqual(expect.objectContaining({ id: a.player.id, badge: 'first_win' }));
    expect(s.recent[0]).toMatchObject({ podium: [b.player.id, a.player.id], replay: true });
  });

  it('hides the race being run until its podium', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    await officeRace(r, [a, b], [a.player.id, b.player.id], { stopAt: 'RUNNING' });
    const running = (await ok(a.client.rpc('office_stats'))) as Stats;
    expect(running.horses.find((h) => h.id === a.player.id)).toBeUndefined();
    expect(running.badges.filter((x) => x.id === a.player.id)).toEqual([]);
    await new Promise((res) => setTimeout(res, 50));
    await ok(r.host.rpc('finish_race', { p_room: r.room.id }));
    const podium = (await ok(a.client.rpc('office_stats'))) as Stats;
    expect(podium.horses.find((h) => h.id === a.player.id)?.wins).toBe(1);
  });

  it('cleanup keeps results forever but timelines only 90 days', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const race = await officeRace(r, [a, b], [a.player.id, b.player.id]);
    const admin = adminClient();
    await ok(
      admin.from('races').update({ started_at: new Date(Date.now() - 91 * 864e5).toISOString() }).eq('id', race),
    );
    await ok(admin.rpc('cleanup_rooms'));
    expect(await ok(admin.from('race_timelines').select('race_id').eq('race_id', race))).toEqual([]);
    expect(await ok(admin.from('races').select('id').eq('id', race))).toHaveLength(1);
  });
});
```

  The coin amounts in the first test:
  - The fan bets 30 on A to win at 2×, so the payout is 60 and the profit 30.
  - B buys three boxes for 115 and lands no bets, so B's net for race 1 is −115.
  - Members from earlier tests in the same file have smaller amounts, so these values stay in the top 5.

- [ ] **Step 2:** Run the tests. They should FAIL.
- [ ] **Step 3: Migration, part 2.** Append to `supabase/migrations/20261104000013_history.sql`:

```sql
-- v3: Private rooms expire after 24 h; office race timelines (replays) after 90 days. Results stay.
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
  delete from public.race_timelines t using public.races r
    where r.id = t.race_id and r.started_at < now() - interval '90 days';
  return v_count;
end;
$$;

-- Everything /stats shows, in one call. Null unless the caller is in the office (member or host).
-- The race being run is left out until its podium, so nothing here spoils it.
create function public.office_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where kind = 'office';
  if not found or not private.is_room_member(v_room.id) then
    return null;
  end if;
  return (
    with
    fin as (
      select r.* from public.races r
      where r.room_id = v_room.id and r.finish_order is not null
        and (r.id is distinct from v_room.race_id or v_room.phase = 'PODIUM')
    ),
    runs as (
      select f.id as race_id, f.started_at, h.horse, h.pos::int as pos
      from fin f cross join lateral unnest(f.finish_order) with ordinality as h(horse, pos)
    ),
    members as (
      select p.id, p.name, p.horse_name, p.coat, p.silk
      from public.room_players p where p.room_id = v_room.id and p.archived_at is null
    ),
    race_net as (
      select l.player_id, l.race_id, sum(l.amount)::int as net
      from public.coin_ledger l join fin f on f.id = l.race_id
      where l.type in ('purchase', 'bet', 'unbet', 'payout')
      group by l.player_id, l.race_id
    )
    select jsonb_build_object(
      'members', coalesce((select jsonb_agg(to_jsonb(m) order by lower(m.name)) from members m), '[]'::jsonb),
      'richest', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'value', x.balance) order by x.balance desc)
        from (select m.id, private.balance(null, m.id) as balance from members m
              order by 2 desc limit 10) x), '[]'::jsonb),
      'biggest_payout', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.player_id, 'value', x.payout, 'at', x.started_at)
                         order by x.payout desc)
        from (select b.player_id, b.payout, f.started_at
              from public.bets b join fin f on f.id = b.race_id join members m on m.id = b.player_id
              where b.payout > 0 order by b.payout desc limit 5) x), '[]'::jsonb),
      'biggest_loss', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.player_id, 'value', -x.net, 'at', x.started_at)
                         order by x.net)
        from (select n.player_id, n.net, f.started_at
              from race_net n join fin f on f.id = n.race_id join members m on m.id = n.player_id
              where n.net < 0 order by n.net limit 5) x), '[]'::jsonb),
      'best_profit', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.player_id, 'value', x.profit) order by x.profit desc)
        from (select b.player_id, sum(b.payout - b.stake)::int as profit
              from public.bets b join fin f on f.id = b.race_id join members m on m.id = b.player_id
              group by b.player_id having sum(b.payout - b.stake) > 0
              order by 2 desc limit 5) x), '[]'::jsonb),
      'horses', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'races', s.races, 'wins', s.wins, 'places', s.places, 'last5', s.last5)
               order by s.wins desc, s.races desc)
        from members m
        cross join lateral (
          select count(*)::int as races,
                 count(*) filter (where r.pos = 1)::int as wins,
                 count(*) filter (where r.pos <= 3)::int as places,
                 coalesce((select jsonb_agg(l.pos order by l.started_at desc)
                           from (select pos, started_at from runs r2 where r2.horse = m.id
                                 order by started_at desc limit 5) l), '[]'::jsonb) as last5
          from runs r where r.horse = m.id) s
        where s.races > 0), '[]'::jsonb),
      'badges', coalesce((
        select jsonb_agg(jsonb_build_object('id', b.player_id, 'badge', b.badge, 'at', b.created_at)
                         order by b.created_at desc)
        from public.badges b join members m on m.id = b.player_id
        where b.race_id is null or b.race_id in (select id from fin)), '[]'::jsonb),
      'recent', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'race', x.id, 'at', x.started_at, 'prize', x.prize, 'length', x.length,
                 'podium', to_jsonb(x.finish_order[1:3]), 'replay', x.replay)
               order by x.started_at desc)
        from (select f.*, exists (select 1 from public.race_timelines t where t.race_id = f.id) as replay
              from fin f order by f.started_at desc limit 15) x), '[]'::jsonb)
    )
  );
end;
$$;
revoke execute on function public.office_stats() from public, anon;
grant execute on function public.office_stats() to authenticated;
```

- [ ] **Step 4:** `npx supabase db reset && npm run test:db`. Everything must pass.
- [ ] **Step 5:** `git add supabase/migrations/20261104000013_history.sql tests/db/history.test.ts && git commit -m "feat(db): office_stats and 90-day replays"`

---

### Task 4: start-race passes awards

**Files:** Modify `supabase/functions/start-race/index.ts` and `tests/db/functions.test.ts`.

- [ ] **Step 1:** In `start-race/index.ts`, import `raceAwards` from `'../../../src/sim/awards.ts'`. Then add `p_awards: raceAwards(timeline),` to the `start_race_finish` call.
- [ ] **Step 2: Test.** Append a test to `tests/db/functions.test.ts`, using `officeRoom` and `member`:
  - Run a real office race through `lock-odds` and `start-race` (`invoke`).
  - Assert the winner, read from `races.finish_order[0]`, holds `first_win` via `adminClient().from('badges')`.
  - Don't assert the event badges here; they are random. The unit tests cover them.
- [ ] **Step 3:** `src/sim/awards.ts` is a new file the function imports, so restart the stack: `npx supabase stop && npx supabase start` (data is kept). On a 503, run `docker restart supabase_edge_runtime_HorseRacingTurfClub`. Then `npm run test:db`.
- [ ] **Step 4:** `git add supabase/functions/start-race/index.ts tests/db/functions.test.ts && git commit -m "feat(start-race): award event badges from the timeline"`

---

### Task 5: Client stats library and badge labels

**Files:** Regenerate `src/net/database.types.ts`. Create `src/net/stats.ts`, `src/history/badges.ts`, `src/history/badges.test.ts`.

- [ ] **Step 1:** `npx supabase gen types typescript --local > src/net/database.types.ts`, then run Prettier on that file.
- [ ] **Step 2: Failing test** `src/history/badges.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BADGES, formatForm } from './badges.ts';

describe('badges', () => {
  it('labels all 10 badges', () => {
    expect(Object.keys(BADGES)).toHaveLength(10);
    for (const b of Object.values(BADGES)) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.icon.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
    }
  });

  it('formats last-5 form newest first, places 10+ as 0', () => {
    expect(formatForm([1, 3, 2])).toBe('1-3-2');
    expect(formatForm([12, 1])).toBe('0-1');
    expect(formatForm([])).toBe('–');
  });
});
```

- [ ] **Step 3: Implement** `src/history/badges.ts`:

```ts
/** Spec §9 badges (luck, not skill). Codes match the badges table check constraint. */
export const BADGES = {
  first_win: { icon: '🥇', name: 'First Win', description: 'Won an office race.' },
  hat_trick: { icon: '🎩', name: 'Hat-trick', description: 'Won three races in a row.' },
  photo_finish: { icon: '📸', name: 'Photo Finish', description: 'Won by less than 0.2 s.' },
  comeback: { icon: '🔄', name: 'Comeback', description: 'Last at halfway, then won.' },
  banana_king: { icon: '🍌', name: 'Banana King', description: 'Landed the most attacks in a race.' },
  untouchable: { icon: '🫥', name: 'Untouchable', description: 'Won without being hit.' },
  long_shot: { icon: '🎯', name: 'Long Shot', description: 'Won a bet at 10× or more.' },
  big_spender: { icon: '💸', name: 'Big Spender', description: 'Bought 3 boxes in 5 races.' },
  broke: { icon: '🪙', name: 'Broke', description: 'Hit the 50-coin floor.' },
  sniper: { icon: '🪢', name: 'Sniper', description: 'Golden Lasso hit the leader.' },
} as const;
export type BadgeCode = keyof typeof BADGES;

/** Racing-form style: newest first, "0" for 10th or worse. */
export const formatForm = (last5: readonly number[]) =>
  last5.length === 0 ? '–' : last5.map((p) => (p >= 10 ? '0' : String(p))).join('-');
```

  Create `src/net/stats.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { BadgeCode } from '../history/badges.ts';
import { errorText } from './rooms.ts';
import { supabase } from './supabase.ts';

export type StatMember = {
  id: string;
  name: string;
  horse_name: string | null;
  coat: number | null;
  silk: number | null;
};
export type Ranked = { id: string; value: number; at?: string };
export type HorseRecord = { id: string; races: number; wins: number; places: number; last5: number[] };
export type OfficeStats = {
  members: StatMember[];
  richest: Ranked[];
  biggest_payout: Ranked[];
  biggest_loss: Ranked[];
  best_profit: Ranked[];
  horses: HorseRecord[];
  badges: { id: string; badge: BadgeCode; at: string }[];
  recent: { race: string; at: string; prize: string; length: string; podium: string[]; replay: boolean }[];
};

/** Null when this device isn't in the office (sign in on a phone, or unlock the big screen). */
export async function fetchOfficeStats(): Promise<OfficeStats | null> {
  const { data, error } = await supabase.rpc('office_stats');
  if (error) throw new Error(error.message);
  return (data ?? null) as unknown as OfficeStats | null; // jsonb built in SQL (office_stats)
}

/** Loads stats when `enabled`, again whenever `key` changes (e.g. the room phase). */
export function useOfficeStats(key: unknown = 0, enabled = true) {
  const [stats, setStats] = useState<OfficeStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(() => {
    fetchOfficeStats().then(
      (s) => {
        setStats(s);
        setError(null);
        setLoaded(true);
      },
      (e: unknown) => {
        setError(errorText(e));
        setLoaded(true);
      },
    );
  }, []);
  useEffect(() => {
    if (enabled) load();
  }, [load, key, enabled]);
  return { stats, error, loaded, reload: load };
}
```

- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run lint`. Then `git add src/net src/history && git commit -m "feat(net): office stats and badge labels"`

---

### Task 6: /stats page with replays

**Files:** Create `src/history/StatsPage.tsx`. Modify `src/app/App.tsx` (route `/stats`), `src/app/Home.tsx` (link), `src/app/app.css`.

- [ ] **Step 1:** Create `src/history/StatsPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { horseName } from '../betting/betting.ts';
import { OFFICE_CODE } from '../lobby/lobby.ts';
import { useOfficeStats, type OfficeStats, type Ranked } from '../net/stats.ts';
import { ensureSignedIn } from '../net/supabase.ts';
import { useTimeline } from '../net/useTimeline.ts';
import { colorsByPlayer } from '../render/palette.ts';
import { RaceView } from '../render/RaceView.tsx';
import { COUNTDOWN_SECONDS } from '../sim/playback.ts';
import { BADGES, formatForm } from './badges.ts';

/** /stats (spec §9): leaderboards, horse records, badges and replays for the office. */
export function StatsPage() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void ensureSignedIn().finally(() => setSignedIn(true));
  }, []);
  const { stats, error, loaded } = useOfficeStats(signedIn, signedIn);
  const [replay, setReplay] = useState<{ race: string; gun: number } | null>(null);

  if (!loaded) return <main>Loading…</main>;
  if (error) {
    return (
      <main>
        <p role="alert">{error}</p>
      </main>
    );
  }
  if (!stats) {
    return (
      <main>
        <h1>Office stats</h1>
        <p>
          Sign in first: on a phone via <a href={`/play?code=${OFFICE_CODE}`}>Join the office race</a>, or unlock
          the <a href={`/track?code=${OFFICE_CODE}`}>office big screen</a>.
        </p>
      </main>
    );
  }
  return (
    <main className="stats">
      <h1>Office stats</h1>
      {replay ? (
        <Replay stats={stats} race={replay.race} gun={replay.gun} onClose={() => setReplay(null)} />
      ) : (
        <Overview
          stats={stats}
          onReplay={(race) => setReplay({ race, gun: Date.now() + COUNTDOWN_SECONDS * 1000 })}
        />
      )}
    </main>
  );
}

function Overview({ stats, onReplay }: { stats: OfficeStats; onReplay: (race: string) => void }) {
  const byId = new Map(stats.members.map((m) => [m.id, m]));
  const who = (id: string) => byId.get(id)?.name ?? '?';
  const horse = (id: string) => {
    const m = byId.get(id);
    return m ? horseName(m) : '?';
  };
  const board = (title: string, rows: Ranked[]) => (
    <section>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p>Nobody yet.</p>
      ) : (
        <ol>
          {rows.map((r, i) => (
            <li key={`${r.id}-${i}`}>
              {who(r.id)} · {r.value} coins
            </li>
          ))}
        </ol>
      )}
    </section>
  );
  return (
    <>
      <div className="boards">
        {board('💰 Richest', stats.richest)}
        {board('🎉 Biggest single win', stats.biggest_payout)}
        {board('😬 Biggest loss in one race', stats.biggest_loss)}
        {board('📈 Best betting profit', stats.best_profit)}
      </div>

      <h2>Horses</h2>
      {stats.horses.length === 0 ? (
        <p>No races yet.</p>
      ) : (
        <div className="scroll-x">
          <table className="odds">
            <thead>
              <tr>
                <th>Horse</th>
                <th>Races</th>
                <th>Wins</th>
                <th>Places</th>
                <th>Win %</th>
                <th>Form</th>
              </tr>
            </thead>
            <tbody>
              {stats.horses.map((h) => (
                <tr key={h.id}>
                  <td>{horse(h.id)}</td>
                  <td>{h.races}</td>
                  <td>{h.wins}</td>
                  <td>{h.places}</td>
                  <td>{Math.round((100 * h.wins) / h.races)}%</td>
                  <td>{formatForm(h.last5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Badges</h2>
      {stats.badges.length === 0 ? (
        <p>None earned yet.</p>
      ) : (
        <ul className="badges">
          {stats.badges.map((b) => (
            <li key={`${b.id}-${b.badge}`} title={BADGES[b.badge].description}>
              {BADGES[b.badge].icon} {BADGES[b.badge].name} · {who(b.id)}
            </li>
          ))}
        </ul>
      )}

      <h2>Recent races</h2>
      {stats.recent.length === 0 ? (
        <p>No races yet.</p>
      ) : (
        <ul>
          {stats.recent.map((r) => (
            <li key={r.race}>
              {new Date(r.at).toLocaleString()} · {r.podium.map(horse).join(', ')}
              {r.prize && ` · ${r.prize}`}{' '}
              {r.replay && (
                <button type="button" onClick={() => onReplay(r.race)}>
                  Replay
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Replay(props: { stats: OfficeStats; race: string; gun: number; onClose: () => void }) {
  const { stats, race, gun, onClose } = props;
  const { timeline, error } = useTimeline(race);
  const names = useMemo(
    () => Object.fromEntries(stats.members.map((m) => [m.id, horseName(m)])),
    [stats.members],
  );
  const colors = useMemo(() => colorsByPlayer(stats.members), [stats.members]);
  return (
    <section>
      <button type="button" onClick={onClose}>
        ← Back to stats
      </button>
      {timeline ? (
        <RaceView timeline={timeline} startAtMs={gun} names={names} colors={colors} />
      ) : (
        <p>{error ?? 'Loading the replay…'}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Route, link, styles.**
  - In `App.tsx`, add `case '/stats': return <StatsPage />;`.
  - In `Home.tsx`, add `<a href="/stats">Stats</a>` to the Office section, next to Admin.
  - Append to `app.css`:

```css
.boards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.badges {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.badges li {
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 999px;
  padding: 4px 10px;
}
```

- [ ] **Step 3:** `npm test`, typecheck, lint, build. Then `git add src/history src/app && git commit -m "feat(stats): /stats page with leaderboards, horses, badges and replays"`

---

### Task 7: Game-screen touches

**Files:** Modify `src/track/TrackPage.tsx`, `src/play/PlayPage.tsx`.

- [ ] **Step 1: Office lobby, top-3 richest.** In `LobbyBoard`, when `office`:
  - Above the roster, show "💰 Richest:" followed by the top 3 of `players`, sorted by `balances[p.id] ?? 0` descending, as `{p.name} {balance}`.
  - Add `<a href="/stats">Stats</a>` next to the /admin note.
  - There is no new fetch: balances are already in the room state.
- [ ] **Step 2: Odds board, Form column.**
  - In `BettingBoard`, call `useOfficeStats(room.race_id, room.kind === 'office')`. The hook runs on every render, but only fetches for the office.
  - For the office, add a `Form` column after the horse name: `formatForm(stats?.horses.find((h) => h.id === id)?.last5 ?? [])`.
  - Private rooms render no Form column.
- [ ] **Step 3: Phone, my record.**
  - In `PlayRoom`, call `useOfficeStats(room.phase, room.kind === 'office')`.
  - In the office LOBBY, when `stats` has a record for `mine.id`, show "Your record: {races} races · {wins} wins · form {formatForm(last5)}".
  - Below it, show the member's badges as chips (`.badges` class, icon + name, `title` = description).
  - Hide the line when there are no races yet.
- [ ] **Step 4:** `npm test`, typecheck, lint, build. Then `git add src/track src/play && git commit -m "feat: form on the odds board, richest on the lobby, my record on the phone"`

---

### Task 8: Smoke test, docs, deploy

- [ ] **Step 1: Local smoke test** in the browser, with office members from `/admin` and the Phase 5 tabs.
  - **Setup:** before race 1, set one member's balance low (`/admin`, −60) so they earn 🪙 Broke.
  - **Run 3 office races.** Then check:
    - the odds board shows Form after race 1;
    - the lobby shows the richest 3;
    - the winner's phone shows its record and a 🥇 First Win chip.
  - **Open `/stats` on the big screen and on a phone:**
    - the four leaderboards, the horse table, the badges and the recent races all show;
    - **Replay** plays the race with the right colours and names, and **Back** returns.
  - **Signed out:** on a device that isn't signed in, `/stats` shows the sign-in hint.
  - **Console:** no errors.
- [ ] **Step 2:** All checks: `npm test`, `npm run test:db`, typecheck, lint, build.
- [ ] **Step 3: Docs.**
  - `PROJECT_STATUS.md`: ticks, a log entry, decisions and deferred items.
  - `README.md`: mention `/stats`.
  - Commit: `docs: Phase 6 status and notes`.
- [ ] **Step 4: Deploy** (after merge, with the owner's go-ahead), in this order:
  1. `npx supabase db push --linked` for migration 013. The live `start-race` keeps working through the `p_awards` default.
  2. `npx supabase functions deploy start-race`.
  3. `git push origin master`. Vercel's production branch is `master`; if the live site doesn't update within a few minutes, ask the owner to promote the deployment.
  4. Check `/stats` on the live site.
