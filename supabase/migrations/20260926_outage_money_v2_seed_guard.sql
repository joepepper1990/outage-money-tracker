alter table public.trackers
  add column if not exists initialized_at timestamptz;

create or replace function public.tracker_seed_internal(
  p_tracker_id uuid,
  p_periods jsonb,
  p_expenses jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.trackers
     set initialized_at = now()
   where id = p_tracker_id
     and initialized_at is null
     and not exists (select 1 from public.overtime_periods where tracker_id = p_tracker_id)
     and not exists (select 1 from public.expenses where tracker_id = p_tracker_id);

  if not found then return false; end if;

  insert into public.overtime_periods (id, tracker_id, work_date, start_time, end_time, multiplier)
  select
    case when (x.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then x.id::uuid else gen_random_uuid() end,
    p_tracker_id, x.date::date, x.start::time, x."end"::time, x.multiplier::numeric
  from jsonb_to_recordset(coalesce(p_periods, '[]'::jsonb))
    as x(id text, date text, start text, "end" text, multiplier numeric);

  insert into public.expenses (id, tracker_id, description, amount, expense_date)
  select
    case when (x.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then x.id::uuid else gen_random_uuid() end,
    p_tracker_id, x.description, x.amount, x.date::date
  from jsonb_to_recordset(coalesce(p_expenses, '[]'::jsonb))
    as x(id text, description text, amount numeric, date text);

  return true;
exception
  when others then
    update public.trackers set initialized_at = null where id = p_tracker_id;
    raise;
end;
$$;

revoke execute on function public.tracker_seed_internal(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.tracker_seed_internal(uuid,jsonb,jsonb) to service_role;
