import * as core from './core.js';
import * as pay from './payroll.js';
import {consumeShareFragment,storeShareLink,loadLocalCache,saveLocalCache,readV1State,defaultState,createDataClient,startPolling} from './data.js';
import * as ui from './ui.js';

const CONFIG={projectUrl:'https://duskpiqfimuxjpnqcolx.supabase.co',publishableKey:'sb_publishable_hESTJUWoOG6S83y3MbfJhg_aka5SR-i'};
let state=normalizeState(loadLocalCache()||readV1State()||defaultState());
let creds=consumeShareFragment(),client=null,online=false,saving=false,stopPolling=null;
let workMonth=ui.today().slice(0,7),forecastLength=12;

function normalizeState(raw={}){const d=defaultState();return{...d,...raw,periods:Array.isArray(raw.periods)?raw.periods:d.periods,expenses:Array.isArray(raw.expenses)?raw.expenses:[],profile:{...pay.BASE_PROFILE,...(raw.profile||{})},standbyClaims:Array.isArray(raw.standbyClaims)?raw.standbyClaims:[],payrollEvents:Array.isArray(raw.payrollEvents)?raw.payrollEvents:[],payDeals:Array.isArray(raw.payDeals)?raw.payDeals:[],recurringItems:Array.isArray(raw.recurringItems)?raw.recurringItems:[],actuals:Array.isArray(raw.actuals)?raw.actuals:[]}}
const money=ui.formatMoney;
const line=(name,value,sub='',cls='')=>`<div class="money-row ${cls}"><div><div class="name">${ui.esc(name)}</div>${sub?`<div class="sub">${ui.esc(sub)}</div>`:''}</div><div class="value">${money(value)}</div></div>`;
const empty=label=>`<div class="muted" style="padding:12px 0">${ui.esc(label)}</div>`;
function currentNextMonth(){return pay.nextPayMonth(ui.today(),state)}

