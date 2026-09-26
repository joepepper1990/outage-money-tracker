const $=id=>document.getElementById(id);
const money=new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2});
const shortMoney=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(v);
const dateFmt=new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short'});
const monthFmt=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric'});
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function dateObj(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
export const formatMoney=v=>money.format(Number(v)||0);
export const ukToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export function renderHome({snapshot,completion,countdown}){
  $('total').textContent=formatMoney(snapshot.totalNet); $('total').classList.toggle('negative',snapshot.totalNet<0);
  $('earningStatus').textContent=snapshot.active?'EARNING NOW':'NOT EARNING'; $('earningStatus').classList.toggle('active',snapshot.active);
  const pct=Math.round(completion*100); $('progressText').textContent=`${pct}% complete`; $('completionRing').style.setProperty('--progress',`${completion*360}deg`);
  $('countdown').textContent=countdown;
}
export function setSyncStatus(status){
  const map={loading:'● Connecting…',saving:'↻ Saving…',synced:'✓ Synced',offline:'! Offline — read only','invalid-link':'! Link no longer valid'};
  $('syncStatus').dataset.state=status; $('syncStatus').textContent=map[status]||status;
  document.body.classList.toggle('read-only',status==='offline'||status==='invalid-link');
}
export function showError(message=''){$('globalError').hidden=!message;$('globalError').textContent=message;}
export function renderHours(date,state,core){
  $('hoursDate').value=date;
  const rows=(state.periods||[]).filter(p=>p.date===date).sort((a,b)=>a.start.localeCompare(b.start));
  $('hoursList').innerHTML=rows.length?rows.map(p=>{
    const net=core.periodDurationHours(p)*core.hourlyNetRate(p.multiplier);
    return `<article class="row-card" data-period-id="${esc(p.id)}"><div class="row-top"><div><div class="row-title">${esc(p.start)} → ${esc(p.end)} · ${p.multiplier}×</div><div class="row-sub">${core.periodDurationHours(p).toFixed(1)} hours</div></div><div class="row-value">${formatMoney(net)}</div></div><div class="quick-grid"><button data-delta="-30">−30m</button><button data-delta="30">+30m</button><button data-delta="-60">−1h</button><button data-delta="60">+1h</button></div><div class="mini-actions"><button data-edit-period="${esc(p.id)}">Edit precisely</button><button class="danger" data-delete-period="${esc(p.id)}">Cancel OT</button></div></article>`;
  }).join(''):'<div class="row-card"><div class="row-sub">No overtime on this date.</div></div>';
}
export function renderSpend(state){
  const list=[...(state.expenses||[])].sort((a,b)=>b.date.localeCompare(a.date));
  $('spendList').innerHTML=list.length?list.map(e=>`<article class="row-card"><div class="row-top"><div><div class="row-title">${esc(e.description)}</div><div class="row-sub">${esc(dateFmt.format(dateObj(e.date)))}</div></div><div class="row-value">−${formatMoney(e.amount)}</div></div><div class="mini-actions"><button data-edit-expense="${esc(e.id)}">Edit</button><button class="danger" data-delete-expense="${esc(e.id)}">Delete</button></div></article>`).join(''):'<div class="row-card"><div class="row-sub">No spending added yet.</div></div>';
}
export function renderForecast(model){
  $('futureDate').value=model.date;
  $('forecastCards').innerHTML=[
    ['Future balance',model.futureBalance,'wide'],['Earned so far',model.earned,''],['Remaining OT',model.remaining,''],['Projected OT total',model.projectedTotal,''],['Spending',model.spent,''],['End-of-outage result',model.endBalance,'wide']
  ].map(([label,value,wide])=>`<div class="metric ${wide}"><div class="metric-label">${label}</div><div class="metric-value">${formatMoney(value)}</div></div>`).join('');
}
function isoDate(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
export function renderCalendar({year,month,state,nowMs,core}){
  $('calendarTitle').textContent=monthFmt.format(new Date(year,month,1,12));
  const first=new Date(year,month,1,12); const mondayIndex=(first.getDay()+6)%7; const days=new Date(year,month+1,0).getDate();
  const today=ukToday(); let html='';
  for(let i=0;i<mondayIndex;i++) html+='<button class="calendar-day empty" disabled></button>';
  for(let d=1;d<=days;d++){
    const date=isoDate(year,month,d), ps=(state.periods||[]).filter(p=>p.date===date);
    const starts=ps.map(p=>core.ukDateTimeMs(p.date,p.start)), ends=ps.map(p=>core.ukDateTimeMs(p.date,p.end));
    let status='empty'; if(ps.length){ if(starts.some((s,i)=>nowMs>=s&&nowMs<ends[i]))status='active'; else if(ends.every(e=>nowMs>=e))status='completed'; else status='future'; }
    const isDouble=ps.some(p=>Number(p.multiplier)===2), value=ps.reduce((s,p)=>s+core.periodDurationHours(p)*core.hourlyNetRate(p.multiplier),0);
    const classes=['calendar-day',status,date===today?'today':'',isDouble?'double-time':''].filter(Boolean).join(' ');
    html+=`<button class="${classes}" data-date="${date}"><strong>${d}</strong>${value?`<span class="day-money">${shortMoney(value)}</span>`:''}</button>`;
  }
  $('calendarGrid').innerHTML=html;
}
export function renderCalendarDay(date,state,core){
  const ps=(state.periods||[]).filter(p=>p.date===date);
  if(!ps.length){$('calendarDayDetail').innerHTML=`<strong>${esc(dateFmt.format(dateObj(date)))}</strong><div>No overtime planned.</div>`;return;}
  const net=ps.reduce((s,p)=>s+core.periodDurationHours(p)*core.hourlyNetRate(p.multiplier),0);
  $('calendarDayDetail').innerHTML=`<strong>${esc(dateFmt.format(dateObj(date)))}</strong><div>${ps.map(p=>`${esc(p.start)}–${esc(p.end)} (${p.multiplier}×)`).join('<br>')}</div><div class="row-value" style="margin-top:7px">${formatMoney(net)}</div><button class="secondary" type="button" data-calendar-edit="${esc(date)}">Edit this day's hours</button>`;
}
export function renderFun({milestones,achievements,level,comparison,boss}){
  $('levelCard').innerHTML=`<h3>Outage level</h3><div class="metric-value">${esc(level.name)}</div>`;
  $('milestoneList').innerHTML=milestones.length?milestones.map(m=>`<div class="milestone-row"><span class="${m.status}">${m.status==='achieved'?'✓':'○'} ${formatMoney(m.amount)}</span><span>${esc(m.date||'—')}</span></div>`).join(''):'<div class="row-sub">No milestone falls inside the current plan.</div>';
  const icons=['⏱','🪦','☀','⚔','⚡','👹','🏠','🤖','🏁'];
  $('achievementGrid').innerHTML=achievements.map((a,i)=>`<div class="badge ${a.unlocked?'':'locked'}"><div class="badge-icon">${icons[i]||'★'}</div><div class="badge-name">${esc(a.name)}</div></div>`).join('');
  $('comparisonCard').innerHTML=`<h3>Things you could have bought</h3><div class="row-sub">${esc(comparison)}</div>`;
  $('bossCard').innerHTML=boss?`<div class="boss-card"><h3>${esc(boss.title)}</h3><div class="boss-bar"><span style="width:${boss.progress*100}%"></span></div><div class="row-top" style="margin-top:12px"><div><div class="row-title">${esc(boss.remainingLabel)} remaining</div><div class="row-sub">Boss HP: ${boss.hp.toLocaleString()} seconds</div></div><div class="row-value">${formatMoney(boss.earned)}</div></div></div>`:'';
}
export function bindUI(actions){
  document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>actions.open(b.dataset.open)));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>actions.close(b.dataset.close)));
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>actions.tab(b.dataset.tab,b)));
  $('hoursDate').addEventListener('change',e=>actions.hoursDate(e.target.value));
  $('futureDate').addEventListener('change',e=>actions.futureDate(e.target.value));
  $('prevMonth').addEventListener('click',()=>actions.month(-1)); $('nextMonth').addEventListener('click',()=>actions.month(1));
  $('calendarGrid').addEventListener('click',e=>{const b=e.target.closest('[data-date]');if(b)actions.calendarDay(b.dataset.date)}); $('calendarDayDetail').addEventListener('click',e=>{const b=e.target.closest('[data-calendar-edit]');if(b)actions.calendarEdit(b.dataset.calendarEdit)});
  $('hoursList').addEventListener('click',e=>{
    const d=e.target.closest('[data-delta]'); if(d)return actions.adjustPeriod(e.target.closest('[data-period-id]').dataset.periodId,Number(d.dataset.delta));
    const edit=e.target.closest('[data-edit-period]'); if(edit)return actions.editPeriod(edit.dataset.editPeriod);
    const del=e.target.closest('[data-delete-period]'); if(del)return actions.deletePeriod(del.dataset.deletePeriod);
  });
  $('spendList').addEventListener('click',e=>{const edit=e.target.closest('[data-edit-expense]');if(edit)return actions.editExpense(edit.dataset.editExpense);const del=e.target.closest('[data-delete-expense]');if(del)return actions.deleteExpense(del.dataset.deleteExpense)});
  $('hoursForm').addEventListener('submit',e=>{e.preventDefault();actions.savePeriod({id:$('periodId').value||undefined,date:$('hoursDate').value,start:$('periodStart').value,end:$('periodEnd').value,multiplier:Number($('periodMultiplier').value)})});
  $('spendForm').addEventListener('submit',e=>{e.preventDefault();actions.saveExpense({id:$('expenseId').value||undefined,description:$('expenseDescription').value,amount:Number($('expenseAmount').value),date:$('expenseDate').value})});
  $('cancelHoursEdit').addEventListener('click',()=>actions.cancelPeriodEdit()); $('cancelSpendEdit').addEventListener('click',()=>actions.cancelExpenseEdit());
}
export function setPeriodForm(p){$('periodId').value=p?.id||'';$('periodStart').value=p?.start||'15:30';$('periodEnd').value=p?.end||'16:30';$('periodMultiplier').value=String(p?.multiplier||1.5);$('cancelHoursEdit').hidden=!p}
export function setExpenseForm(e,date){$('expenseId').value=e?.id||'';$('expenseDescription').value=e?.description||'';$('expenseAmount').value=e?.amount||'';$('expenseDate').value=e?.date||date;$('cancelSpendEdit').hidden=!e}
export function setInlineError(kind,message=''){const el=$(kind==='hours'?'hoursError':'spendError');el.hidden=!message;el.textContent=message}
export function showDialog(id){const d=$(id);if(!d.open)d.showModal()}
export function closeDialog(id){const d=$(id);if(d.open)d.close()}
export function selectTab(panelId,button){document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===panelId));document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===button))}
