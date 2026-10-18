-- Allow authorized staff dashboards to receive new orders, low-stock changes,
-- and pending review insert events. Existing RLS policies still control who
-- can see each row through Supabase Realtime.
do $$
declare
  target_table text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'The supabase_realtime publication does not exist';
  end if;

  foreach target_table in array array['orders', 'products', 'reviews'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end;
$$;

-- Realtime needs the prior stock value to alert only when a product crosses
-- from above its threshold to at or below it.
alter table public.products replica identity full;
