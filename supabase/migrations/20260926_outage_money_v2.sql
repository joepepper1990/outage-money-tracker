create extension if not exists btree_gist;

create table if not exists public.trackers (
  id uuid primary key default gen_random_uuid(),
  access_key_hash text not null check (access_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.overtime_periods (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  multiplier numeric(2,1) not null check (multiplier in (1.5, 2.0)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint overtime_finish_after_start check (end_time > start_time),
  constraint overtime_no_overlap exclude using gist (
    tracker_id with =,
    tsrange(work_date + start_time, work_date + end_time, '[)') with &&
  )
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  description text not null check (length(btrim(description)) between 1 and 160),
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_outage_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trackers_set_updated_at
before update on public.trackers
for each row execute function public.set_outage_updated_at();

create trigger overtime_periods_set_updated_at
before update on public.overtime_periods
for each row execute function public.set_outage_updated_at();

create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function public.set_outage_updated_at();

create index if not exists overtime_periods_tracker_date_idx
  on public.overtime_periods(tracker_id, work_date, start_time);
create index if not exists expenses_tracker_date_idx
  on public.expenses(tracker_id, expense_date);

alter table public.trackers enable row level security;
alter table public.overtime_periods enable row level security;
alter table public.expenses enable row level security;

revoke all on public.trackers from anon, authenticated;
revoke all on public.overtime_periods from anon, authenticated;
revoke all on public.expenses from anon, authenticated;

grant select, insert, update, delete on public.trackers to service_role;
grant select, insert, update, delete on public.overtime_periods to service_role;
grant select, insert, update, delete on public.expenses to service_role;
