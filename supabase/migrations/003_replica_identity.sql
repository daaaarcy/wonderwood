-- Realtime postgres_changes on UPDATE needs the full row available.
alter table public.households replica identity full;
