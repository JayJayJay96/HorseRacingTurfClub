-- Host-driven phase changes. Phase 3 adds SHOP -> ODDS_LOCKED -> BETTING -> RUNNING via Edge Functions.

create function public.set_phase(p_room uuid, p_phase text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_host_room(p_room);
begin
  if v_room.phase || '>' || coalesce(p_phase, '') not in ('LOBBY>SHOP', 'SHOP>LOBBY', 'PODIUM>LOBBY') then
    raise exception 'bad_transition';
  end if;
  if p_phase = 'SHOP'
     and (select count(*) from public.room_players where room_id = p_room and ticked) < 2 then
    raise exception 'need_two_horses';
  end if;
  update public.room_players set ready = false where room_id = p_room and ready;
  update public.rooms set phase = p_phase where id = p_room returning * into v_room;
  return v_room;
end;
$$;
revoke execute on function public.set_phase(uuid, text) from public, anon;
grant execute on function public.set_phase(uuid, text) to authenticated;

create function public.set_ready(p_room uuid, p_ready boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase text;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  -- FOR SHARE waits for a concurrent set_phase, so a stale Ready can't survive a phase change.
  select phase into v_phase from public.rooms where id = p_room for share;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_phase not in ('SHOP', 'BETTING') then
    raise exception 'wrong_phase';
  end if;
  update public.room_players set ready = coalesce(p_ready, false)
    where room_id = p_room and uid = auth.uid();
  if not found then
    raise exception 'not_in_room';
  end if;
end;
$$;
revoke execute on function public.set_ready(uuid, boolean) from public, anon;
grant execute on function public.set_ready(uuid, boolean) to authenticated;
