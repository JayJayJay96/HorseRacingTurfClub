-- Closed bets: lock-odds now sends null instead of lifting a too-likely pick to the minimum odds
-- (which paid more than the bet was worth). A null Win/Place/group price means that bet is closed.

-- v3: accepts null (closed) prices; numbers must still be in range.
create or replace function public.lock_odds_finish(p_race uuid, p_odds jsonb)
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
    where coalesce(jsonb_typeof(p_odds -> h::text -> 'win'), '') not in ('number', 'null')
       or coalesce(jsonb_typeof(p_odds -> h::text -> 'place'), '') not in ('number', 'null')
       or (p_odds -> h::text ->> 'win')::numeric not between 1.2 and 20
       or (p_odds -> h::text ->> 'place')::numeric not between 1.05 and 6
  ) or (p_odds ? 'groups' and cardinality(v_race.horses) >= 4 and exists (
    select 1 from unnest(array['odd', 'even', 'low', 'high']) as g
    where coalesce(jsonb_typeof(p_odds -> 'groups' -> g), '') not in ('number', 'null')
       or (p_odds -> 'groups' ->> g)::numeric not between 1.05 and 20
  )) then
    raise exception 'bad_odds';
  end if;
  update public.races set odds = p_odds where id = p_race;
  update public.rooms set phase = 'BETTING', last_activity_at = now() where id = v_room.id;
end;
$$;

-- v3: refuses a closed bet (null price) with bet_closed.
create or replace function public.place_bet(p_room uuid, p_horse uuid, p_kind text, p_stake integer)
returns public.bets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_my_player(p_room, 'BETTING');
  v_race public.races;
  v_bet public.bets;
  v_odds numeric;
begin
  select r.* into v_race from public.races r join public.rooms m on m.race_id = r.id where m.id = p_room;
  if p_kind in ('odd', 'even', 'low', 'high') then
    -- A race without group odds (fewer than 4 horses) has no group bets at all.
    if p_horse is not null or cardinality(v_race.horses) < 4
       or not coalesce(v_race.odds -> 'groups' ? p_kind, false) then
      raise exception 'bad_bet';
    end if;
    v_odds := (v_race.odds -> 'groups' ->> p_kind)::numeric;
  else
    -- With 3 or fewer horses every horse places, so a Place bet could not lose.
    if p_kind is null or p_kind not in ('win', 'place')
       or (p_kind = 'place' and cardinality(v_race.horses) <= 3) then
      raise exception 'bad_bet';
    end if;
    if p_horse is null or not (p_horse = any (v_race.horses)) then
      raise exception 'not_in_race';
    end if;
    v_odds := (v_race.odds -> p_horse::text ->> p_kind)::numeric;
  end if;
  if v_odds is null then
    raise exception 'bet_closed';
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
  values (v_race.id, p_room, v_player.id, p_horse, p_kind, p_stake, v_odds)
  returning * into v_bet;
  insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
  values (v_race.id, p_room, v_player.id, 'bet', -p_stake);
  return v_bet;
end;
$$;
