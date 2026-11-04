-- Roulette-style group bets on the winner's number: Odd, Even, Low (first half, rounded down) and
-- High (the rest). They have no horse; their odds sit in races.odds -> 'groups', priced at Lock
-- odds from the summed win chances (src/sim/odds.ts groupLanes mirrors group_won). 4+ horses only.

alter table public.bets
  alter column horse_id drop not null,
  drop constraint bets_kind_check,
  add constraint bets_kind_check check (kind in ('win', 'place', 'odd', 'even', 'low', 'high')),
  add constraint bets_horse_check check ((kind in ('win', 'place')) = (horse_id is not null));

-- Does a group bet on `p_kind` win when the winner wears number `p_lane` of `p_n`?
create function private.group_won(p_kind text, p_lane integer, p_n integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'odd' then p_lane % 2 = 1
    when 'even' then p_lane % 2 = 0
    when 'low' then p_lane <= p_n / 2
    when 'high' then p_lane > p_n / 2
    else false
  end
$$;

-- v2: also checks group odds when the function sends them (a race without them has no group bets).
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
    where coalesce(jsonb_typeof(p_odds -> h::text -> 'win'), '') <> 'number'
       or coalesce(jsonb_typeof(p_odds -> h::text -> 'place'), '') <> 'number'
       or (p_odds -> h::text ->> 'win')::numeric not between 1.2 and 20
       or (p_odds -> h::text ->> 'place')::numeric not between 1.05 and 6
  ) or (p_odds ? 'groups' and cardinality(v_race.horses) >= 4 and exists (
    select 1 from unnest(array['odd', 'even', 'low', 'high']) as g
    where coalesce(jsonb_typeof(p_odds -> 'groups' -> g), '') <> 'number'
       or (p_odds -> 'groups' ->> g)::numeric not between 1.05 and 20
  )) then
    raise exception 'bad_odds';
  end if;
  update public.races set odds = p_odds where id = p_race;
  update public.rooms set phase = 'BETTING', last_activity_at = now() where id = v_room.id;
end;
$$;

-- v2: group bets (p_horse null, p_kind a group) at the frozen group odds.
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
    v_odds := (v_race.odds -> 'groups' ->> p_kind)::numeric;
    if p_horse is not null or cardinality(v_race.horses) < 4 or v_odds is null then
      raise exception 'bad_bet';
    end if;
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

-- v3: group bets pay too (only the payout case changed).
create or replace function public.start_race_finish(
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
        or private.group_won(kind, array_position(v_race.horses, p_finish[1]), cardinality(v_race.horses))
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
    -- Malformed awards are skipped, never cast: a deterministic error here would fail every Start retry.
    from jsonb_each(case when jsonb_typeof(p_awards) = 'object' then p_awards else '{}'::jsonb end) a
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(a.value) = 'array' then a.value else '[]'::jsonb end) h(horse)
    where a.key in ('photo_finish', 'comeback', 'banana_king', 'untouchable', 'sniper')
      and h.horse = any (v_race.horses::text[])
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
              order by started_at desc, id desc limit 2) o) then
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
