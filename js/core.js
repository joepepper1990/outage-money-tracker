export const BASIC_HOURLY_RATE = 37.21;
export const NET_FACTOR = 0.58;

const RAW_DEFAULT_PERIODS = [
  ['2026-09-07','15:30','19:00',1.5],['2026-09-08','15:30','16:30',1.5],
  ['2026-09-09','15:30','19:00',1.5],['2026-09-10','15:30','16:30',1.5],
  ['2026-09-11','15:30','19:00',1.5],['2026-09-12','07:00','19:00',2],
  ['2026-09-13','07:00','16:00',2],['2026-09-14','15:30','17:30',1.5],
  ['2026-09-15','15:30','16:30',1.5],['2026-09-16','15:30','19:00',1.5],
  ['2026-09-17','15:30','16:30',1.5],['2026-09-18','15:30','16:30',1.5],
  ['2026-09-21','15:30','19:00',1.5],['2026-09-22','15:30','16:30',1.5],
  ['2026-09-23','15:30','16:30',1.5],['2026-09-24','15:30','16:30',1.5],
  ['2026-09-25','15:30','19:00',1.5],['2026-09-26','07:00','19:00',2],
  ['2026-09-27','07:00','19:00',2],['2026-09-28','15:30','19:00',1.5],
  ['2026-09-29','15:30','16:30',1.5],['2026-09-30','15:30','17:30',1.5],
  ['2026-10-01','15:30','16:30',1.5],['2026-10-02','15:30','16:30',1.5],
  ['2026-10-05','15:30','19:00',1.5],['2026-10-06','15:30','16:30',1.5],
  ['2026-10-07','15:30','19:00',1.5],['2026-10-08','15:30','16:30',1.5],
  ['2026-10-09','15:30','19:00',1.5],['2026-10-10','07:00','19:00',2],
  ['2026-10-11','07:00','19:00',2],['2026-10-12','15:30','19:00',1.5],
  ['2026-10-13','15:30','16:30',1.5],['2026-10-14','15:30','19:00',1.5],
  ['2026-10-15','15:30','16:30',1.5],['2026-10-16','15:30','16:30',1.5],
  ['2026-10-19','15:30','19:00',1.5],['2026-10-20','15:30','16:30',1.5],
  ['2026-10-21','15:30','19:00',1.5],['2026-10-22','15:30','16:30',1.5],
  ['2026-10-23','15:30','19:00',1.5],['2026-10-24','07:00','19:00',2],
  ['2026-10-25','07:00','17:00',2],['2026-10-26','15:30','19:00',1.5],
  ['2026-10-27','15:30','16:30',1.5],['2026-10-28','15:30','19:00',1.5],
  ['2026-10-29','15:30','16:30',1.5],['2026-10-30','15:30','16:30',1.5],
  ['2026-11-02','15:30','19:00',1.5],['2026-11-03','15:30','16:30',1.5],
  ['2026-11-04','15:30','19:00',1.5],['2026-11-05','15:30','16:30',1.5],
  ['2026-11-06','15:30','19:00',1.5],['2026-11-07','07:00','19:00',2],
  ['2026-11-08','07:00','19:00',2]
];

export const DEFAULT_PERIODS = RAW_DEFAULT_PERIODS.map((p,i)=>({
  id:`default-${i+1}`, date:p[0], start:p[1], end:p[2], multiplier:p[3]
}));

export const hourlyNetRate = multiplier => Number((BASIC_HOURLY_RATE * Number(multiplier) * NET_FACTOR).toFixed(10));

export function defaultMultiplierForDate(dateStr){
  const day=new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return day===0||day===6?2:1.5;
}

export function ukDateTimeMs(dateStr,timeStr){
  const [y,m,d]=dateStr.split('-').map(Number);
  const [hh,mm]=timeStr.split(':').map(Number);
  const targetUtc=Date.UTC(y,m-1,d,hh,mm,0,0);
  let guess=targetUtc;
  const fmt=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  });
  for(let i=0;i<4;i++){
    const parts=Object.fromEntries(fmt.formatToParts(new Date(guess)).map(p=>[p.type,p.value]));
    const represented=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);
    const next=targetUtc-(represented-guess);
    if(next===guess) break;
    guess=next;
  }
  return guess;
}

