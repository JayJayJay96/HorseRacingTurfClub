# Join-by-pick, Late Claim and Cancel Race — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three fixes the owner asked for after Phase 5 (2026-11-04):
- **Pick, don't retype.** In a Private room, a phone picks the horse the host pre-entered instead of retyping the exact name.
- **Late claim.** A phone can still claim its pre-entered horse after the shop opens, up until Start, and gets that race's 100 coins.
- **Cancel race.** The host can cancel a race stuck at "Calculating odds…" or in Betting, refunding everything. Without this, a broken server function leaves the Office room stuck forever.

**Architecture:** One new migration, `supabase/migrations/20261104000012_join_and_cancel.sql`, with three parts:
- **`private_roster(code)`:** a new RPC that lists the unclaimed host-typed names.
- **`join_room` v4:** claims host-typed names in LOBBY, SHOP, ODDS_LOCKED and BETTING. A late claimer gets the race's 100-coin topup.
- **`set_phase` v4:** also allows ODDS_LOCKED→LOBBY and BETTING→LOBBY. Like SHOP→LOBBY, these delete the race, so purchases, bets, topups and floors cascade away: a full refund in both modes.

Client: a pick list on the phone join screen, and a "Cancel race" button on two big-screen boards.

**Tech Stack:** Supabase Postgres (plpgsql), React 19, Vitest.

**Not changed:**
- New (typed) names still join only in the LOBBY.
- Office joining is unchanged; PIN login already works in any phase.
- A race that has started (RUNNING) can't be cancelled. It plays out, and "Show results" already exists.

---

### Task 1: Migration + DB tests

**Files:** Create `supabase/migrations/20261104000012_join_and_cancel.sql`. Modify `tests/db/phases.test.ts` (the "join_room outside the lobby" block). Create `tests/db/joinCancel.test.ts`.

- [ ] **Step 1: Failing tests.** In `tests/db/phases.test.ts`, change the existing test to the new rule:

```ts
  it('refuses new names after the lobby but lets a phone claim a pre-entered horse', async () => {
    const { room, siti } = await shopRoom();
    const late = await anonClient();
    expect(await fails(late.rpc('join_room', { p_code: room.code, p_name: 'Bob' }))).toBe('wrong_phase');
    const claimed = await ok(late.rpc('join_room', { p_code: room.code, p_name: 'siti' }));
    expect(claimed.id).toBe(siti.id);
  });
```

  Create `tests/db/joinCancel.test.ts`. It uses the Phase 3 fixtures (`shopRoom`, `bettingRoom`, `balance` from `./raceFixtures.ts`): phones Ali, Bea and Cal; host-typed Siti and Dan; Ali, Bea, Siti and Dan ticked.

