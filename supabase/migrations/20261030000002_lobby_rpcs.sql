-- Host-only lobby actions. All require phase LOBBY.

create function public.add_player(p_room uuid, p_name text)
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
revoke execute on function public.add_player(uuid, text) from public, anon;
grant execute on function public.add_player(uuid, text) to authenticated;

create function public.remove_player(p_player uuid)
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
revoke execute on function public.remove_player(uuid) from public, anon;
grant execute on function public.remove_player(uuid) to authenticated;

create function public.set_ticked(p_player uuid, p_ticked boolean)
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
  perform 1 from public.room_players where id = p_player for update;
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
revoke execute on function public.set_ticked(uuid, boolean) from public, anon;
grant execute on function public.set_ticked(uuid, boolean) to authenticated;

create function public.update_room_settings(p_room uuid, p_length text default null, p_prize text default null)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_host_room(p_room);
  v_prize text := btrim(p_prize);
begin
  if v_room.phase <> 'LOBBY' then
    raise exception 'wrong_phase';
  end if;
  -- a null argument means "keep the current value"
  if p_length is not null and p_length not in ('short', 'long') then
    raise exception 'bad_length';
  end if;
  if char_length(v_prize) > 60 then
    raise exception 'prize_too_long';
  end if;
  update public.rooms
    set race_length = coalesce(p_length, race_length), prize = coalesce(v_prize, prize)
    where id = p_room
    returning * into v_room;
  return v_room;
end;
$$;
revoke execute on function public.update_room_settings(uuid, text, text) from public, anon;
grant execute on function public.update_room_settings(uuid, text, text) to authenticated;