export function periodDurationHours(period){
  const start=ukDateTimeMs(period.date,period.start);
  const end=ukDateTimeMs(period.date,period.end);
  return Math.max(0,(end-start)/3600000);
}

export function earnedForPeriod(period,nowMs){
  const start=ukDateTimeMs(period.date,period.start);
  const end=ukDateTimeMs(period.date,period.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||nowMs<=start) return 0;
  const elapsed=Math.min(nowMs,end)-start;
  return elapsed/3600000*hourlyNetRate(period.multiplier);
}

const expensesTotal = state => (state?.expenses||[]).reduce((s,e)=>s+(Number(e.amount)||0),0);
const sortedPeriods = state => [...(state?.periods||[])].sort((a,b)=>ukDateTimeMs(a.date,a.start)-ukDateTimeMs(b.date,b.start));

export function calculateSnapshot(nowMs,state){
  let earned=0, activePeriodId=null;
  for(const p of state?.periods||[]){
    earned+=earnedForPeriod(p,nowMs);
    const s=ukDateTimeMs(p.date,p.start), e=ukDateTimeMs(p.date,p.end);
    if(nowMs>=s&&nowMs<e) activePeriodId=p.id;
  }
  const spent=expensesTotal(state);
  return {earned,spent,totalNet:earned-spent,active:activePeriodId!==null,activePeriodId};
}

export function calculateProjectedTotalEarnings(state){
  return (state?.periods||[]).reduce((s,p)=>s+periodDurationHours(p)*hourlyNetRate(p.multiplier),0);
}

export function calculateProjectedBalance(date,state){
  const earned=(state?.periods||[]).filter(p=>p.date<=date)
    .reduce((s,p)=>s+periodDurationHours(p)*hourlyNetRate(p.multiplier),0);
  return earned-expensesTotal(state);
}

export function calculateRemainingEarnings(nowMs,state){
  return Math.max(0,calculateProjectedTotalEarnings(state)-calculateSnapshot(nowMs,state).earned);
}

export function calculateEndBalance(state){
  return calculateProjectedTotalEarnings(state)-expensesTotal(state);
}

export function calculateCompletion(nowMs,state){
  const total=calculateProjectedTotalEarnings(state);
  if(total<=0) return 0;
  return Math.max(0,Math.min(1,calculateSnapshot(nowMs,state).earned/total));
}

export function deriveEndMs(periods){
  if(!periods?.length) return null;
  return Math.max(...periods.map(p=>ukDateTimeMs(p.date,p.end)));
}

function dateAtThreshold(periods,amount){
  let sum=0;
  for(const p of [...periods].sort((a,b)=>ukDateTimeMs(a.date,a.start)-ukDateTimeMs(b.date,b.start))){
    sum += periodDurationHours(p)*hourlyNetRate(p.multiplier);
    if(sum+1e-9>=amount) return p.date;
  }
  return null;
}

export function getMilestones(nowMs,state,step=1000){
  const total=calculateProjectedTotalEarnings(state);
  const earned=calculateSnapshot(nowMs,state).earned;
  const max=Math.floor(total/step)*step;
  const result=[];
  for(let amount=step;amount<=max;amount+=step){
    const date=dateAtThreshold(state?.periods||[],amount);
    result.push({amount,status:earned+1e-9>=amount?'achieved':'projected',date});
  }
  return result;
}

const dayOfWeek = date => new Date(`${date}T12:00:00Z`).getUTCDay();

