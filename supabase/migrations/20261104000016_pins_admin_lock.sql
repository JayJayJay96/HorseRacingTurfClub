-- /admin sets every PIN (no more first-login claims), a PIN reset signs the phone out, and the
-- admin password lockout counts misses per device, so one prankster can't lock the real admin out.

-- Shared by add and reset. Callers hold the room and member locks.
create function private.set_pin(p_player uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'bad_pin';
  end if;
  insert into private.office_pins (player_id, pin_hash)
    values (p_player, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (player_id) do update set pin_hash = excluded.pin_hash, fails = 0, locked_until = null;
end;
$$;
revoke execute on function private.set_pin(uuid, text) from public;

drop function public.admin_add_member(text);
create function public.admin_add_member(p_name text, p_pin text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid := (select id from public.rooms where kind = 'office' for update); -- room lock first
  v_name text := btrim(coalesce(p_name, ''));
  v_player public.room_players;
begin
  if char_length(v_name) not between 1 and 24 then
    raise exception 'bad_name';
  end if;
  insert into public.room_players (room_id, name) values (v_room, v_name) returning * into v_player;
  perform private.set_pin(v_player.id, p_pin);
  -- New members start with 100 (spec §8); this row belongs to no race.
  insert into public.coin_ledger (room_id, player_id, type, amount) values (v_room, v_player.id, 'topup', 100);
  update public.rooms set last_activity_at = now() where id = v_room;
  return v_player;
exception when unique_violation then
  raise exception 'name_taken';
end;
$$;

-- Sets a new PIN and signs out the phone that held the name (e.g. someone who claimed it).
drop function public.admin_reset_pin(uuid);
create function public.admin_reset_pin(p_player uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.office_member(p_player);
begin
  perform private.set_pin(v_player.id, p_pin);
  update public.room_players set uid = null, ready = false where id = v_player.id;
  update public.rooms set last_activity_at = now() where id = v_player.room_id;
end;
$$;

-- v2: a name without a PIN can't be signed into (was: the first login chose it).
create or replace function public.office_login(p_player uuid, p_pin text)
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
  -- Room before player, like every other lock path (no deadlocks).
  perform 1 from public.rooms where kind = 'office' for update;
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
  select * into v_pin from private.office_pins where player_id = p_player for update;
  if v_pin.pin_hash is null then
    raise exception 'no_pin';
  end if;
  if v_pin.locked_until > now() then
    raise exception 'pin_locked';
  end if;
  if v_pin.pin_hash <> extensions.crypt(p_pin, v_pin.pin_hash) then
    -- 5 wrong tries lock the name for 5 minutes.
    update private.office_pins
      set fails = case when fails + 1 >= 5 then 0 else fails + 1 end,
          locked_until = case when fails + 1 >= 5 then now() + interval '5 minutes' end
      where player_id = p_player;
    return null;
  end if;
  update private.office_pins set fails = 0 where player_id = p_player;
  -- One person per phone, one phone per person.
  update public.room_players set uid = null, ready = false
    where room_id = v_player.room_id and uid = auth.uid() and id <> p_player;
  update public.room_players set uid = auth.uid(), ready = false where id = p_player returning * into v_player;
  update public.rooms set last_activity_at = now() where id = v_player.room_id;
  return to_jsonb(v_player);
end;
$$;

-- Admin lockout per device (anonymous uid): 10 misses lock that device for 10 minutes.
drop function public.admin_gate(boolean);
drop table private.admin_guard;
create table private.admin_guard (
  uid uuid primary key,
  fails integer not null default 0,
  locked_until timestamptz
);
revoke all on private.admin_guard from public, anon, authenticated;
alter table private.admin_guard enable row level security;

create function public.admin_gate(p_ok boolean, p_uid uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guard private.admin_guard;
begin
  insert into private.admin_guard (uid) values (p_uid) on conflict do nothing;
  select * into v_guard from private.admin_guard where uid = p_uid for update;
  if v_guard.locked_until > now() then
    return 'admin_locked';
  end if;
  if p_ok then
    update private.admin_guard set fails = 0, locked_until = null where uid = p_uid;
    return 'ok';
  end if;
  if v_guard.fails + 1 >= 10 then
    update private.admin_guard set fails = 0, locked_until = now() + interval '10 minutes' where uid = p_uid;
  else
    update private.admin_guard set fails = v_guard.fails + 1 where uid = p_uid;
  end if;
  return 'bad_password';
end;
$$;

create or replace function public.admin_gate_reset()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.admin_guard where true;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_add_member(text, text)', 'public.admin_reset_pin(uuid, text)',
    'public.admin_gate(boolean, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
