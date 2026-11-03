-- Phase 5: Office mode (spec §2, §8, §10). One permanent room, code TURF; its room_players are the members.

create extension if not exists pgcrypto with schema extensions;

alter table public.rooms
  add column kind text not null default 'private' check (kind in ('private', 'office')),
  alter column host_uid drop not null,
  -- The office host is any device; deleting that auth user must not take the office and its history.
  drop constraint rooms_host_uid_fkey,
  add constraint rooms_host_uid_fkey foreign key (host_uid) references auth.users (id) on delete set null;
create unique index rooms_one_office_idx on public.rooms ((true)) where kind = 'office';

-- Office horses: cosmetic choices (null = lane default colours) and soft removal (history stays).
alter table public.room_players
  add column coat smallint check (coat between 0 and 5),
  add column silk smallint check (silk between 0 and 10),
  add column horse_name text
    check (horse_name is null or (char_length(horse_name) between 1 and 24 and horse_name = btrim(horse_name))),
  add column archived_at timestamptz;

-- PIN data lives in the private schema: no client can select it.
create table private.office_pins (
  player_id uuid primary key references public.room_players (id) on delete cascade,
  pin_hash text,
  fails integer not null default 0,
  locked_until timestamptz
);
-- Only security-definer functions touch it: no grants, RLS on with no policies.
revoke all on private.office_pins from public, anon, authenticated;
alter table private.office_pins enable row level security;

-- Coins outside any race: the starting 100 (topup) and admin adjustments (with a reason).
alter table public.coin_ledger
  alter column race_id drop not null,
  add column reason text check (reason is null or char_length(reason) between 1 and 100),
  drop constraint coin_ledger_type_check,
  add constraint coin_ledger_type_check
    check (type in ('topup', 'floor', 'purchase', 'bet', 'unbet', 'payout', 'admin_adjust')),
  add constraint coin_ledger_admin_reason_check check ((type = 'admin_adjust') = (reason is not null)),
  add constraint coin_ledger_raceless_check check (race_id is not null or type in ('topup', 'admin_adjust'));
create index coin_ledger_player_idx on public.coin_ledger (player_id);

-- v2: a null host (the office before anyone unlocks it) is nobody. `<>` would let everyone through.
create or replace function private.lock_host_room(p_room uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_room.host_uid is distinct from auth.uid() then
    raise exception 'not_host';
  end if;
  update public.rooms set last_activity_at = now() where id = p_room;
  return v_room;
end;
$$;

-- v2: Office wallets carry over (every row of the member); Private coins live per race.
create or replace function private.balance(p_race uuid, p_player uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(l.amount), 0)::integer
  from public.coin_ledger l
  where l.player_id = p_player
    and (l.race_id = p_race
         or exists (select 1 from public.rooms r where r.id = l.room_id and r.kind = 'office'));
$$;

-- Every member's balance in one call (replaces fetching the ledger). Empty for non-members.
create function public.room_balances(p_room uuid)
returns table (player_id uuid, balance integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, private.balance(r.race_id, p.id)
  from public.rooms r
  join public.room_players p on p.room_id = r.id
  where r.id = p_room and p.archived_at is null and private.is_room_member(p_room);
$$;
revoke execute on function public.room_balances(uuid) from public, anon;
grant execute on function public.room_balances(uuid) to authenticated;

-- v2: only Private rooms expire.
create or replace function public.cleanup_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.rooms where kind = 'private' and last_activity_at < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

insert into public.rooms (code, kind) values ('TURF', 'office');
