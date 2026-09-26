import * as core from './core.js';
import {consumeShareFragment,loadLocalCache,saveLocalCache,readV1State,defaultState,createDataClient,startPolling} from './data.js';
import * as ui from './ui.js';
import * as fx from './effects.js';

const CONFIG={projectUrl:'https://duskpiqfimuxjpnqcolx.supabase.co',publishableKey:'sb_publishable_hESTJUWoOG6S83y3MbfJhg_aka5SR-i'};
let state=loadLocalCache()||readV1State()||defaultState();
let creds=consumeShareFragment();
let client=null,online=false,startedAt=Date.now(),lastTick=startedAt,lastEarned=core.calculateSnapshot(startedAt,state).earned;
let calendarCursor=(()=>{const [y,m]=ui.ukToday().split('-').map(Number);return{year:y,month:m-1}})();
let futureDate=core.DEFAULT_PERIODS.at(-1)?.date||ui.ukToday();
let stopPolling=null;

function modelNow(now=Date.now()){
  const snap=core.calculateSnapshot(now,state),end=core.deriveEndMs(state.periods);
  return{snap,end,completion:core.calculateCompletion(now,state)};
}
function comparison(amount){
  const choices=[
    `About ${Math.max(1,Math.round(amount/4.25)).toLocaleString()} suspiciously optimistic sausage rolls.`,
    `${Math.max(1,Math.floor(amount/500))} extremely unnecessary £500 impulse purchases.`,
    `${Math.max(1,Math.floor(amount/80))} “small” online orders that somehow became £80.`,
    `Enough to make the phrase “I’ll just do one more shift” financially dangerous.`
  ];
  return choices[Math.abs(Math.floor(amount))%choices.length];
}
function renderAll(now=Date.now()){
  const {snap,end,completion}=modelNow(now);
  ui.renderHome({snapshot:snap,completion,countdown:core.countdownMessage(now,end)});
  ui.renderHours(document.getElementById('hoursDate').value||ui.ukToday(),state,core);
  ui.renderSpend(state);
  ui.renderForecast({date:futureDate,futureBalance:core.calculateProjectedBalance(futureDate,state),earned:snap.earned,remaining:core.calculateRemainingEarnings(now,state),projectedTotal:core.calculateProjectedTotalEarnings(state),spent:snap.spent,endBalance:core.calculateEndBalance(state)});
  ui.renderCalendar({...calendarCursor,state,nowMs:now,core});
  const activeWeekend=(state.periods||[]).find(p=>{const day=new Date(`${p.date}T12:00:00Z`).getUTCDay();const s=core.ukDateTimeMs(p.date,p.start),e=core.ukDateTimeMs(p.date,p.end);return(day===0||day===6)&&now>=s&&now<e});
  ui.renderFun({milestones:core.getMilestones(now,state),achievements:core.getAchievements(now,state),level:core.getOutageLevel(now,state),comparison:comparison(snap.earned),boss:fx.bossModel(activeWeekend,now,core)});
}
async function refresh(){
  if(!client)return;
  try{const remote=await client.getState();state={periods:remote.periods,expenses:remote.expenses,updatedAt:remote.updatedAt};online=true;saveLocalCache(state);ui.setSyncStatus('synced');ui.showError('');renderAll()}catch(e){online=false;ui.setSyncStatus(e.code==='invalid-link'?'invalid-link':'offline');ui.showError(e.code==='invalid-link'?'This device no longer has a valid share link.':'Shared data is unavailable. Cached data is read only until it reconnects.');renderAll()}
}
async function mutate(fn){
  if(!client||!online){ui.showError('You are offline. Reconnect before changing shared data.');return null}
  ui.setSyncStatus('saving');ui.showError('');
  try{const out=await fn();await refresh();return out}catch(e){ui.setSyncStatus(e.code==='invalid-link'?'invalid-link':'synced');ui.showError(e.message||'Save failed. Your edit has not been discarded.');throw e}
}
function resetPeriodForm(){ui.setPeriodForm(null);ui.setInlineError('hours','')}
function resetExpenseForm(){ui.setExpenseForm(null,ui.ukToday());ui.setInlineError('spend','')}

