-- Private rooms: phones pick a name the host pre-entered and may claim it until Start (late claimers get
-- the race's 100 coins). Hosts may cancel a race until Start; deleting it refunds everything (both modes).

-- Unclaimed host-typed names for the phone join screen. Anyone signed in with the code may see them.
create function public.private_roster(p_code text)
returns table (id uuid, name text, ticked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.ticked
  from public.rooms r join public.room_players p on p.room_id = r.id
  where r.code = upper(btrim(p_code)) and r.kind = 'private' and p.uid is null
  order by p.joined_at, p.id;
$$;
revoke execute on function public.private_roster(text) from public, anon;
grant execute on function public.private_roster(text) to authenticated;

-- v4: pre-entered names can be claimed in LOBBY..BETTING; new names still only in the LOBBY.
create or replace function public.join_room(p_code text, p_name text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_name text := btrim(coalesce(p_name, ''));
  v_player public.room_players;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  -- Room first (same lock order as every other RPC), so a claim can't interleave with a phase change.
  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  -- Same device again: return its entry (the name is ignored, so '' works as a rejoin probe).
  select * into v_player from public.room_players
    where room_id = v_room.id and uid = auth.uid() and archived_at is null;
  if found then
    return v_player;
  end if;
  if v_room.kind = 'office' then
    raise exception 'office_room';
  end if;

  -- A name the host typed (no phone yet) is claimed by the first phone that picks it, until Start.
  if v_room.phase in ('LOBBY', 'SHOP', 'ODDS_LOCKED', 'BETTING') and v_name <> '' then
    update public.room_players set uid = auth.uid()
      where room_id = v_room.id and lower(name) = lower(v_name) and uid is null
      returning * into v_player;
    if found then
      -- Private coins are per race: a phone that arrives after the shop opened gets this race's 100.
      if v_room.race_id is not null then
        insert into public.coin_ledger (race_id, room_id, player_id, type, amount)
        values (v_room.race_id, v_room.id, v_player.id, 'topup', 100);
      end if;
      update public.rooms set last_activity_at = now() where id = v_room.id;
      return v_player;
    end if;
  end if;

  if v_room.phase <> 'LOBBY' then
    raise exception 'wrong_phase';
  end if;
  if char_length(v_name) not between 1 and 24 then
    raise exception 'bad_name';
  end if;
  if exists (select 1 from public.room_players where room_id = v_room.id and lower(name) = lower(v_name)) then
    raise exception 'name_taken';
  end if;
  if (select count(*) from public.room_players where room_id = v_room.id) >= 40 then
    raise exception 'room_full';
  end if;
  update public.rooms set last_activity_at = now() where id = v_room.id;
  insert into public.room_players (room_id, uid, name)
  values (v_room.id, auth.uid(), v_name)
  returning * into v_player;
  return v_player;
exception when unique_violation then
  -- lost a race: same device joined twice (return its entry) or same name taken
  select * into v_player from public.room_players
    where room_id = v_room.id and uid = auth.uid() and archived_at is null;
  if found then
    return v_player;
  end if;
  raise exception 'name_taken';
end;
$$;

-- v4: a race can also be cancelled in ODDS_LOCKED and BETTING (until Start).
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
    insert into public.races (room_id, length, prize)
    values (p_room, v_room.race_length, v_room.prize)
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