function renderPay(){
  const month=currentNextMonth(),p=pay.payrollForMonth(month,state),status=p.status==='actual';
  ui.$('nextPayStatus').textContent=status?'Actual':'Forecast';ui.$('nextPayStatus').classList.toggle('actual',status);
  ui.$('nextPayDate').textContent=ui.formatDate(p.payDate||pay.payDateForMonth(month,state.profile));ui.$('nextPayNet').textContent=money(p.netPay);ui.$('nextPayMonth').textContent=ui.formatMonth(month);ui.$('breakdownMonthLabel').textContent=ui.formatMonth(month);
  let html='';html+=line('Basic',p.basicPay||0);html+=line('Emergency',p.emergencyPay||0);
  if(Number(p.ot15Pay||0))html+=line('Overtime 1.5×',p.ot15Pay,`${Number(p.ot15Hours||0).toFixed(2)} h`);
  if(Number(p.ot2Pay||0))html+=line('Overtime 2×',p.ot2Pay,`${Number(p.ot2Hours||0).toFixed(2)} h`);
  if(Number(p.standbyPay||0))html+=line('Pager',p.standbyPay,`${Number(p.standbyDays||0)} days`);
  if(Number(p.holidayBonus||0))html+=line('Holiday payment',p.holidayBonus);
  if(Number(p.arrearsPay||0))html+=line('Arrears',p.arrearsPay);
  if(Number(p.lumpSumPay||p.otherPay||0))html+=line('One-off',p.lumpSumPay||p.otherPay);
  html+=line('Pension',-Number(p.pension||0));
  if(Number(p.recurringDeductions||0))html+=line('Schemes',-Number(p.recurringDeductions||0));
  html+=line('PAYE',-Number(p.payeTax||0));html+=line('NI',-Number(p.employeeNi||0));html+=line('Net pay',p.netPay||0,'','total');ui.$('payBreakdown').innerHTML=html;
  const actuals=[...state.actuals].sort((a,b)=>b.payMonth.localeCompare(a.payMonth)).slice(0,4);
  ui.$('actualList').innerHTML=actuals.length?actuals.map(a=>{const f=a.forecastSnapshot?.netPay,diff=f!=null&&a.netPay!=null?Number(a.netPay)-Number(f):null;return `<div class="list-row"><button type="button" data-edit-actual="${ui.esc(a.id)}"><div class="list-title">${ui.formatMonth(a.payMonth)}</div><div class="list-sub">${ui.formatDate(a.payDate)}${diff==null?'':` · Forecast ${money(f)} · ${diff>=0?'+':''}${money(diff)}`}</div></button><strong>${money(a.netPay)}</strong></div>`}).join(''):empty('No actual payslips yet');
}
function renderWork(){
  ui.$('workMonth').value=workMonth;
  const periods=state.periods.filter(p=>p.date.startsWith(workMonth)).sort((a,b)=>a.date.localeCompare(b.date));
  const hours=periods.reduce((s,p)=>s+core.periodDurationHours(p),0);
  ui.$('workOtTotal').textContent=`${hours.toFixed(1)} h`;
  ui.$('overtimeList').innerHTML=periods.length?periods.map(p=>{
    const h=core.periodDurationHours(p);
    const shownHours=h.toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
    return `<form class="inline-ot-row" data-inline-ot-form data-ot-id="${ui.esc(p.id)}">
      <div class="inline-ot-fields">
        <label class="field"><span>Date</span><input data-ot-date type="date" value="${ui.esc(p.date)}" required></label>
        <label class="field"><span>Hours</span><input data-ot-hours type="number" min="0.25" max="24" step="0.25" inputmode="decimal" value="${ui.esc(shownHours)}" required></label>
        <label class="field"><span>Rate</span><select data-ot-rate><option value="1.5" ${Number(p.multiplier)===1.5?'selected':''}>1.5×</option><option value="2" ${Number(p.multiplier)===2?'selected':''}>2×</option></select></label>
      </div>
      <div class="inline-ot-actions"><button class="inline-save" type="submit">Save</button><button class="inline-delete" type="button" data-delete-inline-ot="${ui.esc(p.id)}">Delete</button></div>
      <p class="inline-error" data-inline-ot-error hidden></p>
    </form>`;
  }).join(''):empty('No overtime this month');
  const claims=state.standbyClaims.filter(c=>pay.standbyClaimDates(c).some(d=>d.startsWith(workMonth))).sort((a,b)=>a.date.localeCompare(b.date));
  const units=claims.reduce((s,c)=>s+pay.standbyClaimDates(c).filter(d=>d.startsWith(workMonth)).length,0);
  ui.$('workPagerTotal').textContent=`${units} days`;
  ui.$('standbyList').innerHTML=claims.length?claims.map(c=>`<div class="list-row"><button type="button" data-edit-standby="${ui.esc(c.id)}"><div class="list-title">${ui.formatDate(c.date)}</div><div class="list-sub">Starts here · ${Number(c.units)} day${Number(c.units)===1?'':'s'}${c.publicHoliday?' · Public holiday':''}</div></button><strong>${money(pay.standbyClaimGross(c,state))}</strong></div>`).join(''):empty('No pager days this month');
  if(!ui.value('addOtDate')) resetOvertimeAddForm();
}
function renderForecast(){
  const start=currentNextMonth(),rows=pay.payrollForecast(state,start,forecastLength),proj=pay.taxYearProjection(state,ui.today());ui.$('taxYearLabel').textContent=proj.taxYear;ui.$('taxYearTaxable').textContent=money(proj.projectedTaxable);ui.$('taxYearTax').textContent=money(proj.projectedTax);
  const year=Number(ui.today().slice(0,4)),qualifying=pay.qualifyingOtPaidInYear(year,state),bonus=pay.holidayBonusFromQualifyingOt(qualifying);ui.$('holidayBonusYear').textContent=String(year+1);ui.$('holidayBonusValue').textContent=money(bonus);ui.$('holidayBonusQualifying').textContent=`From ${money(qualifying)} qualifying OT paid in ${year}`;
  ui.$('forecastList').innerHTML=rows.map(r=>`<div class="forecast-row ${r.status==='actual'?'actual':''}"><div><div class="list-title">${ui.formatMonth(r.payMonth)}</div><div class="forecast-sub">${ui.formatDate(r.payDate)} · <span class="forecast-tag">${r.status==='actual'?'Actual':r.rulesAssumed?'Forecast · assumed tax rules':'Forecast'}</span></div></div><div class="forecast-net">${money(r.netPay)}</div></div>`).join('');
}
function dealSummary(d){return(d.components||[]).map(c=>c.type==='percent'?`${c.value}% ${c.effectiveDate}`:c.type==='fixed'?`+${money(c.value)}/yr ${c.effectiveDate}`:`${money(c.value)} ${c.paymentMonth}`).join(' · ')}
function renderSettings(){
  const today=ui.today(),salary=pay.salaryAt(today,state),pension=pay.pensionRateAt(today,state),taxCode=pay.taxCodeAt(today,state),ni=pay.niCategoryAt(today,state),emergency=pay.emergencyForMonth(today.slice(0,7),state),standby=pay.standbyRateAt(today,state);
  ui.$('settingsSummary').innerHTML=`<div class="setting"><span class="label">Salary</span><strong>${money(salary)}</strong></div><div class="setting"><span class="label">Pension</span><strong>${(pension*100).toFixed(2)}%</strong></div><div class="setting"><span class="label">Emergency</span><strong>${money(emergency)}/mo</strong></div><div class="setting"><span class="label">Pager</span><strong>${money(standby)}/day</strong></div><div class="setting"><span class="label">Tax code</span><strong>${ui.esc(taxCode)}</strong></div><div class="setting"><span class="label">NI</span><strong>${ui.esc(ni)}</strong></div>`;
  ui.$('payDealList').innerHTML=state.payDeals.length?state.payDeals.map(d=>`<div class="list-row"><div><div class="list-title">${ui.esc(d.name)}</div><div class="list-sub">${ui.esc(dealSummary(d))}${d.arrearsPayMonth?` · arrears ${ui.formatMonth(d.arrearsPayMonth)}`:''}</div></div><div class="list-actions"><button data-edit-deal="${ui.esc(d.id)}">Edit</button></div></div>`).join(''):empty('No pay deals added');
  ui.$('schemeList').innerHTML=state.recurringItems.length?state.recurringItems.map(i=>`<div class="list-row"><div><div class="list-title">${ui.esc(i.name)}</div><div class="list-sub">${money(i.amount)}/month · ${ui.formatMonth(i.startPayMonth)}${i.endPayMonth?` to ${ui.formatMonth(i.endPayMonth)}`:' onward'}</div></div><div class="list-actions"><button data-edit-scheme="${ui.esc(i.id)}">Edit</button></div></div>`).join(''):empty('No schemes');
  const events=[...state.payrollEvents].sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate));ui.$('eventList').innerHTML=events.length?events.map(e=>`<div class="list-row"><div><div class="list-title">${ui.esc(eventName(e))}</div><div class="list-sub">From ${ui.formatDate(e.effectiveDate)}</div></div><div class="list-actions"><button data-edit-event="${ui.esc(e.id)}">Edit</button></div></div>`).join(''):empty('No separate changes');
}
function eventName(e){if(e.eventType==='pension_rate')return`Pension ${(Number(e.valueNumeric)*100).toFixed(2)}%`;if(e.eventType==='tax_code')return`Tax code ${e.valueText}`;if(e.eventType==='ni_category')return`NI category ${e.valueText}`;if(e.eventType==='salary_override')return`Salary ${money(e.valueNumeric)}`;if(e.eventType==='emergency_annual')return`Emergency ${money(e.valueNumeric)}/yr`;if(e.eventType==='standby_daily')return`Pager ${money(e.valueNumeric)}/day`;return e.eventType}
function renderAll(){try{renderPay();renderWork();renderForecast();renderSettings()}catch(e){console.error(e);ui.showError('A forecast could not be calculated. Check Settings.')}}

