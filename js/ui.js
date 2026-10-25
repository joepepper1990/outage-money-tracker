const moneyFmt=new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2});
const dateFmt=new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
const monthFmt=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric'});
export const $=id=>document.getElementById(id);
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const formatMoney=v=>moneyFmt.format(Number(v)||0);
export const formatDate=s=>s?dateFmt.format(new Date(`${String(s).slice(0,10)}T12:00:00Z`)):'';
export const formatMonth=s=>s?monthFmt.format(new Date(`${String(s).slice(0,7)}-01T12:00:00Z`)):'';
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function showPage(name){document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===name));document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===name));const titles={pay:'Pay',work:'Work',forecast:'Forecast',settings:'Settings'};$('pageTitle').textContent=titles[name]||'Pay';window.scrollTo({top:0,behavior:'instant'})}
export function openDialog(id){const d=$(id);if(d&&!d.open)d.showModal()}
export function closeDialog(id){const d=$(id);if(d?.open)d.close()}
export function setSyncStatus(status){const el=$('syncStatus');if(!el)return;const labels={loading:'Connecting…',saving:'Saving…',synced:'Synced',offline:'Offline','invalid-link':'Link invalid'};el.textContent=labels[status]||status;el.dataset.state=status}
export function showError(message=''){const el=$('globalError');if(!el)return;el.textContent=message;el.hidden=!message}
export function inlineError(id,message=''){const el=$(id);if(!el)return;el.textContent=message;el.hidden=!message}
export function setReadOnly(readOnly){document.body.classList.toggle('read-only',!!readOnly)}
export function setConnectPanel(show){$('connectPanel').hidden=!show}
export function value(id){return $(id)?.value??''}
export function numValue(id){const v=value(id);return v===''?null:Number(v)}
export function setValue(id,value){const el=$(id);if(el)el.value=value??''}
