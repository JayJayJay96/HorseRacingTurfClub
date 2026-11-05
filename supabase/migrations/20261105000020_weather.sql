-- Weather (spec 2026-11-05): an office switch, and each race's weather, rolled by lock-odds.

alter table public.rooms add column weather_enabled boolean not null default true;
alter table public.races add column weather text not null default 'clear'
  check (weather in ('clear', 'rain', 'fog'));

-- v3: also returns the weather switch and the race's stored weather.
create or replace function private.race_input(p_race uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'race_id', r.id,
    'length', r.length,
    'weather', r.weather,
    'weather_enabled', m.weather_enabled,
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

-- v4: also stores the weather the odds were priced with. Old 2-arg version dropped (no overloads);
-- the default keeps 2-arg callers working as clear.
drop function public.lock_odds_finish(uuid, jsonb);
create function public.lock_odds_finish(p_race uuid, p_odds jsonb, p_weather text default 'clear')
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
  if p_weather is null or p_weather not in ('clear', 'rain', 'fog')
     or (p_weather <> 'clear' and not v_room.weather_enabled) then
    raise exception 'bad_weather';
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
  update public.races set odds = p_odds, weather = p_weather where id = p_race;
  update public.rooms set phase = 'BETTING', last_activity_at = now() where id = v_room.id;
end;
$$;
revoke execute on function public.lock_odds_finish(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.lock_odds_finish(uuid, jsonb, text) to service_role;

-- /admin: the office weather switch.
create function public.admin_set_weather(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_on is null then
    raise exception 'bad_weather';
  end if;
  update public.rooms set weather_enabled = p_on, last_activity_at = now() where kind = 'office';
end;
$$;
revoke execute on function public.admin_set_weather(boolean) from public, anon, authenticated;
grant execute on function public.admin_set_weather(boolean) to service_role;

-- v2: the overview also shows the weather switch.
create or replace function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'room', jsonb_build_object('id', r.id, 'code', r.code, 'phase', r.phase,
                               'weather_enabled', r.weather_enabled),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'horse_name', p.horse_name,
          'balance', private.balance(null, p.id),
          'has_pin', o.pin_hash is not null, 'phone', p.uid is not null,
          'archived', p.archived_at is not null)
        order by p.archived_at nulls first, lower(p.name))
      from public.room_players p left join private.office_pins o on o.player_id = p.id
      where p.room_id = r.id), '[]'::jsonb),
    'races', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', x.id, 'created_at', x.created_at, 'length', x.length, 'prize', x.prize,
          'horses', cardinality(x.horses), 'finished', x.finish_order is not null,
          'current', x.id is not distinct from r.race_id)
        order by x.created_at desc)
      from (select * from public.races where room_id = r.id order by created_at desc limit 30) x), '[]'::jsonb))
  from public.rooms r where r.kind = 'office';
$$;
