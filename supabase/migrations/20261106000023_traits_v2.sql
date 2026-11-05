-- Traits v2 (spec 2026-11-06 B): Closer, Front-runner, Gambler, Brawler. Mirrors TRAIT_CODES.

alter table public.room_players drop constraint room_players_trait_check;
alter table public.room_players add constraint room_players_trait_check
  check (trait in ('normal', 'charmed', 'tough', 'sprinter', 'stayer', 'mudder',
                   'closer', 'frontrunner', 'gambler', 'brawler'));

-- v2: the new trait codes. Otherwise unchanged from migration 0021.
create or replace function public.set_trait(p_room uuid, p_trait text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_my_player(p_room, 'SHOP');
begin
  if p_trait is null
     or p_trait not in ('normal', 'charmed', 'tough', 'sprinter', 'stayer', 'mudder',
                        'closer', 'frontrunner', 'gambler', 'brawler') then
    raise exception 'bad_trait';
  end if;
  if not v_player.ticked then
    raise exception 'not_racing';
  end if;
  update public.room_players set trait = p_trait where id = v_player.id returning * into v_player;
  return v_player;
end;
$$;
