
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
        -- Balances without the payouts of a race still hidden from `fin`.
        from (select m.id, (private.balance(null, m.id) - coalesce((
                select sum(l.amount) from public.coin_ledger l
                where l.player_id = m.id and l.type = 'payout' and l.race_id = v_room.race_id
                  and v_room.phase <> 'PODIUM'), 0))::int as balance
              from members m order by 2 desc limit 10) x), '[]'::jsonb),
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
