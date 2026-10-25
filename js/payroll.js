import { periodDurationHours } from './core.js';

export const BASE_PROFILE = Object.freeze({
  annualSalary:71786,
  salaryEffectiveDate:'2026-04-06',
  pensionRate:0.075,
  pensionEffectiveDate:'2026-04-06',
  emergencyAnnualAmount:614,
  emergencyEffectiveDate:'2026-04-06',
  standbyDailyRate:40.28571428571429,
  standbyEffectiveDate:'2026-04-06',
  overtimeRate15:55.81349397590362,
  overtimeRate2:74.41733333333333,
  payDay:21,
  taxCode:'1257L',
  taxBasis:'cumulative',
  niCategory:'A',
  outsideIncome:0,
  holidayBonusPayMonth:4
});

export const TAX_RULES=Object.freeze({
  '2025-26':{personalAllowance:12570,basicBand:37700,additionalThreshold:125140,niPT:1048,niUEL:4189,niMain:0.08,niUpper:0.02,assumed:false},
  '2026-27':{personalAllowance:12570,basicBand:37700,additionalThreshold:125140,niPT:1048,niUEL:4189,niMain:0.08,niUpper:0.02,assumed:false}
});

const DAY_MS=86400000;
export const roundMoney=value=>Math.round((Number(value)||0)*100+1e-8)/100;
export const floorMoney=value=>Math.floor((Number(value)||0)*100+1e-8)/100;
const pad=n=>String(n).padStart(2,'0');