async function refresh(){if(!client)return;try{const remote=await client.getState();state=normalizeState(remote);online=true;saveLocalCache(state);ui.setSyncStatus('synced');ui.setReadOnly(false);ui.showError('');renderAll()}catch(e){online=false;ui.setSyncStatus(e.code==='invalid-link'?'invalid-link':'offline');ui.setReadOnly(true);ui.showError(e.code==='invalid-link'?'This private link is no longer valid.':'Shared data is unavailable. Showing cached figures.');ui.setConnectPanel(e.code==='invalid-link');renderAll()}}
async function mutate(fn){if(!client||!online){ui.showError('Reconnect before making changes.');throw new Error('Offline')}if(saving)throw new Error('Save already in progress.');saving=true;ui.setSyncStatus('saving');try{await fn();await refresh()}finally{saving=false}}
async function connect(){renderAll();if(!creds){ui.setSyncStatus('invalid-link');ui.setConnectPanel(true);ui.setReadOnly(true);return}client=createDataClient({...CONFIG,...creds});ui.setSyncStatus('loading');try{let remote=await client.getState();if(!remote.initialized){const seed=readV1State()||defaultState(),r=await client.seedIfEmpty(seed);remote=r.state}state=normalizeState(remote);online=true;saveLocalCache(state);ui.setSyncStatus('synced');ui.setConnectPanel(false);ui.setReadOnly(false);renderAll();stopPolling?.();stopPolling=startPolling({load:()=>client.getState(),onStatus:s=>{online=s==='synced';ui.setSyncStatus(s);ui.setReadOnly(!online)},onChange:r=>{state=normalizeState(r);saveLocalCache(state);renderAll()}})}catch(e){online=false;ui.setSyncStatus(e.code==='invalid-link'?'invalid-link':'offline');ui.setReadOnly(true);ui.setConnectPanel(e.code==='invalid-link');ui.showError(e.code==='invalid-link'?'Paste the current private link.':'Could not reach shared data.');renderAll()}}