```ts
import { describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { balanceOf, member, officeRoom } from './officeFixtures.ts';
import { balance, bettingRoom, shopRoom } from './raceFixtures.ts';

describe('private_roster', () => {
  it('lists only unclaimed host-typed names of a private room', async () => {
    const r = await shopRoom();
    const stranger = await anonClient();
    const rows = (await ok(stranger.rpc('private_roster', { p_code: r.room.code }))) as { name: string }[];
    expect(rows.map((x) => x.name).sort()).toEqual(['Dan', 'Siti']);
    expect(await ok(stranger.rpc('private_roster', { p_code: 'TURF' }))).toEqual([]);
  });
});

describe('late claim', () => {
  it('claims a pre-entered horse in SHOP, gets 100 once, and can buy for it', async () => {
    const r = await shopRoom();
    const phone = await anonClient();
    const siti = await ok(phone.rpc('join_room', { p_code: r.room.code, p_name: 'Siti' }));
    expect(await balance(phone, r.raceId, siti.id)).toBe(100);
    // Rejoining (probe) does not pay again.
    await ok(phone.rpc('join_room', { p_code: r.room.code, p_name: '' }));
    expect(await balance(phone, r.raceId, siti.id)).toBe(100);
    await ok(phone.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }));
    expect(await balance(phone, r.raceId, siti.id)).toBe(80);
  });

  it('claims in BETTING and can bet; refuses once the race runs', async () => {
    const r = await bettingRoom();
    const phone = await anonClient();
    const dan = await ok(phone.rpc('join_room', { p_code: r.room.code, p_name: 'Dan' }));
    await ok(
      phone.rpc('place_bet', { p_room: r.room.id, p_horse: r.ali.player.id, p_kind: 'win', p_stake: 10 }),
    );
    expect(await balance(phone, r.raceId, dan.id)).toBe(90);
    await ok(r.host.rpc('start_race_begin', { p_room: r.room.id }));
    await ok(
      adminClient().rpc('start_race_finish', {
        p_race: r.raceId,
        p_timeline: {},
        p_finish: [r.ali.player.id, r.bea.player.id, r.siti.id, r.dan.id],
        p_seconds: 100,
      }),
    );
    const another = await anonClient();
    expect(await fails(another.rpc('join_room', { p_code: r.room.code, p_name: 'Siti' }))).toBe(
      'wrong_phase',
    );
  });
});

describe('cancel race', () => {
  it('BETTING -> LOBBY deletes the race (full refund) and is host-only', async () => {
    const r = await bettingRoom();
    await ok(
      r.cal.client.rpc('place_bet', { p_room: r.room.id, p_horse: r.ali.player.id, p_kind: 'win', p_stake: 30 }),
    );
    expect(await fails(r.ali.client.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }))).toBe('not_host');
    const room = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
    expect(room).toMatchObject({ phase: 'LOBBY', race_id: null });
    expect(await ok(adminClient().from('races').select('id').eq('id', r.raceId))).toEqual([]);
  });

  it('ODDS_LOCKED -> LOBBY works too; RUNNING can not be cancelled', async () => {
    const r = await shopRoom();
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
    const r2 = await bettingRoom();
    await ok(r2.host.rpc('start_race_begin', { p_room: r2.room.id }));
    await ok(
      adminClient().rpc('start_race_finish', {
        p_race: r2.raceId,
        p_timeline: {},
        p_finish: [r2.ali.player.id, r2.bea.player.id, r2.siti.id, r2.dan.id],
        p_seconds: 100,
      }),
    );
    expect(await fails(r2.host.rpc('set_phase', { p_room: r2.room.id, p_phase: 'LOBBY' }))).toBe(
      'bad_transition',
    );
  });

  it('Office: cancelling in BETTING undoes topups, purchases and bets', async () => {
    const { host, room } = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    for (const p of [a, b]) await ok(host.rpc('set_ticked', { p_player: p.player.id, p_ticked: true }));
    const shop = await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    await ok(a.client.rpc('buy_box', { p_room: room.id, p_box: 'speed' }));
    await ok(host.rpc('lock_odds_begin', { p_room: room.id }));
    const odds = { [a.player.id]: { win: 2, place: 1.1 }, [b.player.id]: { win: 2, place: 1.1 } };
    await ok(adminClient().rpc('lock_odds_finish', { p_race: shop.race_id, p_odds: odds }));
    await ok(b.client.rpc('place_bet', { p_room: room.id, p_horse: a.player.id, p_kind: 'win', p_stake: 40 }));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'LOBBY' }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(100);
    expect(await balanceOf(a.client, room.id, b.player.id)).toBe(100);
  });
});
```

  If a fixture field name differs, adapt it and keep the intent.

- [ ] **Step 2:** Run `npx vitest run --config vitest.db.config.ts tests/db/joinCancel.test.ts tests/db/phases.test.ts`. Expected: FAIL. There's no `private_roster` yet, a claim in SHOP is refused, and ODDS_LOCKED/BETTING→LOBBY gives `bad_transition`.

- [ ] **Step 3: Migration.** Create `supabase/migrations/20261104000012_join_and_cancel.sql`:

```sql
-- Private rooms: phones pick a name the host pre-entered and may claim it until Start (late claimers get
-- the race's 100 coins). Hosts may cancel a race until Start; deleting it refunds everything (both modes).

-- Unclaimed host-typed names for the phone join screen. Anyone signed in with the code may see them.
create function public.private_roster(p_code text)
returns table (id uuid, name text, ticked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.ticked
  from public.rooms r join public.room_players p on p.room_id = r.id
  where r.code = upper(btrim(p_code)) and r.kind = 'private' and p.uid is null
  order by p.joined_at, p.id;
$$;
revoke execute on function public.private_roster(text) from public, anon;
grant execute on function public.private_roster(text) to authenticated;

-- v4: pre-entered names can be claimed in LOBBY..BETTING; new names still only in the LOBBY.
create or replace function public.join_room(p_code text, p_name text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_name text := btrim(coalesce(p_name, ''));
  v_player public.room_players;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  -- Room first (same lock order as every other RPC), so a claim can't interleave with a phase change.
  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  -- Same device again: return its entry (the name is ignored, so '' works as a rejoin probe).
  select * into v_player from public.room_players
    where room_id = v_room.id and uid = auth.uid() and archived_at is null;
  if found then
    return v_player;
  end if;
  if v_room.kind = 'office' then
    raise exception 'office_room';
  end if;

  -- A name the host typed (no phone yet) is claimed by the first phone that picks it, until Start.
  if v_room.phase in ('LOBBY', 'SHOP', 'ODDS_LOCKED', 'BETTING') and v_name <> '' then
    update public.room_players set uid = auth.uid()
      where room_id = v_room.id and lower(name) = lower(v_name) and uid is null
      returning * into v_player;
    if found then
      -- Private coins are per race: a phone that arrives after the shop opened gets this race's 100.
      if v_room.race_id is not null then
        insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
        values (v_room.race_id, v_room.id, v_player.id, 'topup', 100);
      end if;
      update public.rooms set last_activity_at = now() where id = v_room.id;
      return v_player;
    end if;
  end if;

  if v_room.phase <> 'LOBBY' then
    raise exception 'wrong_phase';
  end if;
  if char_length(v_name) not between 1 and 24 then
    raise exception 'bad_name';
  end if;
  if exists (select 1 from public.room_players where room_id = v_room.id and lower(name) = lower(v_name)) then
    raise exception 'name_taken';
  end if;
  if (select count(*) from public.room_players where room_id = v_room.id) >= 40 then
    raise exception 'room_full';
  end if;
  update public.rooms set last_activity_at = now() where id = v_room.id;
  insert into public.room_players (room_id, uid, name)
  values (v_room.id, auth.uid(), v_name)
  returning * into v_player;
  return v_player;
exception when unique_violation then
  -- lost a race: same device joined twice (return its entry) or same name taken
  select * into v_player from public.room_players
    where room_id = v_room.id and uid = auth.uid() and archived_at is null;
  if found then
    return v_player;
  end if;
  raise exception 'name_taken';
end;
$$;
```

  Next, `set_phase` v4. Copy the **current** `set_phase` body from `supabase/migrations/20261103000010_office_race.sql` (v3, with the office topup/floor branch) into this migration as `create or replace function public.set_phase(...)`. Change only these two places:

