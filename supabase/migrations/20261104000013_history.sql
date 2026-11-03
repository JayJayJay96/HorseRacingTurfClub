
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
