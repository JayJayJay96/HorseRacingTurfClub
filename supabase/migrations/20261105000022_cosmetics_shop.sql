-- Cosmetics shop (spec 2026-11-05-cosmetics-shop-design): more patterns and trails, caps and victory
-- celebrations (new slots), and a 250-coin mystery crate. The catalogue is mirrored by COSMETICS and
-- CRATE_PRICE in src/shop/cosmetics.ts (src/shop/cosmetics.test.ts parses this file). Display only:
-- the race engine never reads these columns.

-- One list for prices and the crate. Keep the client order.
create function private.cosmetic_catalog()
returns table (code text, price integer)
language sql
immutable
set search_path = ''
as $$
  values
    ('pattern:hoops'::text, 150),
    ('pattern:sash', 150),
    ('pattern:stars', 200),
    ('pattern:chevrons', 150),
    ('pattern:quarters', 150),
    ('pattern:dots', 200),
    ('pattern:lightning', 250),
    ('trail:dust', 250),
    ('trail:sparkle', 400),
    ('trail:hearts', 300),
    ('trail:fire', 400),
    ('trail:rainbow', 500),
    ('trail:bubbles', 300),
    ('cap:pompom', 200),
    ('cap:horns', 250),
    ('cap:halo', 300),
    ('cap:crown', 400),
    ('celebration:spin', 500),
    ('celebration:fireworks', 650),
    ('celebration:moonwalk', 650),
    ('celebration:cannon', 800)
$$;
revoke execute on function private.cosmetic_catalog() from public;

-- Same signature as _0015, so buy_cosmetic picks up the new codes; privileges are kept.
create or replace function private.cosmetic_price(p_code text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select c.price from private.cosmetic_catalog() c where c.code = p_code;
$$;

-- Equipped cap and celebration (null = none), checked by prefix like pattern/trail (_0015).
alter table public.room_players
  add column cap text check (cap like 'cap:%'),
  add column celebration text check (celebration like 'celebration:%');

-- _0015's equip_cosmetic with the two new slots.
create or replace function public.equip_cosmetic(p_room uuid, p_slot text, p_code text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_office_member(p_room);
begin
  if p_slot is null or p_slot not in ('pattern', 'trail', 'cap', 'celebration')
     or (p_code is not null and p_code not like p_slot || ':%') then
    raise exception 'wrong_slot';
  end if;
  if p_code is not null
     and not exists (select 1 from public.player_cosmetics where player_id = v_player.id and code = p_code) then
    raise exception 'not_owned';
  end if;
  update public.room_players
    set pattern = case when p_slot = 'pattern' then p_code else pattern end,
        trail = case when p_slot = 'trail' then p_code else trail end,
        cap = case when p_slot = 'cap' then p_code else cap end,
        celebration = case when p_slot = 'celebration' then p_code else celebration end
    where id = v_player.id returning * into v_player;
  return v_player;
end;
$$;

-- Mystery crate: 250 coins for a random item the caller doesn't own, chance proportional to 1/price.
-- Exponential race: each candidate draws Exp(1) * price and the smallest wins, which picks code i with
-- probability (1/price_i) / sum(1/price). Same locking as buy_cosmetic; LOBBY only.
create function public.open_crate(p_room uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_office_member(p_room);
  v_code text;
  v_balance integer;
begin
  if (select phase from public.rooms where id = p_room) <> 'LOBBY' then
    raise exception 'wrong_phase';
  end if;
  select c.code into v_code
    from private.cosmetic_catalog() c
    where not exists (
      select 1 from public.player_cosmetics o where o.player_id = v_player.id and o.code = c.code
    )
    order by -ln(1 - random()) * c.price
    limit 1;
  if v_code is null then
    raise exception 'nothing_left';
  end if;
  v_balance := private.balance((select race_id from public.rooms where id = p_room), v_player.id);
  if v_balance < 250 then
    raise exception 'not_enough_coins';
  end if;
  insert into public.player_cosmetics (player_id, code) values (v_player.id, v_code);
  insert into public.coin_ledger (room_id, player_id, type, amount)
  values (p_room, v_player.id, 'cosmetic', -250);
  return v_code;
end;
$$;
revoke execute on function public.open_crate(uuid) from public, anon;
grant execute on function public.open_crate(uuid) to authenticated;