ui.bindUI({
  open(id){ui.showDialog(id);if(id==='hoursDialog'){const d=ui.ukToday();ui.renderHours(d,state,core);resetPeriodForm()}if(id==='spendDialog')resetExpenseForm();renderAll()},
  close:ui.closeDialog,tab:ui.selectTab,
  hoursDate(date){ui.renderHours(date,state,core);resetPeriodForm()},
  futureDate(date){futureDate=date;renderAll()},
  month(delta){calendarCursor.month+=delta;if(calendarCursor.month<0){calendarCursor.month=11;calendarCursor.year--}if(calendarCursor.month>11){calendarCursor.month=0;calendarCursor.year++}renderAll()},
  calendarDay(date){ui.renderCalendarDay(date,state,core)},
  calendarEdit(date){ui.closeDialog('planDialog');ui.renderHours(date,state,core);resetPeriodForm();ui.showDialog('hoursDialog')},
  editPeriod(id){const p=state.periods.find(x=>x.id===id);if(p)ui.setPeriodForm(p)},
  cancelPeriodEdit:resetPeriodForm,
  async savePeriod(p){const valid=core.validatePeriod(p,state.periods);if(!valid.ok){ui.setInlineError('hours',valid.message);return}try{await mutate(()=>client.upsertPeriod(p));resetPeriodForm()}catch(e){ui.setInlineError('hours',e.message)}},
  async adjustPeriod(id,delta){const p=state.periods.find(x=>x.id===id);if(!p)return;const changed=core.adjustPeriodFinish(p,delta),valid=core.validatePeriod(changed,state.periods);if(!valid.ok){ui.setInlineError('hours',valid.message);return}try{await mutate(()=>client.upsertPeriod(changed))}catch(e){ui.setInlineError('hours',e.message)}},
  async deletePeriod(id){try{await mutate(()=>client.deletePeriod(id));resetPeriodForm()}catch(e){ui.setInlineError('hours',e.message)}},
  editExpense(id){const e=state.expenses.find(x=>x.id===id);if(e)ui.setExpenseForm(e,e.date)},
  cancelExpenseEdit:resetExpenseForm,
  async saveExpense(e){if(!e.description.trim()||!(e.amount>0)||!e.date){ui.setInlineError('spend','Enter a description, amount and date.');return}try{await mutate(()=>client.upsertExpense(e));resetExpenseForm()}catch(err){ui.setInlineError('spend',err.message)}},
  async deleteExpense(id){try{await mutate(()=>client.deleteExpense(id));resetExpenseForm()}catch(e){ui.setInlineError('spend',e.message)}}
});

async function connect(){
  renderAll();
  if(!creds){ui.setSyncStatus('invalid-link');ui.showError('Open the private sharing link once on this device to enable live shared data. Your existing local figures are still visible.');return}
  client=createDataClient({...CONFIG,...creds});
  ui.setSyncStatus('loading');
  try{
    let remote=await client.getState();
    if(!remote.initialized){const seed=readV1State()||defaultState();const result=await client.seedIfEmpty(seed);remote=result.state}
    state={periods:remote.periods,expenses:remote.expenses,updatedAt:remote.updatedAt};online=true;saveLocalCache(state);ui.setSyncStatus('synced');ui.showError('');renderAll();
    stopPolling=startPolling({load:()=>client.getState(),intervalMs:4000,onStatus:s=>{online=s==='synced';ui.setSyncStatus(s)},onChange:remote=>{state={periods:remote.periods,expenses:remote.expenses,updatedAt:remote.updatedAt};saveLocalCache(state);renderAll()}});
  }catch(e){online=false;ui.setSyncStatus(e.code==='invalid-link'?'invalid-link':'offline');ui.showError(e.code==='invalid-link'?'This share link is not valid.':'Could not reach shared data. Cached data is read only.');renderAll()}
}

function liveTick(){
  const now=Date.now();const snap=core.calculateSnapshot(now,state);
  const milestones=core.getMilestones(now,state);
  for(const m of milestones)if(lastEarned<m.amount&&snap.earned>=m.amount&&fx.shouldCelebrateOnce(`milestone-${m.amount}`))fx.showMilestoneCelebration(m);
  for(const p of state.periods||[]){const end=core.ukDateTimeMs(p.date,p.end);if(lastTick<end&&now>=end){const net=core.periodDurationHours(p)*core.hourlyNetRate(p.multiplier);const day=new Date(`${p.date}T12:00:00Z`).getUTCDay();if(day===0||day===6)fx.showBossDefeated(p,net);else fx.showShiftComplete(p,net)}}
  lastEarned=snap.earned;lastTick=now;renderAll(now);
}
setInterval(liveTick,1000);
window.addEventListener('online',()=>refresh());window.addEventListener('offline',()=>{online=false;ui.setSyncStatus('offline')});
window.addEventListener('beforeunload',()=>stopPolling?.());
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
connect();
