-- Phase 2: Private rooms and lobby.
-- Clients may only SELECT rooms they belong to; every write goes through a security-definer RPC.
-- RPC errors are plain snake_case codes (mapped to UI text by src/net/rooms.ts errorText).

create schema if not exists private;
grant usage on schema private to authenticated;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{4}$'),
  host_uid uuid not null references auth.users (id) on delete cascade,
  phase text not null default 'LOBBY'
    check (phase in ('LOBBY', 'SHOP', 'ODDS_LOCKED', 'BETTING', 'RUNNING', 'PODIUM')),
  race_length text not null default 'short' check (race_length in ('short', 'long')),
  prize text not null default '' check (char_length(prize) <= 60),
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index rooms_host_uid_idx on public.rooms (host_uid);

-- uid is null for names the host typed (no phone).
create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  uid uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 24 and name = btrim(name)),
  ticked boolean not null default false,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id, uid)
);
create unique index room_players_room_name_key on public.room_players (room_id, lower(name));
create index room_players_uid_idx on public.room_players (uid);

revoke all on public.rooms, public.room_players from anon;
revoke insert, update, delete, truncate on public.rooms, public.room_players from authenticated;
grant select on public.rooms, public.room_players to authenticated;

create function private.is_room_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.rooms where id = p_room and host_uid = auth.uid())
      or exists (select 1 from public.room_players where room_id = p_room and uid = auth.uid());
$$;
revoke execute on function private.is_room_member(uuid) from public;
grant execute on function private.is_room_member(uuid) to authenticated;

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

create policy "members read their room" on public.rooms
  for select to authenticated using (private.is_room_member(id));
create policy "members read their roster" on public.room_players
  for select to authenticated using (private.is_room_member(room_id));

-- Locks the room row, checks the caller is its host, and marks activity (keeps it from cleanup).
create function private.lock_host_room(p_room uuid)
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
  if v_room.host_uid <> auth.uid() then
    raise exception 'not_host';
  end if;
  update public.rooms set last_activity_at = now() where id = p_room;
  return v_room;
end;
$$;
revoke execute on function private.lock_host_room(uuid) from public;

create function public.create_room(p_length text default 'short', p_prize text default '')
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no I, L, O, 0, 1
  v_prize text := btrim(coalesce(p_prize, ''));
  v_code text;
  v_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if p_length is null or p_length not in ('short', 'long') then
    raise exception 'bad_length';
  end if;
  if char_length(v_prize) > 60 then
    raise exception 'prize_too_long';
  end if;
  for attempt in 1..20 loop
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 31)::int, 1);
    end loop;
    begin
      insert into public.rooms (code, host_uid, race_length, prize)
      values (v_code, auth.uid(), p_length, v_prize)
      returning * into v_room;
      return v_room;
    exception when unique_violation then
      -- code in use; try another
    end;
  end loop;
  raise exception 'no_free_code';
end;
$$;
revoke execute on function public.create_room(text, text) from public, anon;
grant execute on function public.create_room(text, text) to authenticated;

create function public.join_room(p_code text, p_name text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_player public.room_players;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  select id into v_room_id from public.rooms where code = upper(btrim(p_code));
  if not found then
    raise exception 'room_not_found';
  end if;

  -- Same device again: return its entry (the name is ignored, so '' works as a rejoin probe).
  select * into v_player from public.room_players where room_id = v_room_id and uid = auth.uid();
  if found then
    return v_player;
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
  raise exception 'name_taken'; -- lost a race with a concurrent join of the same name
end;
$$;
revoke execute on function public.join_room(text, text) from public, anon;
grant execute on function public.join_room(text, text) to authenticated;
