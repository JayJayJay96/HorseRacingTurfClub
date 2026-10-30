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