export function monthKey(value){const s=String(value||'');return /^\d{4}-\d{2}$/.test(s)?s:s.slice(0,7)}
export function monthDate(month){return `${monthKey(month)}-01`}
export function addMonths(month,delta){const [y,m]=monthKey(month).split('-').map(Number);const d=new Date(Date.UTC(y,m-1+Number(delta),1));return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}`}
export const previousMonth=month=>addMonths(month,-1);
export function compareMonth(a,b){return monthKey(a).localeCompare(monthKey(b))}
export function monthIndexBetween(a,b){const [ay,am]=monthKey(a).split('-').map(Number),[by,bm]=monthKey(b).split('-').map(Number);return (by-ay)*12+(bm-am)}
export function monthRange(start,endExclusive){const out=[];let m=monthKey(start);while(compareMonth(m,endExclusive)<0){out.push(m);m=addMonths(m,1)}return out}
function isoDate(y,m,d){return `${y}-${pad(m)}-${pad(d)}`}
function dateParts(s){const [y,m,d]=String(s).slice(0,10).split('-').map(Number);return{y,m,d}}
function utcDate(s){const {y,m,d}=dateParts(s);return new Date(Date.UTC(y,m-1,d,12))}

function easterSunday(year){
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(Date.UTC(year,month-1,day,12));
}
function mondayInMonth(year,month,which='first'){const last=which==='last';const d=new Date(Date.UTC(year,month-(last?0:1),last?0:1,12));const dow=d.getUTCDay();const adjust=last?-((dow+6)%7):((8-dow)%7);d.setUTCDate(d.getUTCDate()+adjust);return d}
function substitutePair(year,month,days){const used=new Set(),out=[];for(const day of days){let d=new Date(Date.UTC(year,month-1,day,12));while(d.getUTCDay()===0||d.getUTCDay()===6||used.has(d.toISOString().slice(0,10)))d=new Date(d.getTime()+DAY_MS);const k=d.toISOString().slice(0,10);used.add(k);out.push(k)}return out}
export function englandWalesBankHolidays(year){const out=new Set();let ny=new Date(Date.UTC(year,0,1,12));while(ny.getUTCDay()===0||ny.getUTCDay()===6)ny=new Date(ny.getTime()+DAY_MS);out.add(ny.toISOString().slice(0,10));const easter=easterSunday(year);out.add(new Date(easter.getTime()-2*DAY_MS).toISOString().slice(0,10));out.add(new Date(easter.getTime()+DAY_MS).toISOString().slice(0,10));out.add(mondayInMonth(year,5,'first').toISOString().slice(0,10));out.add(mondayInMonth(year,5,'last').toISOString().slice(0,10));out.add(mondayInMonth(year,8,'last').toISOString().slice(0,10));for(const d of substitutePair(year,12,[25,26]))out.add(d);return out}
export function isWorkingDay(dateStr,extraBankHolidays=[]){const d=utcDate(dateStr),dow=d.getUTCDay();if(dow===0||dow===6)return false;const holidays=englandWalesBankHolidays(d.getUTCFullYear());for(const x of extraBankHolidays||[])holidays.add(String(x).slice(0,10));return !holidays.has(String(dateStr).slice(0,10))}
export function payDateForMonth(month,profile=BASE_PROFILE){const [y,m]=monthKey(month).split('-').map(Number);const day=Number(profile.payDay)||21;let d=isoDate(y,m,day);const extras=profile.bankHolidayOverrides||[];while(!isWorkingDay(d,extras)){const x=utcDate(d);x.setUTCDate(x.getUTCDate()-1);d=x.toISOString().slice(0,10)}return d}
export function taxYearForDate(dateStr){const {y,m,d}=dateParts(dateStr);const start=(m>4||(m===4&&d>=6))?y:y-1;return `${start}-${String(start+1).slice(-2)}`}
export function taxPeriodForDate(dateStr){const {m,d}=dateParts(dateStr);let effectiveMonth=m;if(d<6)effectiveMonth-=1;if(effectiveMonth<=0)effectiveMonth+=12;return ((effectiveMonth-4+12)%12)+1}
export function rulesForDate(dateStr){const key=taxYearForDate(dateStr);if(TAX_RULES[key])return{...TAX_RULES[key],key};return{...TAX_RULES['2026-27'],key,assumed:true}}

function events(state,type){return(state?.payrollEvents||[]).filter(e=>e.eventType===type).sort((a,b)=>String(a.effectiveDate).localeCompare(String(b.effectiveDate)))}
function latestEventValue(state,type,date,fallback,field='valueNumeric'){let v=fallback;for(const e of events(state,type))if(String(e.effectiveDate)<=date&&e[field]!=null)v=e[field];return v}
export function pensionRateAt(date,state){return Number(latestEventValue(state,'pension_rate',date,state?.profile?.pensionRate??BASE_PROFILE.pensionRate))}
export function taxCodeAt(date,state){return String(latestEventValue(state,'tax_code',date,state?.profile?.taxCode??BASE_PROFILE.taxCode,'valueText'))}
export function taxBasisAt(date,state){return String(latestEventValue(state,'tax_basis',date,state?.profile?.taxBasis??BASE_PROFILE.taxBasis,'valueText'))}
export function niCategoryAt(date,state){return String(latestEventValue(state,'ni_category',date,state?.profile?.niCategory??BASE_PROFILE.niCategory,'valueText'))}

function dealComponents(deal){return Array.isArray(deal?.components)?deal.components:[]}
export function salaryAt(date,state,excludeDealId=null){
  const profile={...BASE_PROFILE,...(state?.profile||{})};
  let salary=Number(profile.annualSalary)||BASE_PROFILE.annualSalary;
  const timeline=[];
  for(const e of events(state,'salary_override'))if(String(e.effectiveDate)<=date)timeline.push({kind:'override',date:e.effectiveDate,value:Number(e.valueNumeric),order:`0-${e.id||''}`});
  for(const deal of state?.payDeals||[]){
    if(deal.id===excludeDealId)continue;
    for(const [idx,c] of dealComponents(deal).entries()){
      if((c.type==='percent'||c.type==='fixed')&&String(c.effectiveDate)<=date)timeline.push({kind:c.type,date:c.effectiveDate,value:Number(c.value)||0,basis:c.basis||'current',dealId:deal.id||deal.name||String(idx),order:`1-${deal.createdAt||deal.agreedDate||''}-${idx}`});
    }
  }
  timeline.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.order).localeCompare(String(b.order)));
  const dealBase=new Map();
  for(const item of timeline){
    if(item.kind==='override'){salary=item.value;continue}
    if(!dealBase.has(item.dealId))dealBase.set(item.dealId,salary);
    if(item.kind==='fixed')salary+=item.value;
    else salary+=(item.basis==='deal-start'?dealBase.get(item.dealId):salary)*(item.value/100);
  }
  return salary;
}
export function salaryRegimeAt(date,state,excludeDealId=null){const profile={...BASE_PROFILE,...(state?.profile||{})};let last=profile.salaryEffectiveDate||BASE_PROFILE.salaryEffectiveDate;for(const e of events(state,'salary_override'))if(String(e.effectiveDate)<=date&&String(e.effectiveDate)>String(last))last=e.effectiveDate;for(const deal of state?.payDeals||[]){if(deal.id===excludeDealId)continue;for(const c of dealComponents(deal))if((c.type==='percent'||c.type==='fixed')&&String(c.effectiveDate)<=date&&String(c.effectiveDate)>String(last))last=c.effectiveDate}return{salary:salaryAt(date,state,excludeDealId),startDate:last}}
export function salaryScaleAt(date,state,excludeDealId=null){const p={...BASE_PROFILE,...(state?.profile||{})};return salaryAt(date,state,excludeDealId)/(Number(p.annualSalary)||BASE_PROFILE.annualSalary)}
function monthLastDate(month){const [y,m]=monthKey(month).split('-').map(Number);return new Date(Date.UTC(y,m,0,12)).toISOString().slice(0,10)}
export function monthlyBasicForMonth(month,state,excludeDealId=null){return roundMoney(salaryAt(monthLastDate(month),state,excludeDealId)/12)}
function balancedMonthly(annual,index){const n=((index%12)+12)%12;return roundMoney(roundMoney(Number(annual)*(n+1)/12)-roundMoney(Number(annual)*n/12))}
export function emergencyForMonth(month,state,excludeDealId=null){
  const p={...BASE_PROFILE,...(state?.profile||{})},date=monthLastDate(month);
  const changes=events(state,'emergency_annual').filter(e=>String(e.effectiveDate)<=date&&e.valueNumeric!=null);
  const change=changes.at(-1);
  const baseAnnual=change?Number(change.valueNumeric):Number(p.emergencyAnnualAmount);
  const baseDate=change?.effectiveDate||p.emergencyEffectiveDate||p.salaryEffectiveDate;
  const baseSalary=salaryAt(baseDate,state,excludeDealId),currentSalary=salaryAt(date,state,excludeDealId);
  const annual=baseAnnual*(baseSalary?currentSalary/baseSalary:1);
  const startMonth=monthKey(baseDate),index=Math.max(0,monthIndexBetween(startMonth,month));
  return balancedMonthly(annual,index);
}
export function overtimeRateAt(date,multiplier,state,excludeDealId=null){const p={...BASE_PROFILE,...(state?.profile||{})};const base=Number(multiplier)===2?Number(p.overtimeRate2):Number(p.overtimeRate15);return base*salaryScaleAt(date,state,excludeDealId)}
export function overtimePeriodGross(period,state,excludeDealId=null){return roundMoney(periodDurationHours(period)*overtimeRateAt(period.date,period.multiplier,state,excludeDealId))}
export function standbyRateAt(date,state,excludeDealId=null){
  const p={...BASE_PROFILE,...(state?.profile||{})};
  const changes=events(state,'standby_daily').filter(e=>String(e.effectiveDate)<=date&&e.valueNumeric!=null);
  const change=changes.at(-1);
  const baseRate=change?Number(change.valueNumeric):Number(p.standbyDailyRate);
  const baseDate=change?.effectiveDate||p.standbyEffectiveDate||p.salaryEffectiveDate;
  const baseSalary=salaryAt(baseDate,state,excludeDealId),currentSalary=salaryAt(date,state,excludeDealId);
  return baseRate*(baseSalary?currentSalary/baseSalary:1);
}
export function standbyClaimDates(claim){
  const count=Math.max(0,Math.floor(Number(claim?.units)||0)),out=[];
  let d=utcDate(claim.date);
  for(let i=0;i<count;i++){out.push(d.toISOString().slice(0,10));d=new Date(d.getTime()+DAY_MS)}
  return out;
}
export function standbyClaimGross(claim,state,excludeDealId=null){
  let total=0;
  for(const date of standbyClaimDates(claim)){
    const rate=claim.rateOverride!=null?Number(claim.rateOverride):standbyRateAt(date,state,excludeDealId);
    total+=roundMoney(rate);
  }
  return roundMoney(total);
}
export function paymentMonthForWorkDate(date){return addMonths(monthKey(date),1)}

function recurringForMonth(month,state){return(state?.recurringItems||[]).filter(i=>compareMonth(month,i.startPayMonth||'0000-01')>=0&&(!i.endPayMonth||compareMonth(month,i.endPayMonth)<=0))}
function recurringEffects(month,state){let cash=0,payeReduction=0,niReduction=0,taxableBenefits=0;for(const i of recurringForMonth(month,state)){const amount=roundMoney(i.amount);if(i.reducesCash!==false)cash+=amount;if(i.reducesPaye)payeReduction+=amount;if(i.reducesNi)niReduction+=amount;if(i.taxableBenefit)taxableBenefits+=amount}return{cash:roundMoney(cash),payeReduction:roundMoney(payeReduction),niReduction:roundMoney(niReduction),taxableBenefits:roundMoney(taxableBenefits)}}

export function overtimeForPayMonth(month,state,excludeDealId=null){
  const workMonth=previousMonth(month);let h15=0,h2=0,pay15=0,pay2=0;
  for(const p of state?.periods||[]){if(monthKey(p.date)!==workMonth)continue;const h=periodDurationHours(p),v=overtimePeriodGross(p,state,excludeDealId);if(Number(p.multiplier)===2){h2+=h;pay2+=v}else{h15+=h;pay15+=v}}
  return{h15,h2,pay15:roundMoney(pay15),pay2:roundMoney(pay2),total:roundMoney(pay15+pay2)};
}
export function standbyForPayMonth(month,state,excludeDealId=null){
  const workMonth=previousMonth(month);let units=0,total=0;
  for(const c of state?.standbyClaims||[])for(const date of standbyClaimDates(c)){
    if(monthKey(date)!==workMonth)continue;
    units+=1;
    const rate=c.rateOverride!=null?Number(c.rateOverride):standbyRateAt(date,state,excludeDealId);
    total+=roundMoney(rate);
  }
  return{units,total:roundMoney(total)};
}

function earliestDealEffective(deal){return dealComponents(deal).map(c=>c.effectiveDate).filter(Boolean).sort()[0]||null}
function pensionRateForMonth(month,state){return pensionRateAt(monthLastDate(month),state)}
export function dealArrearsForPayMonth(month,state){
  const out={salary:0,emergency:0,ot:0,standby:0,pension:0,totalGross:0};
  for(const deal of state?.payDeals||[]){
    if(monthKey(deal.arrearsPayMonth||'')!==month)continue;
    const first=earliestDealEffective(deal);if(!first)continue;
    const startMonth=monthKey(first);
    for(const m of monthRange(startMonth,month)){
      const salaryDiff=roundMoney(monthlyBasicForMonth(m,state)-monthlyBasicForMonth(m,state,deal.id));
      const emergencyDiff=roundMoney(emergencyForMonth(m,state)-emergencyForMonth(m,state,deal.id));
      out.salary+=salaryDiff;out.emergency+=emergencyDiff;out.pension+=roundMoney(salaryDiff*pensionRateForMonth(m,state));
    }
    for(const p of state?.periods||[]){if(String(p.date)<first||compareMonth(paymentMonthForWorkDate(p.date),month)>=0)continue;out.ot+=roundMoney(overtimePeriodGross(p,state)-overtimePeriodGross(p,state,deal.id))}
    for(const c of state?.standbyClaims||[])for(const date of standbyClaimDates(c)){
      if(String(date)<first||compareMonth(paymentMonthForWorkDate(date),month)>=0)continue;
      if(c.rateOverride!=null)continue;
      out.standby+=roundMoney(standbyRateAt(date,state)-standbyRateAt(date,state,deal.id));
    }
  }
  for(const k of ['salary','emergency','ot','standby','pension'])out[k]=roundMoney(out[k]);
  out.totalGross=roundMoney(out.salary+out.emergency+out.ot+out.standby);return out;
}
export function lumpSumsForPayMonth(month,state){let total=0;const lines=[];for(const deal of state?.payDeals||[])for(const c of dealComponents(deal))if(c.type==='lump'&&monthKey(c.paymentMonth||'')===month){const v=roundMoney(c.value);total+=v;lines.push({name:c.name||deal.name||'Pay award',amount:v})}return{total:roundMoney(total),lines}}

export function actualForMonth(month,state){return(state?.actuals||[]).find(a=>monthKey(a.payMonth)===monthKey(month))||null}
export function qualifyingOtForPayMonth(month,state){const actual=actualForMonth(month,state);if(actual)return roundMoney(Number(actual.ot15Pay||0)+Number(actual.ot2Pay||0));return overtimeForPayMonth(month,state).total}
export function qualifyingOtPaidInYear(year,state){let total=0;for(let m=1;m<=12;m++)total+=qualifyingOtForPayMonth(`${year}-${pad(m)}`,state);return roundMoney(total)}
export const holidayBonusFromQualifyingOt=ot=>roundMoney(Number(ot||0)/12);
export function holidayBonusForPayMonth(month,state){const p={...BASE_PROFILE,...(state?.profile||{})};const [,m]=month.split('-').map(Number);if(m!==Number(p.holidayBonusPayMonth||4))return 0;const year=Number(month.slice(0,4));return holidayBonusFromQualifyingOt(qualifyingOtPaidInYear(year-1,state))}

export function codeFreePayAnnual(code){const c=String(code||'').toUpperCase().trim(),k=c.match(/^K(\d+)/);if(k)return-(Number(k[1])*10+9);const n=c.match(/^(\d+)/);return n?Number(n[1])*10+9:0}
function taxAtBands(taxable,rules,periodFactor=1){const basic=rules.basicBand*periodFactor,higher=(rules.additionalThreshold-rules.basicBand)*periodFactor;let x=Math.max(0,taxable),tax=0;const b=Math.min(x,basic);tax+=b*.2;x-=b;const h=Math.min(Math.max(0,x),higher);tax+=h*.4;x-=h;if(x>0)tax+=x*.45;return floorMoney(tax)}
export function cumulativePayeDue(ytdTaxable,taxPeriod,taxCode,rules){const code=String(taxCode||'').toUpperCase(),gross=Math.floor(Number(ytdTaxable)||0),f=Number(taxPeriod)/12;if(code==='BR')return floorMoney(gross*.2);if(code==='D0')return floorMoney(gross*.4);if(code==='D1')return floorMoney(gross*.45);const free=Math.round(codeFreePayAnnual(code)*f),taxable=Math.max(0,gross-free);return taxAtBands(taxable,rules,f)}
export function nonCumulativePaye(amount,taxCode,rules){const code=String(taxCode||'').toUpperCase(),gross=Math.floor(Number(amount)||0);if(code==='BR')return floorMoney(gross*.2);if(code==='D0')return floorMoney(gross*.4);if(code==='D1')return floorMoney(gross*.45);const free=Math.round(codeFreePayAnnual(code)/12);return taxAtBands(Math.max(0,gross-free),rules,1/12)}
export function employeeNI(amount,category,rules){if(String(category||'A').toUpperCase()!=='A')return 0;const p=Math.max(0,Number(amount)||0),main=Math.max(0,Math.min(p,rules.niUEL)-rules.niPT)*rules.niMain,upper=Math.max(0,p-rules.niUEL)*rules.niUpper;return roundMoney(main+upper)}

function taxYearStartsInMonth(month){return month.endsWith('-04')}
function actualAnchorBefore(month,state){const target=monthKey(month);return[...(state?.actuals||[])].filter(a=>compareMonth(a.payMonth,target)<0).sort((a,b)=>compareMonth(a.payMonth,b.payMonth)).at(-1)||null}
function anchorValues(actual){return actual?{month:monthKey(actual.payMonth),ytdTaxable:Number(actual.ytdTaxable||0),ytdTax:Number(actual.ytdTax||0),ytdNI:Number(actual.ytdNi||0),ytdPension:Number(actual.ytdPension||0)}:null}

export function forecastPayrollMonth(month,state,prior=null){
  month=monthKey(month);const actual=actualForMonth(month,state);if(actual)return{...actual,status:'actual',payMonth:month};
  const profile={...BASE_PROFILE,...(state?.profile||{})},payDate=payDateForMonth(month,profile),period=taxPeriodForDate(payDate),rules=rulesForDate(payDate);
  const basic=monthlyBasicForMonth(month,state),emergency=emergencyForMonth(month,state),ot=overtimeForPayMonth(month,state),standby=standbyForPayMonth(month,state),arrears=dealArrearsForPayMonth(month,state),lumps=lumpSumsForPayMonth(month,state),holidayBonus=holidayBonusForPayMonth(month,state),pension=roundMoney(basic*pensionRateForMonth(month,state)+arrears.pension),recurring=recurringEffects(month,state);
  const grossCash=roundMoney(basic+emergency+ot.total+standby.total+arrears.totalGross+lumps.total+holidayBonus),grossTaxable=roundMoney(grossCash-pension-recurring.payeReduction),payeTaxable=roundMoney(grossTaxable+recurring.taxableBenefits),niable=roundMoney(grossCash-pension-recurring.niReduction);
  const code=taxCodeAt(payDate,state),basis=taxBasisAt(payDate,state),niCategory=niCategoryAt(payDate,state);let prev=prior;
  if(!prev||taxYearForDate(payDate)!==taxYearForDate(payDateForMonth(prev.month||previousMonth(month),profile))||taxYearStartsInMonth(month))prev={month:previousMonth(month),ytdTaxable:0,ytdTax:0,ytdNI:0,ytdPension:0};
  const ytdTaxable=roundMoney(Number(prev.ytdTaxable||0)+payeTaxable);let payeTax,ytdTax;
  if(String(basis).toLowerCase()==='cumulative'){const due=cumulativePayeDue(ytdTaxable,period,code,rules);payeTax=roundMoney(due-Number(prev.ytdTax||0));ytdTax=due}else{payeTax=nonCumulativePaye(grossTaxable,code,rules);ytdTax=roundMoney(Number(prev.ytdTax||0)+payeTax)}
  const ni=employeeNI(niable,niCategory,rules),ytdNI=roundMoney(Number(prev.ytdNI||0)+ni),ytdPension=roundMoney(Number(prev.ytdPension||0)+pension),netPay=roundMoney(grossCash-pension-recurring.cash-payeTax-ni);
  return{status:'forecast',payMonth:month,payDate,taxPeriod:period,taxCode:code,taxBasis:basis,niCategory,rulesAssumed:!!rules.assumed,basicPay:basic,emergencyPay:emergency,ot15Hours:ot.h15,ot15Pay:ot.pay15,ot2Hours:ot.h2,ot2Pay:ot.pay2,standbyDays:standby.units,standbyPay:standby.total,holidayBonus,arrearsPay:arrears.totalGross,arrearsPension:arrears.pension,lumpSumPay:lumps.total,pension,grossCash,grossTaxable,payeTaxable,niable,taxableBenefits:recurring.taxableBenefits,recurringDeductions:recurring.cash,payeTax,employeeNi:ni,netPay,ytdTaxable,ytdTax,ytdNi:ytdNI,ytdPension};
}
export function payrollForMonth(month,state){
  month=monthKey(month);const actual=actualForMonth(month,state);if(actual)return{...actual,status:'actual',payMonth:month};
  const profile={...BASE_PROFILE,...(state?.profile||{})};let anchor=actualAnchorBefore(month,state),prior=anchorValues(anchor),start;
  if(anchor&&taxYearForDate(payDateForMonth(anchor.payMonth,profile))===taxYearForDate(payDateForMonth(month,profile)))start=addMonths(anchor.payMonth,1);else{const y=Number(taxYearForDate(payDateForMonth(month,profile)).slice(0,4));start=`${y}-04`;prior={month:addMonths(start,-1),ytdTaxable:0,ytdTax:0,ytdNI:0,ytdPension:0}}
  let result=null;for(const m of monthRange(start,addMonths(month,1))){result=forecastPayrollMonth(m,state,prior);prior={month:m,ytdTaxable:result.ytdTaxable,ytdTax:result.ytdTax,ytdNI:result.ytdNi,ytdPension:result.ytdPension}}return result||forecastPayrollMonth(month,state,prior);
}
export function payrollForecast(state,startMonth,count=12){const out=[];for(let i=0;i<count;i++)out.push(payrollForMonth(addMonths(startMonth,i),state));return out}
export function nextPayMonth(today,state){const profile={...BASE_PROFILE,...(state?.profile||{})},month=monthKey(today),payDate=payDateForMonth(month,profile);return String(today).slice(0,10)<=payDate?month:addMonths(month,1)}
export function taxYearProjection(state,today){const start=nextPayMonth(today,state),profile={...BASE_PROFILE,...(state?.profile||{})},payDate=payDateForMonth(start,profile),taxYear=taxYearForDate(payDate),startYear=Number(taxYear.slice(0,4)),endMonth=`${startYear+1}-03`;let month=start;const rows=[];while(compareMonth(month,endMonth)<=0){rows.push(payrollForMonth(month,state));month=addMonths(month,1)}const last=rows.at(-1);return{taxYear,rows,projectedTaxable:last?.ytdTaxable||0,projectedTax:last?.ytdTax||0,projectedNI:last?.ytdNi||0,projectedPension:last?.ytdPension||0,projectedNet:roundMoney(rows.reduce((s,r)=>s+Number(r.netPay||0),0))}}