function defaultWorkDate(){const t=ui.today();return t.startsWith(workMonth)?t:`${workMonth}-01`}
function resetOvertimeAddForm(date=defaultWorkDate()){
  ui.setValue('addOtDate',date);
  ui.setValue('addOtHours',1);
  ui.setValue('addOtRate',core.defaultMultiplierForDate(date));
  ui.inlineError('addOtError','');
}
function jumpToOvertime(useCurrentMonth=false){
  if(useCurrentMonth){
    workMonth=ui.today().slice(0,7);
    ui.$('workMonth').value=workMonth;
    resetOvertimeAddForm(ui.today());
  }else if(!ui.value('addOtDate')||!ui.value('addOtDate').startsWith(workMonth)){
    resetOvertimeAddForm();
  }
  ui.showPage('work');
  renderWork();
  requestAnimationFrame(()=>{
    ui.$('overtimeCard')?.scrollIntoView({behavior:'smooth',block:'start'});
    ui.$('addOtHours')?.focus({preventScroll:true});
  });
}
function openStandby(c=null){ui.setValue('standbyId',c?.id||'');ui.setValue('standbyDate',c?.date||defaultWorkDate());ui.setValue('standbyUnits',c?.units||1);ui.$('standbyPublic').checked=!!c?.publicHoliday;ui.$('deleteStandbyBtn').hidden=!c;ui.inlineError('standbyError','');ui.openDialog('standbyDialog')}
function payslipEntryMonth(){const t=ui.today(),m=t.slice(0,7),pd=pay.payDateForMonth(m,state.profile);return t>=pd?m:pay.previousMonth(m)}
function openActual(a=null,month=null){const m=month||a?.payMonth||payslipEntryMonth(),f=a||pay.payrollForMonth(m,state);ui.setValue('actualId',a?.id||'');ui.setValue('actualMonth',m);ui.setValue('actualDate',f.payDate||pay.payDateForMonth(m,state.profile));ui.setValue('actualTaxCode',f.taxCode||state.profile.taxCode);ui.setValue('actualNiCategory',f.niCategory||state.profile.niCategory);ui.setValue('actualNet',f.netPay);ui.setValue('actualTax',f.payeTax);ui.setValue('actualNi',f.employeeNi);ui.setValue('actualPension',f.pension);ui.setValue('actualYtdTaxable',f.ytdTaxable);ui.setValue('actualYtdTax',f.ytdTax);ui.setValue('actualYtdNi',f.ytdNi);ui.setValue('actualYtdPension',f.ytdPension);ui.setValue('actualBasic',f.basicPay);ui.setValue('actualEmergency',f.emergencyPay);ui.setValue('actualStandbyDays',f.standbyDays);ui.setValue('actualStandbyPay',f.standbyPay);ui.setValue('actualOt15Hours',f.ot15Hours);ui.setValue('actualOt15Pay',f.ot15Pay);ui.setValue('actualOt2Hours',f.ot2Hours);ui.setValue('actualOt2Pay',f.ot2Pay);ui.setValue('actualHoliday',f.holidayBonus);ui.setValue('actualGrossTaxable',f.grossTaxable);ui.setValue('actualBenefits',f.taxableBenefits);ui.inlineError('actualError','');ui.openDialog('actualDialog')}

