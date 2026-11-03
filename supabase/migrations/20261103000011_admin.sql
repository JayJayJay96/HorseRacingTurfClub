-- /admin actions (spec §10). Service role only: the admin Edge Function checks the password first.

-- Locks an office member; p_active = false also finds archived ones.
create function private.office_member(p_player uuid, p_active boolean default true)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players;
begin
  select p.* into v_player
    from public.room_players p join public.rooms r on r.id = p.room_id
    where p.id = p_player and r.kind = 'office' and (not p_active or p.archived_at is null)
    for update of p;
  if not found then
    raise exception 'player_not_found';
  end if;
  return v_player;
end;
$$;
revoke execute on function private.office_member(uuid, boolean) from public;

create function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'room', jsonb_build_object('id', r.id, 'code', r.code, 'phase', r.phase),
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

create function public.admin_rename(p_player uuid, p_name text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.office_member(p_player, false);
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) not between 1 and 24 then
    raise exception 'bad_name';
  end if;
  update public.room_players set name = v_name where id = p_player returning * into v_player;
  update public.rooms set last_activity_at = now() where id = v_player.room_id;
  return v_player;
exception when unique_violation then
  raise exception 'name_taken';
end;
$$;

-- Removing keeps history (spec §10); only in the LOBBY so a race in progress keeps its horse.
create function public.admin_archive(p_player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.office_member(p_player);
begin
  if (select phase from public.rooms where id = v_player.room_id for update) <> 'LOBBY' then
    raise exception 'wrong_phase';
  end if;
  update public.room_players set archived_at = now(), ticked = false, ready = false, uid = null
    where id = p_player;
  update public.rooms set last_activity_at = now() where id = v_player.room_id;
end;
$$;

create function public.admin_reset_pin(p_player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.office_member(p_player);
begin
  update private.office_pins set pin_hash = null, fails = 0, locked_until = null where player_id = v_player.id;
end;
$$;

create function public.admin_adjust(p_player uuid, p_amount integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.office_member(p_player, false);
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then
    raise exception 'bad_amount';
  end if;
  if char_length(v_reason) not between 1 and 100 then
    raise exception 'bad_reason';
  end if;
  insert into public.coin_ledger (room_id, player_id, type, amount, reason)
  values (v_player.room_id, p_player, 'admin_adjust', p_amount, v_reason);
  update public.rooms set last_activity_at = now() where id = v_player.room_id;
end;
$$;

-- Deleting a race reverses its coin flows (its ledger rows cascade away).
create function public.admin_delete_race(p_race uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  select m.* into v_room from public.races x join public.rooms m on m.id = x.room_id
    where x.id = p_race and m.kind = 'office' for update of m;
  if not found then
    raise exception 'race_not_found';
  end if;
  if v_room.race_id = p_race then
    raise exception 'race_in_use';
  end if;
  delete from public.races where id = p_race;
  update public.rooms set last_activity_at = now() where id = v_room.id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_overview()', 'public.admin_rename(uuid, text)', 'public.admin_archive(uuid)',
    'public.admin_reset_pin(uuid)', 'public.admin_adjust(uuid, integer, text)', 'public.admin_delete_race(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
