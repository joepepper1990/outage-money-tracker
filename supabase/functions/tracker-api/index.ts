const allowedOrigins = new Set([
  'https://joepepper1990.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
]);

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const monthRe = /^\d{4}-\d{2}$/;
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const eventTypes = new Set(['pension_rate','tax_code','tax_basis','ni_category','salary_override','emergency_annual','standby_daily']);

function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://joepepper1990.github.io',
    'Access-Control-Allow-Headers': 'content-type, x-tracker-key, apikey, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers:{...cors(req),'Content-Type':'application/json','Cache-Control':'no-store'} });
}
function secretKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); if (legacy) return legacy;
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS'); if (modern) { try { const p=JSON.parse(modern); if(p.default)return p.default; } catch {} }
  return '';
}
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = secretKey();
async function db(path:string,init:RequestInit={}){
  const headers=new Headers(init.headers||{}); headers.set('apikey',SERVICE_KEY); headers.set('Authorization',`Bearer ${SERVICE_KEY}`);
  if(init.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const res=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...init,headers}); const text=await res.text(); let data:any=null;
  if(text){try{data=JSON.parse(text)}catch{data=text}}
  if(!res.ok){const e:any=new Error(typeof data==='object'&&data?.message?data.message:`Database request failed (${res.status})`);e.status=res.status;e.code=data?.code;throw e}
  return data;
}
async function sha256Hex(value:string){const bytes=new TextEncoder().encode(value);const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));return Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('')}
function constantTimeEqual(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
async function authorize(trackerId:string,accessKey:string){
  if(!uuidRe.test(trackerId)||accessKey.length<32)return null;
  const rows=await db(`trackers?id=eq.${encodeURIComponent(trackerId)}&select=id,access_key_hash,updated_at,initialized_at`);const row=Array.isArray(rows)?rows[0]:null;if(!row)return null;
  return constantTimeEqual(await sha256Hex(accessKey),row.access_key_hash)?row:null;
}
const num=(v:any)=>v==null?null:Number(v);
const bool=(v:any)=>!!v;
const cleanTime=(v:string)=>String(v||'').slice(0,5);
const monthDate=(v:string)=>`${String(v||'').slice(0,7)}-01`;
function periodOut(r:any){return{id:r.id,date:r.work_date,hours:Number(r.hours),start:cleanTime(r.start_time),end:cleanTime(r.end_time),multiplier:Number(r.multiplier)}}
function expenseOut(r:any){return{id:r.id,description:r.description,amount:Number(r.amount),date:r.expense_date}}
function profileOut(r:any){if(!r)return null;return{
  annualSalary:Number(r.annual_salary),salaryEffectiveDate:r.salary_effective_date,pensionRate:Number(r.pension_rate),pensionEffectiveDate:r.pension_effective_date,
  emergencyAnnualAmount:Number(r.emergency_annual_amount),emergencyEffectiveDate:r.emergency_effective_date,standbyDailyRate:Number(r.standby_daily_rate),standbyEffectiveDate:r.standby_effective_date,
  overtimeRate15:Number(r.overtime_rate_15),overtimeRate2:Number(r.overtime_rate_2),payDay:Number(r.pay_day),taxCode:r.tax_code,taxBasis:r.tax_basis,niCategory:r.ni_category,
  outsideIncome:Number(r.outside_income),holidayBonusPayMonth:Number(r.holiday_bonus_pay_month),bankHolidayOverrides:r.bank_holiday_overrides||[]
}}
function standbyOut(r:any){return{id:r.id,date:r.work_date,units:Number(r.units),rateOverride:num(r.rate_override),publicHoliday:!!r.public_holiday,notes:r.notes||''}}
function eventOut(r:any){return{id:r.id,eventType:r.event_type,effectiveDate:r.effective_date,valueNumeric:num(r.value_numeric),valueText:r.value_text,metadata:r.metadata||{}}}
function dealOut(r:any){return{id:r.id,name:r.name,agreedDate:r.agreed_date,arrearsPayMonth:r.arrears_pay_month?String(r.arrears_pay_month).slice(0,7):'',components:r.components||[],createdAt:r.created_at}}
function recurringOut(r:any){return{id:r.id,name:r.name,amount:Number(r.amount),startPayMonth:String(r.start_pay_month).slice(0,7),endPayMonth:r.end_pay_month?String(r.end_pay_month).slice(0,7):'',reducesCash:!!r.reduces_cash,reducesPaye:!!r.reduces_paye,reducesNi:!!r.reduces_ni,taxableBenefit:!!r.taxable_benefit}}
function actualOut(r:any){return{
  id:r.id,payMonth:String(r.pay_month).slice(0,7),payDate:r.pay_date,taxPeriod:num(r.tax_period),taxCode:r.tax_code||'',taxBasis:r.tax_basis||'cumulative',niCategory:r.ni_category||'A',
  basicPay:num(r.basic_pay),emergencyPay:num(r.emergency_pay),standbyDays:num(r.standby_days),standbyPay:num(r.standby_pay),ot15Hours:num(r.ot15_hours),ot15Pay:num(r.ot15_pay),ot2Hours:num(r.ot2_hours),ot2Pay:num(r.ot2_pay),
  holidayBonus:num(r.holiday_bonus),arrearsPay:num(r.arrears_pay),otherPay:num(r.other_pay),pension:num(r.pension),payeTax:num(r.paye_tax),employeeNi:num(r.employee_ni),taxableBenefits:num(r.taxable_benefits),grossTaxable:num(r.gross_taxable),netPay:num(r.net_pay),
  ytdTaxable:Number(r.ytd_taxable),ytdTax:Number(r.ytd_tax),ytdNi:Number(r.ytd_ni),ytdPension:Number(r.ytd_pension),ytdTaxableBenefits:num(r.ytd_taxable_benefits),ytdSuperannuable:num(r.ytd_superannuable),forecastSnapshot:r.forecast_snapshot||null,notes:r.notes||''
}}
async function getState(trackerId:string,trackerRow?:any){
  const [periods,expenses,profiles,standby,payrollEvents,payDeals,recurring,actuals]=await Promise.all([
    db(`overtime_periods?tracker_id=eq.${trackerId}&select=id,work_date,hours,start_time,end_time,multiplier,updated_at&order=work_date.asc,created_at.asc`),
    db(`expenses?tracker_id=eq.${trackerId}&select=id,description,amount,expense_date,updated_at&order=expense_date.asc,created_at.asc`),
    db(`payroll_profiles?tracker_id=eq.${trackerId}&select=*&limit=1`),
    db(`standby_claims?tracker_id=eq.${trackerId}&select=*&order=work_date.asc`),
    db(`payroll_events?tracker_id=eq.${trackerId}&select=*&order=effective_date.asc,created_at.asc`),
    db(`pay_deals?tracker_id=eq.${trackerId}&select=*&order=agreed_date.asc,created_at.asc`),
    db(`recurring_pay_items?tracker_id=eq.${trackerId}&select=*&order=start_pay_month.asc,created_at.asc`),
    db(`payslip_actuals?tracker_id=eq.${trackerId}&select=*&order=pay_month.asc`)
  ]);
  const all=[...periods,...expenses,...profiles,...standby,...payrollEvents,...payDeals,...recurring,...actuals];
  const stamps=[trackerRow?.updated_at,...all.map((r:any)=>r.updated_at)].filter(Boolean);const updatedAt=stamps.sort().at(-1)||new Date(0).toISOString();
  return {periods:periods.map(periodOut),expenses:expenses.map(expenseOut),profile:profileOut(profiles[0]),standbyClaims:standby.map(standbyOut),payrollEvents:payrollEvents.map(eventOut),payDeals:payDeals.map(dealOut),recurringItems:recurring.map(recurringOut),actuals:actuals.map(actualOut),updatedAt,initialized:!!trackerRow?.initialized_at};
}
function validatePeriod(p:any){if(!p||!dateRe.test(p.date)||!(Number(p.hours)>0)||Number(p.hours)>24)throw Object.assign(new Error('Enter a valid date and overtime hours.'),{status:400});if(![1.5,2].includes(Number(p.multiplier)))throw Object.assign(new Error('Choose a valid overtime rate.'),{status:400})}
function validateExpense(e:any){if(!e||!dateRe.test(e.date)||!String(e.description||'').trim()||String(e.description).trim().length>160||!(Number(e.amount)>0))throw Object.assign(new Error('Enter a valid description, amount and date.'),{status:400})}
function validateStandby(c:any){if(!c||!dateRe.test(c.date)||!(Number(c.units)>0)||Number(c.units)>62)throw Object.assign(new Error('Enter a valid pager date and number of days.'),{status:400})}
function validateDeal(d:any){if(!d||!String(d.name||'').trim()||!dateRe.test(d.agreedDate)||!Array.isArray(d.components)||!d.components.length)throw Object.assign(new Error('Enter a pay deal name, agreed date and at least one change.'),{status:400});for(const c of d.components){if(!['percent','fixed','lump'].includes(c.type)||!dateRe.test(c.effectiveDate)||!(Number(c.value)>0))throw Object.assign(new Error('One of the pay deal changes is incomplete.'),{status:400});if(c.type==='lump'&&!monthRe.test(c.paymentMonth||''))throw Object.assign(new Error('Choose the payroll month for the lump sum.'),{status:400})}}
function validateActual(a:any){if(!a||!monthRe.test(a.payMonth)||!dateRe.test(a.payDate)||!(Number(a.ytdTaxable)>=0)||!(Number(a.ytdTax)>=0)||!(Number(a.ytdNi)>=0)||!(Number(a.ytdPension)>=0))throw Object.assign(new Error('Enter the payslip month, pay date and YTD figures.'),{status:400})}
const uuidOrNew=(id:any)=>uuidRe.test(String(id||''))?String(id):crypto.randomUUID();

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});if(req.method!=='POST')return json(req,{error:'method-not-allowed'},405);
  try{
    if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{error:'server-not-configured'},500);
    const body=await req.json(),trackerId=String(body?.trackerId||''),accessKey=req.headers.get('x-tracker-key')||'',tracker=await authorize(trackerId,accessKey);
    if(!tracker)return json(req,{error:'invalid-link',message:'This share link is not valid.'},403);
    switch(body.action){
      case 'getState':return json(req,await getState(trackerId,tracker));
      case 'seedIfEmpty':{
        const state=body.state||{};const seeded=await db('rpc/tracker_seed_internal',{method:'POST',body:JSON.stringify({p_tracker_id:trackerId,p_periods:state.periods||[],p_expenses:state.expenses||[]})});
        const fresh=(await db(`trackers?id=eq.${trackerId}&select=id,updated_at,initialized_at`))[0];return json(req,{seeded:!!seeded,state:await getState(trackerId,fresh)});
      }
      case 'upsertPeriod':{
        validatePeriod(body.period);const id=uuidOrNew(body.period.id);const existing=await db(`overtime_periods?id=eq.${id}&select=tracker_id`);if(existing[0]&&existing[0].tracker_id!==trackerId)return json(req,{error:'not-found'},404);
        const rows=await db('overtime_periods?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id,tracker_id:trackerId,work_date:body.period.date,hours:Number(body.period.hours),start_time:null,end_time:null,multiplier:Number(body.period.multiplier)})});return json(req,{period:periodOut(rows[0])});
      }
      case 'deletePeriod':if(!uuidRe.test(body.id||''))return json(req,{error:'not-found'},404);await db(`overtime_periods?id=eq.${body.id}&tracker_id=eq.${trackerId}`,{method:'DELETE'});return json(req,{ok:true});
      case 'upsertExpense':{
        validateExpense(body.expense);const id=uuidOrNew(body.expense.id);const rows=await db('expenses?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id,tracker_id:trackerId,description:String(body.expense.description).trim(),amount:Number(body.expense.amount),expense_date:body.expense.date})});return json(req,{expense:expenseOut(rows[0])});
      }
      case 'deleteExpense':if(!uuidRe.test(body.id||''))return json(req,{error:'not-found'},404);await db(`expenses?id=eq.${body.id}&tracker_id=eq.${trackerId}`,{method:'DELETE'});return json(req,{ok:true});
      case 'updateProfile':{
        const p=body.profile||{};const row={tracker_id:trackerId,annual_salary:Number(p.annualSalary),salary_effective_date:p.salaryEffectiveDate,pension_rate:Number(p.pensionRate),pension_effective_date:p.pensionEffectiveDate,emergency_annual_amount:Number(p.emergencyAnnualAmount),emergency_effective_date:p.emergencyEffectiveDate,standby_daily_rate:Number(p.standbyDailyRate),standby_effective_date:p.standbyEffectiveDate,overtime_rate_15:Number(p.overtimeRate15),overtime_rate_2:Number(p.overtimeRate2),pay_day:Number(p.payDay)||21,tax_code:String(p.taxCode||'1257L').trim().toUpperCase(),tax_basis:p.taxBasis==='month1'?'month1':'cumulative',ni_category:String(p.niCategory||'A').trim().toUpperCase(),outside_income:Number(p.outsideIncome||0),holiday_bonus_pay_month:Number(p.holidayBonusPayMonth||4),bank_holiday_overrides:Array.isArray(p.bankHolidayOverrides)?p.bankHolidayOverrides:[]};
        if(!(row.annual_salary>0)||!(row.pension_rate>=0)||!dateRe.test(row.salary_effective_date)||!dateRe.test(row.pension_effective_date))throw Object.assign(new Error('Check the salary and pension settings.'),{status:400});
        const rows=await db('payroll_profiles?on_conflict=tracker_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)});return json(req,{profile:profileOut(rows[0])});
      }
      case 'upsertStandby':{
        validateStandby(body.claim);const id=uuidOrNew(body.claim.id);const rows=await db('standby_claims?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id,tracker_id:trackerId,work_date:body.claim.date,units:Number(body.claim.units),rate_override:body.claim.rateOverride==null?null:Number(body.claim.rateOverride),public_holiday:bool(body.claim.publicHoliday),notes:String(body.claim.notes||'').slice(0,200)||null})});return json(req,{claim:standbyOut(rows[0])});
      }
      case 'deleteStandby':if(!uuidRe.test(body.id||''))return json(req,{error:'not-found'},404);await db(`standby_claims?id=eq.${body.id}&tracker_id=eq.${trackerId}`,{method:'DELETE'});return json(req,{ok:true});
      case 'upsertPayrollEvent':{
        const e=body.event||{};if(!eventTypes.has(e.eventType)||!dateRe.test(e.effectiveDate))throw Object.assign(new Error('Check the effective date and change type.'),{status:400});const id=uuidOrNew(e.id);
        const rows=await db('payroll_events?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id,tracker_id:trackerId,event_type:e.eventType,effective_date:e.effectiveDate,value_numeric:e.valueNumeric==null?null:Number(e.valueNumeric),value_text:e.valueText==null?null:String(e.valueText),metadata:e.metadata||{}})});return json(req,{event:eventOut(rows[0])});
      }
      case 'deletePayrollEvent':if(!uuidRe.test(body.id||''))return json(req,{error:'not-found'},404);await db(`payroll_events?id=eq.${body.id}&tracker_id=eq.${trackerId}`,{method:'DELETE'});return json(req,{ok:true});
      case 'upsertPayDeal':{
        validateDeal(body.deal);const d=body.deal,id=uuidOrNew(d.id);const rows=await db('pay_deals?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id,tracker_id:trackerId,name:String(d.name).trim(),agreed_date:d.agreedDate,arrears_pay_month:monthRe.test(d.arrearsPayMonth||'')?monthDate(d.arrearsPayMonth):null,components:d.components})});return json(req,{deal:dealOut(rows[0])});
      }
      case 'deletePayDeal':if(!uuidRe.test(body.id||''))return json(req,{error:'not-found'},404);await db(`pay_deals?id=eq.${body.id}&tracker_id=eq.${trackerId}`,{method:'DELETE'});return json(req,{ok:true});
      case 'upsertRecurringItem':{
        const i=body.item||{};if(!String(i.name||'').trim()||!(Number(i.amount)>=0)||!monthRe.test(i.startPayMonth||'')||(i.endPayMonth&&!monthRe.test(i.endPayMonth)))throw Object.assign(new Error('Check the scheme name, amount and dates.'),{status:400});const id=uuidOrNew(i.id);
        const rows=await db('recurring_pay_items?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id,tracker_id:trackerId,name:String(i.name).trim(),amount:Number(i.amount),start_pay_month:monthDate(i.startPayMonth),end_pay_month:i.endPayMonth?monthDate(i.endPayMonth):null,reduces_cash:i.reducesCash!==false,reduces_paye:bool(i.reducesPaye),reduces_ni:bool(i.reducesNi),taxable_benefit:bool(i.taxableBenefit)})});return json(req,{item:recurringOut(rows[0])});
      }
      case 'deleteRecurringItem':if(!uuidRe.test(body.id||''))return json(req,{error:'not-found'},404);await db(`recurring_pay_items?id=eq.${body.id}&tracker_id=eq.${trackerId}`,{method:'DELETE'});return json(req,{ok:true});
      case 'upsertActualPayslip':{
        validateActual(body.actual);const a=body.actual,id=uuidOrNew(a.id);const row={id,tracker_id:trackerId,pay_month:monthDate(a.payMonth),pay_date:a.payDate,tax_period:a.taxPeriod==null?null:Number(a.taxPeriod),tax_code:a.taxCode||null,tax_basis:a.taxBasis||'cumulative',ni_category:a.niCategory||'A',basic_pay:num(a.basicPay),emergency_pay:num(a.emergencyPay),standby_days:num(a.standbyDays),standby_pay:num(a.standbyPay),ot15_hours:num(a.ot15Hours),ot15_pay:num(a.ot15Pay),ot2_hours:num(a.ot2Hours),ot2_pay:num(a.ot2Pay),holiday_bonus:num(a.holidayBonus),arrears_pay:num(a.arrearsPay),other_pay:num(a.otherPay),pension:num(a.pension),paye_tax:num(a.payeTax),employee_ni:num(a.employeeNi),taxable_benefits:num(a.taxableBenefits),gross_taxable:num(a.grossTaxable),net_pay:num(a.netPay),ytd_taxable:Number(a.ytdTaxable),ytd_tax:Number(a.ytdTax),ytd_ni:Number(a.ytdNi),ytd_pension:Number(a.ytdPension),ytd_taxable_benefits:num(a.ytdTaxableBenefits),ytd_superannuable:num(a.ytdSuperannuable),forecast_snapshot:a.forecastSnapshot||null,notes:String(a.notes||'').slice(0,500)||null};
        const rows=await db('payslip_actuals?on_conflict=tracker_id,pay_month',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)});return json(req,{actual:actualOut(rows[0])});
      }
      case 'deleteActualPayslip':if(!uuidRe.test(body.id||''))return json(req,{error:'not-found'},404);await db(`payslip_actuals?id=eq.${body.id}&tracker_id=eq.${trackerId}`,{method:'DELETE'});return json(req,{ok:true});
      case 'rotateAccessKey':{const newKey=String(body.newKey||'');if(newKey.length<32)return json(req,{error:'weak-key'},400);await db(`trackers?id=eq.${trackerId}`,{method:'PATCH',body:JSON.stringify({access_key_hash:await sha256Hex(newKey)})});return json(req,{ok:true})}
      default:return json(req,{error:'unknown-action'},400);
    }
  }catch(error){const e:any=error;const status=e.code==='23P01'?409:(e.status||500);const message=e.code==='23P01'?'That overtime overlaps another period.':(e.message||'Unexpected error');return json(req,{error:'request-failed',message},status)}
});