function componentHtml(c={}){const id=crypto.randomUUID();return`<div class="deal-component" data-component="${id}"><div class="deal-component-head"><strong>Change</strong><button type="button" data-remove-component>Remove</button></div><label class="field"><span>Type</span><select data-comp-type><option value="percent" ${c.type==='percent'?'selected':''}>Percentage</option><option value="fixed" ${c.type==='fixed'?'selected':''}>Consolidated £ / year</option><option value="lump" ${c.type==='lump'?'selected':''}>One-off lump sum</option></select></label><div class="form-grid"><label class="field"><span>Effective date</span><input data-comp-date type="date" value="${ui.esc(c.effectiveDate||'2027-04-06')}" required></label><label class="field"><span>Value</span><input data-comp-value type="number" step="0.01" value="${ui.esc(c.value??'')}" required></label></div><div class="form-grid"><label class="field"><span>% basis</span><select data-comp-basis><option value="current" ${c.basis!=='deal-start'?'selected':''}>Current salary</option><option value="deal-start" ${c.basis==='deal-start'?'selected':''}>Salary before this deal</option></select></label><label class="field"><span>Lump paid</span><input data-comp-payment type="month" value="${ui.esc(c.paymentMonth||'')}"></label></div></div>`}
function addDealComponent(c){ui.$('dealComponents').insertAdjacentHTML('beforeend',componentHtml(c))}
function openDeal(d=null){ui.setValue('payDealId',d?.id||'');ui.setValue('payDealName',d?.name||'');ui.setValue('payDealAgreed',d?.agreedDate||ui.today());ui.setValue('payDealArrears',d?.arrearsPayMonth||'');ui.$('dealComponents').innerHTML='';for(const c of d?.components?.length?d.components:[{type:'percent',effectiveDate:'2027-04-06',basis:'current'}])addDealComponent(c);ui.$('deletePayDealBtn').hidden=!d;ui.inlineError('dealError','');ui.openDialog('payDealDialog')}
function gatherComponents(){return[...document.querySelectorAll('[data-component]')].map(row=>{const type=row.querySelector('[data-comp-type]').value,effectiveDate=row.querySelector('[data-comp-date]').value,value=Number(row.querySelector('[data-comp-value]').value),basis=row.querySelector('[data-comp-basis]').value,paymentMonth=row.querySelector('[data-comp-payment]').value;return{type,effectiveDate,value,...(type==='percent'?{basis}:{}),...(type==='lump'?{paymentMonth}:{})}})}
function schemeType(i){if(i?.reducesPaye&&i?.reducesNi&&i?.taxableBenefit)return'flex';if(i?.reducesPaye&&i?.reducesNi)return'pretax';return'posttax'}
function openScheme(i=null){ui.setValue('schemeId',i?.id||'');ui.setValue('schemeName',i?.name||'');ui.setValue('schemeAmount',i?.amount||'');ui.setValue('schemeStart',i?.startPayMonth||currentNextMonth());ui.setValue('schemeEnd',i?.endPayMonth||'');ui.setValue('schemeType',schemeType(i));ui.$('deleteSchemeBtn').hidden=!i;ui.inlineError('schemeError','');ui.openDialog('schemeDialog')}
function openChange(e=null){ui.setValue('changeId',e?.id||'');ui.setValue('changeType',e?.eventType||'pension_rate');ui.setValue('changeDate',e?.effectiveDate||ui.today());const v=e?(e.eventType==='pension_rate'?Number(e.valueNumeric)*100:(e.valueText??e.valueNumeric)):'';ui.setValue('changeValue',v);ui.$('deleteChangeBtn').hidden=!e;ui.inlineError('changeError','');ui.openDialog('changeDialog')}
function openProfile(){const p=state.profile;ui.setValue('profileSalary',p.annualSalary);ui.setValue('profileSalaryDate',p.salaryEffectiveDate);ui.setValue('profilePension',Number(p.pensionRate)*100);ui.setValue('profileEmergency',p.emergencyAnnualAmount);ui.setValue('profileStandby',p.standbyDailyRate);ui.setValue('profileTaxCode',p.taxCode);ui.setValue('profileNiCategory',p.niCategory);ui.inlineError('profileError','');ui.openDialog('profileDialog')}

