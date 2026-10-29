-- Private rooms are deleted 24 h after their last activity (spec §2).
create function public.cleanup_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.rooms where last_activity_at < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.cleanup_rooms() from public, anon, authenticated;
grant execute on function public.cleanup_rooms() to service_role;

create extension if not exists pg_cron;
select cron.schedule('cleanup-rooms', '17 * * * *', 'select public.cleanup_rooms()');

-- Clients refetch on any change; RLS decides who receives each event.
do $$
declare
  t text;
begin
  foreach t in array array['rooms', 'room_players'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
