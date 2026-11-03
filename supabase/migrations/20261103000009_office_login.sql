-- Phones join the office by picking their name and entering a 4-digit PIN (spec §10).

-- Service role only (the admin Edge Function). Defined here so login can be tested; more admin RPCs in 011.
create function public.admin_add_member(p_name text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid := (select id from public.rooms where kind = 'office');
  v_name text := btrim(coalesce(p_name, ''));
  v_player public.room_players;
begin
  if char_length(v_name) not between 1 and 24 then
    raise exception 'bad_name';
  end if;
  insert into public.room_players (room_id, name) values (v_room, v_name) returning * into v_player;
  -- New members start with 100 (spec §8); this row belongs to no race.
  insert into public.coin_ledger (room_id, player_id, type, amount) values (v_room, v_player.id, 'topup', 100);
  update public.rooms set last_activity_at = now() where id = v_room;
  return v_player;
exception when unique_violation then
  raise exception 'name_taken';
end;
$$;
revoke execute on function public.admin_add_member(text) from public, anon, authenticated;
grant execute on function public.admin_add_member(text) to service_role;

-- The device that unlocked the big screen with the admin password becomes the office host.
create function public.admin_claim_host(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.rooms set host_uid = p_uid, last_activity_at = now() where kind = 'office';
$$;
revoke execute on function public.admin_claim_host(uuid) from public, anon, authenticated;
grant execute on function public.admin_claim_host(uuid) to service_role;

-- Names to pick from on the login screen. Anyone signed in may read it; it shows nothing secret.
create function public.office_roster()
returns table (id uuid, name text, has_pin boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, coalesce(o.pin_hash is not null, false)
  from public.room_players p
  join public.rooms r on r.id = p.room_id and r.kind = 'office'
  left join private.office_pins o on o.player_id = p.id
  where p.archived_at is null
  order by lower(p.name);
$$;
revoke execute on function public.office_roster() from public, anon;
grant execute on function public.office_roster() to authenticated;

-- Returns the member on success and NULL for a wrong PIN: raising would roll back the fail count.
-- jsonb, not room_players: PostgREST turns a NULL composite into an object of nulls.
create function public.office_login(p_player uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players;
  v_pin private.office_pins;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  select p.* into v_player
    from public.room_players p join public.rooms r on r.id = p.room_id
    where p.id = p_player and r.kind = 'office' and p.archived_at is null
    for update of p;
  if not found then
    raise exception 'player_not_found';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'bad_pin';
  end if;
  insert into private.office_pins (player_id) values (p_player) on conflict do nothing;
  select * into v_pin from private.office_pins where player_id = p_player for update;
  if v_pin.locked_until > now() then
    raise exception 'pin_locked';
  end if;
  if v_pin.pin_hash is null then
    -- First login chooses the PIN.
    update private.office_pins
      set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), fails = 0, locked_until = null
      where player_id = p_player;
  elsif v_pin.pin_hash <> extensions.crypt(p_pin, v_pin.pin_hash) then
    -- 5 wrong tries lock the name for 5 minutes.
    update private.office_pins
      set fails = case when fails + 1 >= 5 then 0 else fails + 1 end,
          locked_until = case when fails + 1 >= 5 then now() + interval '5 minutes' end
      where player_id = p_player;
    return null;
  else
    update private.office_pins set fails = 0 where player_id = p_player;
  end if;
  -- One person per phone, one phone per person.
  update public.room_players set uid = null, ready = false
    where room_id = v_player.room_id and uid = auth.uid() and id <> p_player;
  update public.room_players set uid = auth.uid() where id = p_player returning * into v_player;
  update public.rooms set last_activity_at = now() where id = v_player.room_id;
  return to_jsonb(v_player);
end;
$$;
revoke execute on function public.office_login(uuid, text) from public, anon;
grant execute on function public.office_login(uuid, text) to authenticated;

create function public.office_logout(p_room uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.room_players p set uid = null, ready = false
    from public.rooms r
    where r.id = p_room and r.kind = 'office' and p.room_id = r.id and p.uid = auth.uid();
  update public.rooms set last_activity_at = now() where id = p_room and kind = 'office';
end;
$$;
revoke execute on function public.office_logout(uuid) from public, anon;
grant execute on function public.office_logout(uuid) to authenticated;

-- v3: the office is joined with office_login; the rejoin probe ('' name) still returns your entry.
create or replace function public.join_room(p_code text, p_name text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_phase text;
  v_kind text;
  v_name text := btrim(coalesce(p_name, ''));
  v_player public.room_players;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  select id, phase, kind into v_room_id, v_phase, v_kind from public.rooms where code = upper(btrim(p_code));
  if not found then
    raise exception 'room_not_found';
  end if;

  -- Same device again: return its entry (the name is ignored, so '' works as a rejoin probe).
  select * into v_player from public.room_players
    where room_id = v_room_id and uid = auth.uid() and archived_at is null;
  if found then
    return v_player;
  end if;
  if v_kind = 'office' then
    raise exception 'office_room';
  end if;

  if v_phase <> 'LOBBY' then
    raise exception 'wrong_phase';
  end if;
  if char_length(v_name) not between 1 and 24 then
    raise exception 'bad_name';
  end if;
  update public.rooms set last_activity_at = now() where id = v_room_id;

  -- A name the host typed (no phone yet) is claimed by the first phone that joins with it.
  update public.room_players set uid = auth.uid()
    where room_id = v_room_id and lower(name) = lower(v_name) and uid is null
    returning * into v_player;
  if found then
    return v_player;
  end if;

  if exists (select 1 from public.room_players where room_id = v_room_id and lower(name) = lower(v_name)) then
    raise exception 'name_taken';
  end if;
  if (select count(*) from public.room_players where room_id = v_room_id) >= 40 then
    raise exception 'room_full';
  end if;
  insert into public.room_players (room_id, uid, name)
  values (v_room_id, auth.uid(), v_name)
  returning * into v_player;
  return v_player;
exception when unique_violation then
  -- lost a race: same device joined twice (return its entry) or same name taken
  select * into v_player from public.room_players where room_id = v_room_id and uid = auth.uid();
  if found then
    return v_player;
  end if;
  raise exception 'name_taken';
end;
$$;

-- Office members style their own horse in the LOBBY. Null colour = lane default; '' name = none.
create function public.set_my_horse(p_room uuid, p_coat integer, p_silk integer, p_horse_name text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_my_player(p_room, 'LOBBY');
  v_name text := nullif(btrim(coalesce(p_horse_name, '')), '');
begin
  if (select kind from public.rooms where id = p_room) <> 'office' then
    raise exception 'office_only';
  end if;
  if p_coat not between 0 and 5 or p_silk not between 0 and 10 or char_length(v_name) > 24 then
    raise exception 'bad_horse';
  end if;
  update public.room_players set coat = p_coat, silk = p_silk, horse_name = v_name
    where id = v_player.id returning * into v_player;
  return v_player;
end;
$$;
revoke execute on function public.set_my_horse(uuid, integer, integer, text) from public, anon;
grant execute on function public.set_my_horse(uuid, integer, integer, text) to authenticated;