export function getAchievements(nowMs,state){
  const periods=sortedPeriods(state);
  const completed=periods.filter(p=>nowMs>=ukDateTimeMs(p.date,p.end));
  const hours=completed.reduce((s,p)=>s+periodDurationHours(p),0);
  const doubleHours=completed.filter(p=>Number(p.multiplier)===2).reduce((s,p)=>s+periodDurationHours(p),0);
  const earned=calculateSnapshot(nowMs,{periods,expenses:[]}).earned;
  const completedDates=new Set(completed.map(p=>p.date));
  const weekendWarrior=completed.some(p=>dayOfWeek(p.date)===6 && completedDates.has(new Date(Date.UTC(...p.date.split('-').map((n,i)=>i===1?Number(n)-1:Number(n)))+86400000).toISOString().slice(0,10)));
  const end=deriveEndMs(periods);
  const defs=[
    ['professional-clock-watcher','Professional Clock Watcher',completed.length>=10],
    ['sold-my-saturday','Sold My Saturday',completed.some(p=>dayOfWeek(p.date)===6)],
    ['sunday-service','Sunday Service',completed.some(p=>dayOfWeek(p.date)===0)],
    ['weekend-warrior','Weekend Warrior',weekendWarrior],
    ['double-time-demon','Double-Time Demon',doubleHours>=50],
    ['5k-gremlin','£5K Gremlin',earned>=5000],
    ['i-live-here-now','I Live Here Now',hours>=100],
    ['human-overtime-machine','Human Overtime Machine',hours>=150],
    ['outage-survivor','Outage Survivor',end!==null&&nowMs>=end]
  ];
  return defs.map(([id,name,unlocked])=>({id,name,unlocked}));
}

const LEVELS=[
  [0,'Clock Watcher'],[1000,'Overtime Apprentice'],[2000,'Shift Goblin'],[3000,'Weekend Merchant'],
  [4000,'Double-Time Disciple'],[5000,'£5K Gremlin'],[6000,'Overtime Menace'],[7000,'Financial Hazard'],
  [8000,'Human Overtime Machine']
];
export function getOutageLevel(nowMs,state){
  const end=deriveEndMs(state?.periods||[]);
  if(end!==null&&nowMs>=end) return {threshold:calculateProjectedTotalEarnings(state),name:'Outage Warlord',final:true};
  const earned=calculateSnapshot(nowMs,{periods:state?.periods||[],expenses:[]}).earned;
  let chosen=LEVELS[0];
  for(const level of LEVELS) if(earned+1e-9>=level[0]) chosen=level;
  return {threshold:chosen[0],name:chosen[1],final:false};
}

export function countdownMessage(nowMs,endMs){
  if(endMs===null) return 'No overtime scheduled';
  if(nowMs>=endMs) return 'OUTAGE COMPLETE — YOU SURVIVED.';
  const days=Math.ceil((endMs-nowMs)/86400000);
  if(days<=1) return 'LAST ONE.';
  if(days<=2) return 'Nearly human again.';
  if(days<=7) return `${days} days. DO NOT ACCEPT MORE OT.`;
  if(days<=14) return `${days} days. You vaguely remember weekends.`;
  if(days<=30) return `${days} days. Excellent life choices.`;
  return `${days} days to freedom`;
}

function minutesFromTime(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
function timeFromMinutes(n){ n=Math.max(0,Math.min(23*60+59,n)); return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }
export function adjustPeriodFinish(period,deltaMinutes){
  return {...period,end:timeFromMinutes(minutesFromTime(period.end)+Number(deltaMinutes||0))};
}

export function validatePeriod(candidate,periods=[]){
  if(!candidate?.date||!/^\d{2}:\d{2}$/.test(candidate.start||'')||!/^\d{2}:\d{2}$/.test(candidate.end||'')) return {ok:false,message:'Enter a date, start time and finish time.'};
  if(![1.5,2].includes(Number(candidate.multiplier))) return {ok:false,message:'Choose a valid overtime rate.'};
  if(candidate.end<=candidate.start) return {ok:false,message:'Finish time must be after start time.'};
  const overlap=periods.some(p=>p.id!==candidate.id&&p.date===candidate.date&&candidate.start<p.end&&candidate.end>p.start);
  if(overlap) return {ok:false,message:'This overlaps another overtime period on the same date.'};
  return {ok:true,message:''};
}
