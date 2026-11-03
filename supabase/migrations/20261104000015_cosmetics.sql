-- Phase 9: cosmetic shop. Office members buy horse patterns and trails with coins, then equip them.
-- Catalog prices live in private.cosmetic_price (mirror it in the client shop UI).

-- Cosmetic purchases are raceless ledger rows. private.balance (v2, _0008) already sums every row of an
-- office member regardless of type or race, so they count in buy_box, bets and room_balances.
alter table public.coin_ledger
  drop constraint coin_ledger_type_check,
  add constraint coin_ledger_type_check
    check (type in ('topup', 'floor', 'purchase', 'bet', 'unbet', 'payout', 'admin_adjust', 'cosmetic')),
  drop constraint coin_ledger_raceless_check,
  add constraint coin_ledger_raceless_check
    check (race_id is not null or type in ('topup', 'admin_adjust', 'cosmetic'));

create table public.player_cosmetics (
  player_id uuid references public.room_players (id) on delete cascade,
  code text not null,
  bought_at timestamptz not null default now(),
  primary key (player_id, code)
);
revoke all on public.player_cosmetics from anon, authenticated;
grant select on public.player_cosmetics to authenticated;
alter table public.player_cosmetics enable row level security;
create policy "members read cosmetics" on public.player_cosmetics
  for select to authenticated using (
    private.is_room_member((select p.room_id from public.room_players p where p.id = player_id))
  );

-- Equipped cosmetics (null = none).
alter table public.room_players
  add column pattern text check (pattern like 'pattern:%'),
  add column trail text check (trail like 'trail:%');

create function private.cosmetic_price(p_code text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_code
    when 'pattern:hoops' then 150
    when 'pattern:sash' then 150
    when 'pattern:stars' then 200
    when 'trail:dust' then 250
    when 'trail:sparkle' then 400
  end;
$$;
revoke execute on function private.cosmetic_price(text) from public;

-- Like lock_my_player, minus the phase: locks the room then the caller's active office player row.
create function private.lock_office_member(p_room uuid)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_player public.room_players;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  select kind into v_kind from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  select * into v_player from public.room_players
    where room_id = p_room and uid = auth.uid() and archived_at is null for update;
  if not found then
    raise exception 'not_in_room';
  end if;
  if v_kind <> 'office' then
    raise exception 'office_only';
  end if;
  update public.rooms set last_activity_at = now() where id = p_room;
  return v_player;
end;
$$;
revoke execute on function private.lock_office_member(uuid) from public;

-- Returns the new balance. Debit and ownership happen in this one transaction.
create function public.buy_cosmetic(p_room uuid, p_code text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_office_member(p_room);
  v_race uuid;
  v_price integer := private.cosmetic_price(p_code);
  v_balance integer;
begin
  -- Wallets must not change mid-race.
  if (select phase from public.rooms where id = p_room) = 'RUNNING' then
    raise exception 'wrong_phase';
  end if;
  if v_price is null then
    raise exception 'unknown_cosmetic';
  end if;
  if exists (select 1 from public.player_cosmetics where player_id = v_player.id and code = p_code) then
    raise exception 'already_owned';
  end if;
  v_race := (select race_id from public.rooms where id = p_room);
  v_balance := private.balance(v_race, v_player.id);
  if v_balance < v_price then
    raise exception 'not_enough_coins';
  end if;
  insert into public.player_cosmetics (player_id, code) values (v_player.id, p_code);
  insert into public.coin_ledger (room_id, player_id, type, amount)
  values (p_room, v_player.id, 'cosmetic', -v_price);
  return v_balance - v_price;
end;
$$;
revoke execute on function public.buy_cosmetic(uuid, text) from public, anon;
grant execute on function public.buy_cosmetic(uuid, text) to authenticated;

-- p_slot is 'pattern' or 'trail'; a null p_code unequips.
create function public.equip_cosmetic(p_room uuid, p_slot text, p_code text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_office_member(p_room);
begin
  if p_slot is null or p_slot not in ('pattern', 'trail')
     or (p_code is not null and p_code not like p_slot || ':%') then
    raise exception 'wrong_slot';
  end if;
  if p_code is not null
     and not exists (select 1 from public.player_cosmetics where player_id = v_player.id and code = p_code) then
    raise exception 'not_owned';
  end if;
  update public.room_players
    set pattern = case when p_slot = 'pattern' then p_code else pattern end,
        trail = case when p_slot = 'trail' then p_code else trail end
    where id = v_player.id returning * into v_player;
  return v_player;
end;
$$;
revoke execute on function public.equip_cosmetic(uuid, text, text) from public, anon;
grant execute on function public.equip_cosmetic(uuid, text, text) to authenticated;