document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-nav]');if(nav){ui.showPage(nav.dataset.nav);return}
  const otJump=e.target.closest('[data-overtime-jump]');if(otJump){jumpToOvertime(otJump.dataset.overtimeJump==='current');return}
  const close=e.target.closest('[data-close]');if(close){ui.closeDialog(close.dataset.close);return}
  const open=e.target.closest('[data-open]');if(open){if(open.dataset.open==='standbyDialog')openStandby();else if(open.dataset.open==='actualDialog')openActual(null,currentNextMonth());else ui.openDialog(open.dataset.open);return}
  const otDelete=e.target.closest('[data-delete-inline-ot]');if(otDelete){
    const id=otDelete.dataset.deleteInlineOt;
    if(id)mutate(()=>client.deletePeriod(id)).catch(err=>ui.showError(err.message));
    return;
  }
  const sb=e.target.closest('[data-edit-standby]');if(sb){openStandby(state.standbyClaims.find(x=>x.id===sb.dataset.editStandby));return}
  const ac=e.target.closest('[data-edit-actual]');if(ac){openActual(state.actuals.find(x=>x.id===ac.dataset.editActual));return}
  const dl=e.target.closest('[data-edit-deal]');if(dl){openDeal(state.payDeals.find(x=>x.id===dl.dataset.editDeal));return}
  const sc=e.target.closest('[data-edit-scheme]');if(sc){openScheme(state.recurringItems.find(x=>x.id===sc.dataset.editScheme));return}
  const ev=e.target.closest('[data-edit-event]');if(ev){openChange(state.payrollEvents.find(x=>x.id===ev.dataset.editEvent));return}
  if(e.target.closest('[data-remove-component]')){e.target.closest('[data-component]')?.remove()}
});
ui.$('workMonth').addEventListener('change',e=>{workMonth=e.target.value||workMonth;resetOvertimeAddForm();renderWork()});ui.$('forecastLength').addEventListener('change',e=>{forecastLength=Number(e.target.value)||12;renderForecast()});
ui.$('addPayDealBtn').onclick=()=>openDeal();ui.$('addSchemeBtn').onclick=()=>openScheme();ui.$('addChangeBtn').onclick=()=>openChange();ui.$('editProfileBtn').onclick=openProfile;ui.$('addDealComponent').onclick=()=>addDealComponent({type:'percent',effectiveDate:'2027-04-06',basis:'current'});

