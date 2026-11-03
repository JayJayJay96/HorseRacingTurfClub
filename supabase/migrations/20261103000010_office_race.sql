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
