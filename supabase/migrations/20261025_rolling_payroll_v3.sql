create table if not exists public.payroll_profiles (
  tracker_id uuid primary key references public.trackers(id) on delete cascade,
  annual_salary numeric(12,2) not null check (annual_salary > 0),
  salary_effective_date date not null,
  pension_rate numeric(8,6) not null check (pension_rate >= 0 and pension_rate <= 1),
  pension_effective_date date not null,
  emergency_annual_amount numeric(14,6) not null check (emergency_annual_amount >= 0),
  emergency_effective_date date not null,
  standby_daily_rate numeric(14,8) not null check (standby_daily_rate >= 0),
  standby_effective_date date not null,
  overtime_rate_15 numeric(14,8) not null check (overtime_rate_15 >= 0),
  overtime_rate_2 numeric(14,8) not null check (overtime_rate_2 >= 0),
  pay_day smallint not null default 21 check (pay_day between 1 and 28),
  tax_code text not null default '1257L' check (length(btrim(tax_code)) between 1 and 12),
  tax_basis text not null default 'cumulative' check (tax_basis in ('cumulative','month1')),
  ni_category text not null default 'A' check (length(ni_category)=1),
  outside_income numeric(12,2) not null default 0,
  holiday_bonus_pay_month smallint not null default 4 check (holiday_bonus_pay_month between 1 and 12),
  bank_holiday_overrides jsonb not null default '[]'::jsonb check (jsonb_typeof(bank_holiday_overrides)='array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.standby_claims (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  work_date date not null,
  units numeric(8,2) not null check (units > 0 and units <= 62),
  rate_override numeric(14,8),
  public_holiday boolean not null default false,
  notes text check (notes is null or length(notes) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists standby_claims_tracker_date_idx on public.standby_claims(tracker_id,work_date);

create table if not exists public.payroll_events (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  event_type text not null check (event_type in ('pension_rate','tax_code','tax_basis','ni_category','salary_override','emergency_annual','standby_daily')),
  effective_date date not null,
  value_numeric numeric(16,8),
  value_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (value_numeric is not null or (value_text is not null and length(btrim(value_text)) > 0))
);
create index if not exists payroll_events_tracker_date_idx on public.payroll_events(tracker_id,effective_date,event_type);

create table if not exists public.pay_deals (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  agreed_date date not null,
  arrears_pay_month date,
  components jsonb not null default '[]'::jsonb check (jsonb_typeof(components)='array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pay_deals_tracker_idx on public.pay_deals(tracker_id,agreed_date);

create table if not exists public.recurring_pay_items (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  amount numeric(12,2) not null check (amount >= 0),
  start_pay_month date not null,
  end_pay_month date,
  reduces_cash boolean not null default true,
  reduces_paye boolean not null default false,
  reduces_ni boolean not null default false,
  taxable_benefit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_pay_month is null or end_pay_month >= start_pay_month)
);
create index if not exists recurring_pay_items_tracker_idx on public.recurring_pay_items(tracker_id,start_pay_month,end_pay_month);

create table if not exists public.payslip_actuals (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  pay_month date not null,
  pay_date date not null,
  tax_period smallint check (tax_period between 1 and 12),
  tax_code text,
  tax_basis text,
  ni_category text,
  basic_pay numeric(12,2),
  emergency_pay numeric(12,2),
  standby_days numeric(8,2),
  standby_pay numeric(12,2),
  ot15_hours numeric(10,2),
  ot15_pay numeric(12,2),
  ot2_hours numeric(10,2),
  ot2_pay numeric(12,2),
  holiday_bonus numeric(12,2),
  arrears_pay numeric(12,2),
  other_pay numeric(12,2),
  pension numeric(12,2),
  paye_tax numeric(12,2),
  employee_ni numeric(12,2),
  taxable_benefits numeric(12,2),
  gross_taxable numeric(12,2),
  net_pay numeric(12,2),
  ytd_taxable numeric(14,2) not null,
  ytd_tax numeric(14,2) not null,
  ytd_ni numeric(14,2) not null,
  ytd_pension numeric(14,2) not null,
  ytd_taxable_benefits numeric(14,2),
  ytd_superannuable numeric(14,2),
  forecast_snapshot jsonb,
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tracker_id,pay_month)
);
create index if not exists payslip_actuals_tracker_month_idx on public.payslip_actuals(tracker_id,pay_month);

do $$ declare t text; begin
  foreach t in array array['payroll_profiles','standby_claims','payroll_events','pay_deals','recurring_pay_items','payslip_actuals'] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I',t,t);
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_outage_updated_at()',t,t);
    execute format('drop trigger if exists %I_touch_tracker on public.%I',t,t);
    execute format('create trigger %I_touch_tracker after insert or update or delete on public.%I for each row execute function public.touch_tracker_from_child()',t,t);
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to service_role',t);
    execute format('drop policy if exists %I on public.%I','deny direct '||t||' access',t);
    execute format('create policy %I on public.%I as restrictive for all to anon, authenticated using (false) with check (false)','deny direct '||t||' access',t);
  end loop;
end $$;

insert into public.payroll_profiles (
  tracker_id,annual_salary,salary_effective_date,pension_rate,pension_effective_date,
  emergency_annual_amount,emergency_effective_date,standby_daily_rate,standby_effective_date,
  overtime_rate_15,overtime_rate_2,pay_day,tax_code,tax_basis,ni_category,outside_income,holiday_bonus_pay_month
)
select id,71786.00,'2026-04-06',0.075,'2026-04-06',614.000000,'2026-04-06',40.28571429,'2026-04-06',55.81349398,74.41733333,21,'1257L','cumulative','A',0,4
from public.trackers on conflict (tracker_id) do nothing;

insert into public.recurring_pay_items (tracker_id,name,amount,start_pay_month,end_pay_month,reduces_cash,reduces_paye,reduces_ni,taxable_benefit)
select id,'Breakdown cover',8.24,'2026-04-01','2026-10-01',true,true,true,true from public.trackers
where not exists (select 1 from public.recurring_pay_items r where r.tracker_id=trackers.id and r.name='Breakdown cover');

insert into public.recurring_pay_items (tracker_id,name,amount,start_pay_month,end_pay_month,reduces_cash,reduces_paye,reduces_ni,taxable_benefit)
select id,'Technology',67.92,'2026-04-01','2026-11-01',true,true,true,true from public.trackers
where not exists (select 1 from public.recurring_pay_items r where r.tracker_id=trackers.id and r.name='Technology');

insert into public.payslip_actuals (
  tracker_id,pay_month,pay_date,tax_period,tax_code,tax_basis,ni_category,basic_pay,emergency_pay,standby_days,standby_pay,
  ot15_hours,ot15_pay,ot2_hours,ot2_pay,holiday_bonus,pension,paye_tax,employee_ni,taxable_benefits,gross_taxable,net_pay,
  ytd_taxable,ytd_tax,ytd_ni,ytd_pension,ytd_taxable_benefits,ytd_superannuable
)
select id,'2026-08-01','2026-08-21',5,'1257L','cumulative','A',5982.17,51.17,28,1128.12,4,223.26,0,0,0,448.66,1726.87,304.70,76.16,6859.90,4828.33,30622.32,7010.73,1442.33,2243.30,380.80,29910.85 from public.trackers
on conflict (tracker_id,pay_month) do nothing;

insert into public.payslip_actuals (
  tracker_id,pay_month,pay_date,tax_period,tax_code,tax_basis,ni_category,basic_pay,emergency_pay,standby_days,standby_pay,
  ot15_hours,ot15_pay,ot2_hours,ot2_pay,holiday_bonus,pension,paye_tax,employee_ni,taxable_benefits,gross_taxable,net_pay,
  ytd_taxable,ytd_tax,ytd_ni,ytd_pension,ytd_taxable_benefits,ytd_superannuable
)
select id,'2026-09-01','2026-09-21',6,'1257L','cumulative','A',5982.17,51.17,0,0,0,0,0,0,0,448.66,1186.07,277.67,76.16,5508.52,4044.78,36207.00,8196.80,1720.00,2691.96,456.96,35893.02 from public.trackers
on conflict (tracker_id,pay_month) do nothing;

insert into public.payslip_actuals (
  tracker_id,pay_month,pay_date,tax_period,tax_code,tax_basis,ni_category,basic_pay,emergency_pay,standby_days,standby_pay,
  ot15_hours,ot15_pay,ot2_hours,ot2_pay,holiday_bonus,pension,paye_tax,employee_ni,taxable_benefits,gross_taxable,net_pay,
  ytd_taxable,ytd_tax,ytd_ni,ytd_pension,ytd_taxable_benefits,ytd_superannuable
)
select id,'2026-10-01','2026-10-21',7,'1257L','cumulative','A',5982.17,51.17,13,523.77,41.50,2316.26,45,3348.78,0,448.66,3661.66,401.45,76.16,11697.33,7634.22,47980.49,11858.46,2121.45,3140.62,533.12,41875.19 from public.trackers
on conflict (tracker_id,pay_month) do nothing;
