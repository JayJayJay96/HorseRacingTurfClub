-- Hot items (spec 2026-11-05 C) and horse traits (spec 2026-11-05 D).

alter table public.rooms add column hot_items_enabled boolean not null default true;
alter table public.races add column hot_items jsonb not null default '[]'::jsonb;
alter table public.races add column traits jsonb not null default '{}'::jsonb;
alter table public.room_players add column trait text not null default 'normal'
  check (trait in ('normal', 'charmed', 'tough', 'sprinter', 'stayer', 'mudder'));

-- 3 different items in random order, skipping any that would make a third of one box type.
-- Shield and Mirror have no duration and an Extended Stampede does nothing, so they are always Lucky. Mirrors HOT_ELIGIBLE / HOT in
-- src/sim. Hot items are public, so random() is fine.
create function private.roll_hot_items()
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_item text;
  v_type text;
  v_types text[] := '{}';
  v_out jsonb := '[]'::jsonb;
begin
  for v_item in
    select i from unnest(array[
      'speed:self1', 'speed:self3', 'speed:star', 'speed:pass3',
      'attack:behind1', 'attack:behind3', 'attack:front1', 'attack:front3',
      'attack:leader', 'attack:top3', 'attack:all',
      'defense:block1', 'defense:immune', 'defense:reflect'
    ]) as i
    order by random()
  loop
    v_type := split_part(v_item, ':', 1);
    continue when cardinality(array_positions(v_types, v_type)) >= 2;
    v_types := v_types || v_type;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'item', v_item,
      'buff', case when v_item in ('speed:pass3', 'defense:block1', 'defense:reflect') or random() < 0.5
                   then 'lucky' else 'extended' end));
    exit when jsonb_array_length(v_out) = 3;
  end loop;
  return v_out;
end;
$$;
revoke execute on function private.roll_hot_items() from public;

-- v6: a new race rolls its hot items (when the room's switch is on) and every trait starts over at
-- Normal; back to the shop keeps the hot items and clears the trait snapshot.
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
  if v_room.phase || '>' || coalesce(p_phase, '') not in (
    'LOBBY>SHOP', 'SHOP>LOBBY', 'ODDS_LOCKED>LOBBY', 'BETTING>LOBBY', 'PODIUM>LOBBY',
    'ODDS_LOCKED>SHOP', 'BETTING>SHOP'
  ) then
    raise exception 'bad_transition';
  end if;
  if p_phase = 'SHOP' and v_room.phase <> 'LOBBY' then
    -- Back to the shop: same race. Deleting the bets and their ledger rows is a full bet refund.
    v_race := v_room.race_id;
    delete from public.coin_ledger where race_id = v_race and type in ('bet', 'unbet');
    delete from public.bets where race_id = v_race;
    update public.races set horses = '{}', odds = null, traits = '{}' where id = v_race;
  elsif p_phase = 'SHOP' then
    if (select count(*) from public.room_players where room_id = p_room and ticked) < 2 then
      raise exception 'need_two_horses';
    end if;
    insert into public.races (room_id, length, prize, track, hot_items)
    values (
      p_room, v_room.race_length, v_room.prize,
      case when v_room.track = 'random'
        then (array['oval', 'speedway', 'kidney'])[1 + floor(random() * 3)::int]
        else v_room.track end,
      case when v_room.hot_items_enabled then private.roll_hot_items() else '[]'::jsonb end
    )
    returning id into v_race;
    -- Traits are picked per race.
    update public.room_players set trait = 'normal' where room_id = p_room and trait <> 'normal';
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
  elsif v_room.phase in ('SHOP', 'ODDS_LOCKED', 'BETTING') then
    -- Cancelling deletes the race and, with it, its topups, floors, purchases and bets: a full refund.
    delete from public.races where id = v_room.race_id;
  end if;
  update public.room_players set ready = false where room_id = p_room and ready;
  update public.rooms set phase = p_phase, race_id = v_race where id = p_room returning * into v_room;
  return v_room;
end;
$$;

-- v2: closing the shop also snapshots every runner's trait (Normal included). The ODDS_LOCKED
-- retry keeps the snapshot (and the field) from the first lock.
create or replace function public.lock_odds_begin(p_room uuid)
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
                         where room_id = p_room and ticked order by joined_at, id),
          traits = coalesce((select jsonb_object_agg(id, trait) from public.room_players
                             where room_id = p_room and ticked), '{}'::jsonb)
      where id = v_room.race_id;
    update public.room_players set ready = false where room_id = p_room and ready;
    update public.rooms set phase = 'ODDS_LOCKED', last_activity_at = now() where id = p_room;
  end if;
  return private.race_input(v_room.race_id);
end;
$$;

-- v4: also returns the race's hot items and trait snapshot.
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
    'hot_items', r.hot_items,
    'traits', r.traits,
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

-- Phones: the caller's own runner picks a trait while the shop is open (host-typed horses have no
-- uid and stay Normal). Same checks as buy_box.
create function public.set_trait(p_room uuid, p_trait text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_my_player(p_room, 'SHOP');
begin
  if p_trait is null
     or p_trait not in ('normal', 'charmed', 'tough', 'sprinter', 'stayer', 'mudder') then
    raise exception 'bad_trait';
  end if;
  if not v_player.ticked then
    raise exception 'not_racing';
  end if;
  update public.room_players set trait = p_trait where id = v_player.id returning * into v_player;
  return v_player;
end;
$$;
revoke execute on function public.set_trait(uuid, text) from public, anon;
grant execute on function public.set_trait(uuid, text) to authenticated;

-- /admin: the office hot-items switch.
create function public.admin_set_hot_items(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_on is null then
    raise exception 'bad_action';
  end if;
  update public.rooms set hot_items_enabled = p_on, last_activity_at = now() where kind = 'office';
end;
$$;
revoke execute on function public.admin_set_hot_items(boolean) from public, anon, authenticated;
grant execute on function public.admin_set_hot_items(boolean) to service_role;

-- v3: the overview also shows the hot-items switch.
create or replace function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'room', jsonb_build_object('id', r.id, 'code', r.code, 'phase', r.phase,
                               'weather_enabled', r.weather_enabled,
                               'hot_items_enabled', r.hot_items_enabled),
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
