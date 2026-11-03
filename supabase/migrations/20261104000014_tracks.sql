-- Track shapes are looks only: the host picks one per room (or random), and each race stores a concrete one.

alter table public.rooms add column track text not null default 'oval'
  check (track in ('oval', 'speedway', 'kidney', 'random'));
alter table public.races add column track text not null default 'oval'
  check (track in ('oval', 'speedway', 'kidney'));

-- v2: also sets the track. The old signature is dropped so the client can't hit an ambiguous overload.
drop function public.update_room_settings(uuid, text, text);
create function public.update_room_settings(
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
  if p_track is not null and p_track not in ('oval', 'speedway', 'kidney', 'random') then
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
revoke execute on function public.update_room_settings(uuid, text, text, text) from public, anon;
grant execute on function public.update_room_settings(uuid, text, text, text) to authenticated;

-- v5: the race gets a concrete track (random picks one of the three).
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
    'LOBBY>SHOP', 'SHOP>LOBBY', 'ODDS_LOCKED>LOBBY', 'BETTING>LOBBY', 'PODIUM>LOBBY'
  ) then
    raise exception 'bad_transition';
  end if;
  if p_phase = 'SHOP' then
    if (select count(*) from public.room_players where room_id = p_room and ticked) < 2 then
      raise exception 'need_two_horses';
    end if;
    insert into public.races (room_id, length, prize, track)
    values (
      p_room, v_room.race_length, v_room.prize,
      case when v_room.track = 'random'
        then (array['oval', 'speedway', 'kidney'])[1 + floor(random() * 3)::int]
        else v_room.track end
    )
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
  elsif v_room.phase in ('SHOP', 'ODDS_LOCKED', 'BETTING') then
    -- Cancelling deletes the race and, with it, its topups, floors, purchases and bets: a full refund.
    delete from public.races where id = v_room.race_id;
  end if;
  update public.room_players set ready = false where room_id = p_room and ready;
  update public.rooms set phase = p_phase, race_id = v_race where id = p_room returning * into v_room;
  return v_room;
end;
$$;

-- v2: recent races also carry their track.
-- Everything /stats shows, in one call. Null unless the caller is in the office (member or host).
-- The race being run is left out until its podium, so nothing here spoils it.
create or replace function public.office_stats()
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
                 'podium', to_jsonb(x.finish_order[1:3]), 'replay', x.replay, 'track', x.track)
               order by x.started_at desc)
        from (select f.*, exists (select 1 from public.race_timelines t where t.race_id = f.id) as replay
              from fin f order by f.started_at desc limit 15) x), '[]'::jsonb)
    )
  );
end;
$$;
