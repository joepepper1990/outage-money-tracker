alter table public.overtime_periods add column if not exists hours numeric(8,2);

update public.overtime_periods
set hours = round((extract(epoch from (end_time - start_time))/3600)::numeric,2)
where hours is null and start_time is not null and end_time is not null;

alter table public.overtime_periods drop constraint if exists overtime_no_overlap;
alter table public.overtime_periods drop constraint if exists overtime_finish_after_start;
alter table public.overtime_periods alter column start_time drop not null;
alter table public.overtime_periods alter column end_time drop not null;
alter table public.overtime_periods alter column hours set not null;
alter table public.overtime_periods drop constraint if exists overtime_hours_valid;
alter table public.overtime_periods add constraint overtime_hours_valid check (hours > 0 and hours <= 24);

update public.overtime_periods set start_time=null,end_time=null where hours is not null;

insert into public.payslip_actuals (
  tracker_id,pay_month,pay_date,tax_period,tax_code,tax_basis,ni_category,basic_pay,emergency_pay,standby_days,standby_pay,ot15_hours,ot15_pay,ot2_hours,ot2_pay,holiday_bonus,arrears_pay,other_pay,pension,paye_tax,employee_ni,taxable_benefits,gross_taxable,net_pay,ytd_taxable,ytd_tax,ytd_ni,ytd_pension,ytd_taxable_benefits,ytd_superannuable
)
select t.id,v.*
from public.trackers t
cross join (values
('2025-01-01','2025-01-21',10,'1257L','cumulative','A',5451.84,47.42,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,408.88,988.46,269.31,0.00,5090.38,3832.61,82232.10,22416.26,3319.64,4009.06,0.00,53454.64),
('2025-02-01','2025-02-21',11,'1257L','cumulative','A',5451.84,47.42,42.00,1566.18,0.00,0.00,0.00,0.00,0.00,0.00,0,408.88,1614.87,300.63,0.00,6656.56,4741.06,88888.66,24031.13,3620.27,4417.94,0.00,58906.48),
('2025-03-01','2025-03-21',12,'1257L','cumulative','A',5451.84,47.42,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,408.88,988.47,269.31,0.00,5090.38,3832.60,93979.04,25019.60,3889.58,4826.82,0.00,64358.32),
('2025-04-01','2025-04-17',1,'1114T','cumulative','A',5640.75,49.08,7.00,553.00,0.00,0.00,0.00,0.00,1950.00,0.00,0,423.05,2107.66,322.89,0.00,7769.78,5339.23,7769.78,2107.66,322.89,423.05,0.00,5640.75),
('2025-05-01','2025-05-21',2,'1114T','cumulative','A',5640.75,49.08,14.00,531.02,16.00,842.08,24.00,1684.08,0.00,0.00,0,423.05,2329.67,333.98,0.00,8323.96,5660.31,16093.74,4437.33,656.87,846.10,0.00,11281.50),
('2025-06-01','2025-06-20',3,'1114T','cumulative','A',5640.75,49.08,7.00,269.99,14.00,736.82,32.00,2245.44,0.00,0.00,0,423.05,2407.67,337.88,0.00,8519.03,5773.48,24612.77,6845.00,994.75,1269.15,0.00,16922.25),
('2025-07-01','2025-07-21',4,'1114T','cumulative','A',5640.75,49.08,14.00,539.98,0.00,0.00,0.00,0.00,0.00,0.00,0,423.05,1322.86,283.63,0.00,5806.76,4200.27,30419.53,8167.86,1278.38,1692.20,0.00,22563.00),
('2025-08-01','2025-08-21',5,'1114T','cumulative','A',5640.75,49.08,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,423.05,1106.47,272.83,0.00,5266.78,3887.48,35686.31,9274.33,1551.21,2115.25,0.00,28203.75),
('2025-09-01','2025-09-19',6,'1114T','cumulative','A',5640.75,49.08,7.00,269.99,4.75,249.98,5.75,403.48,0.00,0.00,0,423.05,1476.47,291.30,0.00,6190.23,4422.46,41876.54,10750.80,1842.51,2538.30,0.00,33844.50),
('2025-10-01','2025-10-21',7,'1114T','cumulative','A',5746.50,49.08,0.00,0.00,0.00,0.00,0.00,0.00,0.00,105.75,0,438.91,1184.86,276.75,0.00,5462.42,4000.81,47338.96,11935.66,2119.26,2977.21,0.00,39696.75),
('2025-11-01','2025-11-21',8,'1114T','cumulative','A',5746.50,49.08,17.00,655.69,0.00,0.00,0.00,0.00,0.00,0.00,0,430.98,1408.07,287.90,0.00,6020.29,4324.32,53359.25,13343.73,2407.16,3408.19,0.00,45443.25),
('2025-12-01','2025-12-19',9,'1114T','cumulative','A',5746.50,49.08,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,430.98,1146.07,273.43,67.92,5296.68,3877.18,58723.85,14489.80,2680.59,3839.17,67.92,51189.75),
('2026-01-01','2026-01-21',10,'1114T','cumulative','A',5746.50,49.08,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,430.98,1145.66,273.43,67.92,5296.68,3877.59,64088.45,15635.46,2954.02,4270.15,135.84,56936.25),
('2026-02-01','2026-02-20',11,'1114T','cumulative','A',5746.50,49.08,35.00,1349.95,0.00,0.00,0.00,0.00,0.00,0.00,0,430.98,1686.07,300.43,67.92,6646.63,4660.13,70803.00,17321.53,3254.45,4701.13,203.76,62682.75),
('2026-03-01','2026-03-20',12,'1114T','cumulative','A',5746.50,49.08,7.00,269.99,0.00,0.00,0.00,0.00,0.00,0.00,0,430.98,1253.67,278.67,76.16,5558.43,4026.09,76437.59,18575.20,3533.12,5132.11,279.92,68429.25),
('2026-04-01','2026-04-21',1,'1257L','cumulative','A',5982.17,51.17,0.00,0.00,0.00,0.00,0.00,0.00,513.49,0.00,0,448.66,1391.26,287.94,76.16,6022.01,4342.81,6098.17,1391.26,287.94,448.66,76.16,5982.17),
('2026-05-01','2026-05-21',2,'1257L','cumulative','A',5982.17,51.17,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,448.66,1186.47,277.67,76.16,5508.52,4044.38,11682.85,2577.73,565.61,897.32,152.32,11964.34),
('2026-06-01','2026-06-19',3,'1257L','cumulative','A',5982.17,51.17,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,448.66,1186.07,277.67,76.16,5508.52,4044.78,17267.53,3763.80,843.28,1345.98,228.48,17946.51),
('2026-07-01','2026-07-21',4,'1257L','cumulative','A',5982.17,51.17,21.00,834.05,0.00,0.00,0.00,0.00,0.00,0.00,0,448.66,1520.06,294.35,76.16,6342.57,4528.16,23686.26,5283.86,1137.63,1794.64,304.64,23928.68),
('2026-08-01','2026-08-21',5,'1257L','cumulative','A',5982.17,51.17,28.00,1128.12,4.00,223.26,0.00,0.00,0.00,0.00,0,448.66,1726.87,304.70,76.16,6859.90,4828.33,30622.32,7010.73,1442.33,2243.30,380.80,29910.85),
('2026-09-01','2026-09-21',6,'1257L','cumulative','A',5982.17,51.17,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,448.66,1186.07,277.67,76.16,5508.52,4044.78,36207.00,8196.80,1720.00,2691.96,456.96,35893.02),
('2026-10-01','2026-10-21',7,'1257L','cumulative','A',5982.17,51.17,13.00,523.77,41.50,2316.26,45.00,3348.78,0.00,0.00,0,448.66,3661.66,401.45,76.16,11697.33,7634.22,47980.49,11858.46,2121.45,3140.62,533.12,41875.19)
) as v(pay_month,pay_date,tax_period,tax_code,tax_basis,ni_category,basic_pay,emergency_pay,standby_days,standby_pay,ot15_hours,ot15_pay,ot2_hours,ot2_pay,holiday_bonus,arrears_pay,other_pay,pension,paye_tax,employee_ni,taxable_benefits,gross_taxable,net_pay,ytd_taxable,ytd_tax,ytd_ni,ytd_pension,ytd_taxable_benefits,ytd_superannuable)
on conflict (tracker_id,pay_month) do update set
  pay_date=excluded.pay_date,
  tax_period=excluded.tax_period,
  tax_code=excluded.tax_code,
  tax_basis=excluded.tax_basis,
  ni_category=excluded.ni_category,
  basic_pay=excluded.basic_pay,
  emergency_pay=excluded.emergency_pay,
  standby_days=excluded.standby_days,
  standby_pay=excluded.standby_pay,
  ot15_hours=excluded.ot15_hours,
  ot15_pay=excluded.ot15_pay,
  ot2_hours=excluded.ot2_hours,
  ot2_pay=excluded.ot2_pay,
  holiday_bonus=excluded.holiday_bonus,
  arrears_pay=excluded.arrears_pay,
  other_pay=excluded.other_pay,
  pension=excluded.pension,
  paye_tax=excluded.paye_tax,
  employee_ni=excluded.employee_ni,
  taxable_benefits=excluded.taxable_benefits,
  gross_taxable=excluded.gross_taxable,
  net_pay=excluded.net_pay,
  ytd_taxable=excluded.ytd_taxable,
  ytd_tax=excluded.ytd_tax,
  ytd_ni=excluded.ytd_ni,
  ytd_pension=excluded.ytd_pension,
  ytd_taxable_benefits=excluded.ytd_taxable_benefits,
  ytd_superannuable=excluded.ytd_superannuable,
  updated_at=now();
