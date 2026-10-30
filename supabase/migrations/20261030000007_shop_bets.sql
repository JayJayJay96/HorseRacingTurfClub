-- Phone actions: buy boxes (SHOP), bet and unbet (BETTING).
-- Prices mirror PRICES in src/sim/config.ts (tests/db/shop.test.ts checks them).

-- Locks the room (so a phase change can't interleave) and then the caller's own player row
-- (serializing their coin spending). Bumps room activity, which also pings Realtime clients.
create function private.lock_my_player(p_room uuid, p_phase text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase text;
  v_player public.room_players;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  select phase into v_phase from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  select * into v_player from public.room_players where room_id = p_room and uid = auth.uid() for update;
  if not found then
    raise exception 'not_in_room';
  end if;
  if v_phase <> p_phase then
    raise exception 'wrong_phase';
  end if;
  update public.rooms set last_activity_at = now() where id = p_room;
  return v_player;
end;
$$;
revoke execute on function private.lock_my_player(uuid, text) from public;

create function public.buy_box(p_room uuid, p_box text)
returns public.purchases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_my_player(p_room, 'SHOP');
  v_race uuid := (select race_id from public.rooms where id = p_room);
  v_price integer := case p_box when 'speed' then 60 when 'defense' then 35 when 'attack' then 20 end;
  v_purchase public.purchases;
begin
  if v_price is null then
    raise exception 'bad_box';
  end if;
  if not v_player.ticked then
    raise exception 'not_racing';
  end if;
  if (select count(*) from public.purchases where race_id = v_race and player_id = v_player.id) >= 3 then
    raise exception 'max_boxes';
  end if;
  if private.balance(v_race, v_player.id) < v_price then
    raise exception 'not_enough_coins';
  end if;
  insert into public.purchases (race_id, room_id, player_id, box, price)
  values (v_race, p_room, v_player.id, p_box, v_price)
  returning * into v_purchase;
  insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
  values (v_race, p_room, v_player.id, 'purchase', -v_price);
  return v_purchase;
end;
$$;
revoke execute on function public.buy_box(uuid, text) from public, anon;
grant execute on function public.buy_box(uuid, text) to authenticated;

create function public.place_bet(p_room uuid, p_horse uuid, p_kind text, p_stake integer)
returns public.bets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_my_player(p_room, 'BETTING');
  v_race public.races;
  v_bet public.bets;
begin
  select r.* into v_race from public.races r join public.rooms m on m.race_id = r.id where m.id = p_room;
  -- With 3 or fewer horses every horse places, so a Place bet could not lose.
  if p_kind is null or p_kind not in ('win', 'place')
     or (p_kind = 'place' and cardinality(v_race.horses) <= 3) then
    raise exception 'bad_bet';
  end if;
  if p_horse is null or not (p_horse = any (v_race.horses)) then
    raise exception 'not_in_race';
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
  values (v_race.id, p_room, v_player.id, p_horse, p_kind, p_stake,
          (v_race.odds -> p_horse::text ->> p_kind)::numeric)
  returning * into v_bet;
  insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
  values (v_race.id, p_room, v_player.id, 'bet', -p_stake);
  return v_bet;
end;
$$;
revoke execute on function public.place_bet(uuid, uuid, text, integer) from public, anon;
grant execute on function public.place_bet(uuid, uuid, text, integer) to authenticated;

create function public.cancel_bet(p_bet uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_player public.room_players;
  v_bet public.bets;
begin
  select room_id into v_room_id from public.bets where id = p_bet;
  if not found then
    raise exception 'bet_not_found';
  end if;
  v_player := private.lock_my_player(v_room_id, 'BETTING');
  -- Recheck under the lock: own bet, current race, not yet settled.
  select b.* into v_bet from public.bets b join public.rooms m on m.race_id = b.race_id
    where b.id = p_bet and b.player_id = v_player.id and m.id = v_room_id and b.payout is null;
  if not found then
    raise exception 'bet_not_found';
  end if;
  delete from public.bets where id = p_bet;
  insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
  values (v_bet.race_id, v_room_id, v_player.id, 'unbet', v_bet.stake);
end;
$$;
revoke execute on function public.cancel_bet(uuid) from public, anon;
grant execute on function public.cancel_bet(uuid) to authenticated;
