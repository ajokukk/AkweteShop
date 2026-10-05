-- Optional but recommended: lets the website and the mobile app see each other's bag changes instantly.
-- Run once in Supabase > SQL Editor. Without it, the bag still syncs when you reopen the app / return to the tab / pull to refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'carts'
  ) then
    alter publication supabase_realtime add table public.carts;
  end if;
end $$;
