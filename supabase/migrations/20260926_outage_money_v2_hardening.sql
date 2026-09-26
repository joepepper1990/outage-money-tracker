create schema if not exists extensions;

alter extension btree_gist set schema extensions;

drop policy if exists "deny direct tracker access" on public.trackers;
create policy "deny direct tracker access"
on public.trackers
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny direct overtime access" on public.overtime_periods;
create policy "deny direct overtime access"
on public.overtime_periods
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny direct expense access" on public.expenses;
create policy "deny direct expense access"
on public.expenses
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
