create or replace function public.touch_tracker_from_child()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tracker_id uuid;
begin
  if tg_op = 'DELETE' then
    v_tracker_id := old.tracker_id;
  else
    v_tracker_id := new.tracker_id;
  end if;

  update public.trackers
     set updated_at = clock_timestamp()
   where id = v_tracker_id;

  return null;
end;
$$;

drop trigger if exists overtime_periods_touch_tracker on public.overtime_periods;
create trigger overtime_periods_touch_tracker
after insert or update or delete on public.overtime_periods
for each row execute function public.touch_tracker_from_child();

drop trigger if exists expenses_touch_tracker on public.expenses;
create trigger expenses_touch_tracker
after insert or update or delete on public.expenses
for each row execute function public.touch_tracker_from_child();

revoke execute on function public.touch_tracker_from_child() from public, anon, authenticated;
grant execute on function public.touch_tracker_from_child() to service_role;