```sql
  if v_room.phase || '>' || coalesce(p_phase, '') not in (
    'LOBBY>SHOP', 'SHOP>LOBBY', 'ODDS_LOCKED>LOBBY', 'BETTING>LOBBY', 'PODIUM>LOBBY'
  ) then
```

```sql
  elsif v_room.phase in ('SHOP', 'ODDS_LOCKED', 'BETTING') then
    -- Cancelling deletes the race and, with it, its topups, floors, purchases and bets: a full refund.
    delete from public.races where id = v_room.race_id;
```

  A `lock-odds` or `start-race` call may still be running when the host cancels. Its `*_finish` RPC must then fail cleanly: the race is gone or `rooms.race_id` has changed, so it raises `race_not_found` / `wrong_phase`. Check this in the existing `lock_odds_finish` / `start_race_finish`; no change is expected.

- [ ] **Step 4:** `npx supabase db reset`, then `npm run test:db`. All tests must pass (the realtime test may need one rerun after a reset).
- [ ] **Step 5:** `git add supabase/migrations/20261104000012_join_and_cancel.sql tests/db/phases.test.ts tests/db/joinCancel.test.ts && git commit -m "feat(db): pick or late-claim a pre-entered horse; cancel a race before Start"`

### Task 2: Client

**Files:** Modify `src/net/rooms.ts`, `src/play/PlayPage.tsx`, `src/track/TrackPage.tsx`. Regenerate `src/net/database.types.ts`.

- [ ] **Step 1: Regenerate types** (Git Bash): `npx supabase gen types typescript --local > src/net/database.types.ts`, then run Prettier on that file.
- [ ] **Step 2: Wrapper.** In `src/net/rooms.ts`, next to `officeRoster`:

```ts
/** Names the host pre-entered that no phone has claimed yet (Private rooms). */
export const privateRoster = (code: string) => call(supabase.rpc('private_roster', { p_code: code }));
```

- [ ] **Step 3: Phone join screen.** In `PlayPage`'s name form (the not-yet-joined, non-office view), load `privateRoster(code)` once, after `ensureSignedIn`.
  - If it returns names, show a "Pre-entered by the host" heading with one button per name: `<button type="button" onClick={() => claim(p.name)}>I'm {p.name}{p.ticked ? ' 🐎' : ''}</button>`.
  - `claim(name)` calls `joinRoom(code, name)` then `setMe`, with the same error handling as the typed form.
  - Keep the typed form below, labelled "Or join with a new name".
  - Errors use `errorText` in the existing `role="alert"` paragraph.
- [ ] **Step 4: Cancel button.** In `src/track/TrackPage.tsx`, add a "Cancel race (refund everything)" button to `OddsLockedBoard` and `BettingBoard`, next to Retry / Start race:

```tsx
<button
  type="button"
  disabled={busy}
  onClick={() =>
    window.confirm('Cancel this race? All boxes and bets are refunded.') &&
    act(() => setPhase(room.id, 'LOBBY'))
  }
>
  Cancel race (refund everything)
</button>
```

- [ ] **Step 5:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Then: `git add src && git commit -m "feat: pick your pre-entered horse on the phone; cancel a race from the big screen"`

### Task 3: Docs

- [ ] `README.md`, under Office mode: add a short "Running it" note with two points:
  - Supabase pauses free projects after about a week of inactivity. If the site says it can't connect, open the Supabase dashboard and press **Restore**.
  - Watch Supabase → Usage after the first busy weeks, because every update makes each phone refetch the room.
- [ ] `PROJECT_STATUS.md`: add a 2026-11-04 entry covering pick/late claim, cancel race and the checks.
- [ ] `git add README.md PROJECT_STATUS.md && git commit -m "docs: join-by-pick, cancel race, hosting notes"`
