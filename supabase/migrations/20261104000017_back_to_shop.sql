-- The big screen can go back from Betting (or a stuck "Calculating odds…") to the Shop: bets are
-- refunded and the odds cleared, but boxes, topups and floors stay. Lock odds prices the new field.

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
    update public.races set horses = '{}', odds = null where id = v_race;
  elsif p_phase = 'SHOP' then
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
