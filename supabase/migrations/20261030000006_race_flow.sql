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
