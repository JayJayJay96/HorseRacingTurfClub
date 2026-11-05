-- Terrain tracks (spec 2026-11-06 C): seven new track ids, Random picks any of the ten, and the
-- sim input carries the race's track (terrain now changes results). Mirrors TRACK_IDS.

alter table public.rooms drop constraint rooms_track_check;
alter table public.rooms add constraint rooms_track_check
  check (track in ('oval', 'speedway', 'kidney', 'downs', 'summit', 'canyon', 'figure8', 'steeple', 'seaside', 'ice', 'random'));
alter table public.races drop constraint races_track_check;
alter table public.races add constraint races_track_check
  check (track in ('oval', 'speedway', 'kidney', 'downs', 'summit', 'canyon', 'figure8', 'steeple', 'seaside', 'ice'));

-- v3: the new track ids. Otherwise unchanged from migration 0014.
create or replace function public.update_room_settings(
  p_room uuid, p_length text default null, p_prize text default null, p_track text default null
)
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
  if p_track is not null and p_track not in ('oval', 'speedway', 'kidney', 'downs', 'summit', 'canyon', 'figure8', 'steeple', 'seaside', 'ice', 'random') then
    raise exception 'bad_track';
  end if;
  update public.rooms
    set race_length = coalesce(p_length, race_length), prize = coalesce(v_prize, prize),
      track = coalesce(p_track, track)
    where id = p_room
    returning * into v_room;
  return v_room;
end;
$$;

-- v8: Random picks any of the ten tracks. Otherwise unchanged from migration 0021.
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
        then (array['oval', 'speedway', 'kidney', 'downs', 'summit', 'canyon', 'figure8', 'steeple', 'seaside', 'ice'])[1 + floor(random() * 10)::int]
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

-- v5: also returns the race's track. Otherwise unchanged from migration 0021.
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
    'track', r.track,
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