ui.$('connectForm').addEventListener('submit',e=>{e.preventDefault();const next=storeShareLink(ui.value('connectLink'));if(!next){ui.inlineError('connectError','Paste the full private link.');return}creds=next;client=null;online=false;stopPolling?.();stopPolling=null;ui.setConnectPanel(false);connect()});
ui.$('overtimeAddForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const p={date:ui.value('addOtDate'),hours:Number(ui.value('addOtHours')),multiplier:Number(ui.value('addOtRate'))};
  const valid=core.validatePeriod(p,state.periods);
  if(!valid.ok){ui.inlineError('addOtError',valid.message);return}
  try{
    await mutate(()=>client.upsertPeriod(p));
    resetOvertimeAddForm(p.date);
  }catch(err){ui.inlineError('addOtError',err.message)}
});
ui.$('overtimeList').addEventListener('submit',async e=>{
  const form=e.target.closest('[data-inline-ot-form]');
  if(!form)return;
  e.preventDefault();
  const error=form.querySelector('[data-inline-ot-error]');
  const p={
    id:form.dataset.otId,
    date:form.querySelector('[data-ot-date]').value,
    hours:Number(form.querySelector('[data-ot-hours]').value),
    multiplier:Number(form.querySelector('[data-ot-rate]').value)
  };
  const valid=core.validatePeriod(p,state.periods);
  if(!valid.ok){if(error){error.textContent=valid.message;error.hidden=false}return}
  if(error)error.hidden=true;
  try{await mutate(()=>client.upsertPeriod(p))}
  catch(err){if(error){error.textContent=err.message;error.hidden=false}}
});
ui.$('standbyForm').addEventListener('submit',async e=>{e.preventDefault();const c={id:ui.value('standbyId')||undefined,date:ui.value('standbyDate'),units:Math.floor(Number(ui.value('standbyUnits'))),publicHoliday:ui.$('standbyPublic').checked};try{await mutate(()=>client.upsertStandby(c));ui.closeDialog('standbyDialog')}catch(err){ui.inlineError('standbyError',err.message)}});
ui.$('deleteStandbyBtn').onclick=async()=>{const id=ui.value('standbyId');if(!id)return;try{await mutate(()=>client.deleteStandby(id));ui.closeDialog('standbyDialog')}catch(e){ui.inlineError('standbyError',e.message)}};
ui.$('actualForm').addEventListener('submit',async e=>{e.preventDefault();const month=ui.value('actualMonth'),forecast=pay.payrollForMonth(month,state);const a={id:ui.value('actualId')||undefined,payMonth:month,payDate:ui.value('actualDate'),taxPeriod:pay.taxPeriodForDate(ui.value('actualDate')),taxCode:ui.value('actualTaxCode').trim().toUpperCase(),taxBasis:'cumulative',niCategory:ui.value('actualNiCategory').trim().toUpperCase()||'A',netPay:ui.numValue('actualNet'),payeTax:ui.numValue('actualTax'),employeeNi:ui.numValue('actualNi'),pension:ui.numValue('actualPension'),ytdTaxable:ui.numValue('actualYtdTaxable'),ytdTax:ui.numValue('actualYtdTax'),ytdNi:ui.numValue('actualYtdNi'),ytdPension:ui.numValue('actualYtdPension'),basicPay:ui.numValue('actualBasic'),emergencyPay:ui.numValue('actualEmergency'),standbyDays:ui.numValue('actualStandbyDays'),standbyPay:ui.numValue('actualStandbyPay'),ot15Hours:ui.numValue('actualOt15Hours'),ot15Pay:ui.numValue('actualOt15Pay'),ot2Hours:ui.numValue('actualOt2Hours'),ot2Pay:ui.numValue('actualOt2Pay'),holidayBonus:ui.numValue('actualHoliday'),grossTaxable:ui.numValue('actualGrossTaxable'),taxableBenefits:ui.numValue('actualBenefits'),forecastSnapshot:forecast.status==='forecast'?forecast:(forecast.forecastSnapshot||null)};try{await mutate(()=>client.upsertActualPayslip(a));ui.closeDialog('actualDialog')}catch(err){ui.inlineError('actualError',err.message)}});
ui.$('payDealForm').addEventListener('submit',async e=>{e.preventDefault();const d={id:ui.value('payDealId')||undefined,name:ui.value('payDealName'),agreedDate:ui.value('payDealAgreed'),arrearsPayMonth:ui.value('payDealArrears'),components:gatherComponents()};try{await mutate(()=>client.upsertPayDeal(d));ui.closeDialog('payDealDialog')}catch(err){ui.inlineError('dealError',err.message)}});
ui.$('deletePayDealBtn').onclick=async()=>{const id=ui.value('payDealId');if(!id)return;try{await mutate(()=>client.deletePayDeal(id));ui.closeDialog('payDealDialog')}catch(e){ui.inlineError('dealError',e.message)}};
ui.$('schemeForm').addEventListener('submit',async e=>{e.preventDefault();const type=ui.value('schemeType'),map={flex:{reducesCash:true,reducesPaye:true,reducesNi:true,taxableBenefit:true},pretax:{reducesCash:true,reducesPaye:true,reducesNi:true,taxableBenefit:false},posttax:{reducesCash:true,reducesPaye:false,reducesNi:false,taxableBenefit:false}};const i={id:ui.value('schemeId')||undefined,name:ui.value('schemeName'),amount:Number(ui.value('schemeAmount')),startPayMonth:ui.value('schemeStart'),endPayMonth:ui.value('schemeEnd'),...map[type]};try{await mutate(()=>client.upsertRecurringItem(i));ui.closeDialog('schemeDialog')}catch(err){ui.inlineError('schemeError',err.message)}});
ui.$('deleteSchemeBtn').onclick=async()=>{const id=ui.value('schemeId');if(!id)return;try{await mutate(()=>client.deleteRecurringItem(id));ui.closeDialog('schemeDialog')}catch(e){ui.inlineError('schemeError',e.message)}};
ui.$('changeForm').addEventListener('submit',async e=>{e.preventDefault();const type=ui.value('changeType'),raw=ui.value('changeValue'),textTypes=['tax_code','ni_category'];const event={id:ui.value('changeId')||undefined,eventType:type,effectiveDate:ui.value('changeDate'),valueText:textTypes.includes(type)?raw.trim().toUpperCase():null,valueNumeric:textTypes.includes(type)?null:(type==='pension_rate'?Number(raw)/100:Number(raw))};try{await mutate(()=>client.upsertPayrollEvent(event));ui.closeDialog('changeDialog')}catch(err){ui.inlineError('changeError',err.message)}});
ui.$('deleteChangeBtn').onclick=async()=>{const id=ui.value('changeId');if(!id)return;try{await mutate(()=>client.deletePayrollEvent(id));ui.closeDialog('changeDialog')}catch(e){ui.inlineError('changeError',e.message)}};
ui.$('profileForm').addEventListener('submit',async e=>{e.preventDefault();const p={...state.profile,annualSalary:Number(ui.value('profileSalary')),salaryEffectiveDate:ui.value('profileSalaryDate'),pensionRate:Number(ui.value('profilePension'))/100,pensionEffectiveDate:state.profile.pensionEffectiveDate||ui.value('profileSalaryDate'),emergencyAnnualAmount:Number(ui.value('profileEmergency')),standbyDailyRate:Number(ui.value('profileStandby')),taxCode:ui.value('profileTaxCode').trim().toUpperCase(),niCategory:ui.value('profileNiCategory').trim().toUpperCase()};try{await mutate(()=>client.updateProfile(p));ui.closeDialog('profileDialog')}catch(err){ui.inlineError('profileError',err.message)}});

window.addEventListener('online',()=>refresh());window.addEventListener('offline',()=>{online=false;ui.setSyncStatus('offline');ui.setReadOnly(true)});window.addEventListener('beforeunload',()=>stopPolling?.());if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
renderAll();connect();

ui.$('addOtDate')?.addEventListener('change',e=>ui.setValue('addOtRate',core.defaultMultiplierForDate(e.target.value)));
