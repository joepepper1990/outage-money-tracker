import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASIC_HOURLY_RATE, NET_FACTOR, DEFAULT_PERIODS, hourlyNetRate, ukDateTimeMs,
  periodDurationHours, earnedForPeriod, calculateSnapshot, calculateProjectedBalance,
  calculateRemainingEarnings, calculateProjectedTotalEarnings, calculateEndBalance,
  calculateCompletion, deriveEndMs, getMilestones, getAchievements, getOutageLevel,
  countdownMessage, adjustPeriodFinish, validatePeriod
} from '../js/core.js';

const close = (a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps, `${a} != ${b}`);

test('pay constants and net rates are exact', () => {
  assert.equal(BASIC_HOURLY_RATE, 37.21);
  assert.equal(NET_FACTOR, 0.58);
  assert.equal(hourlyNetRate(1.5), 32.3727);
  assert.equal(hourlyNetRate(2), 43.1636);
});

test('corrected default schedule totals 212 hours and £8103.9659', () => {
  const hours = DEFAULT_PERIODS.reduce((s,p)=>s+periodDurationHours(p),0);
  close(hours, 212);
  close(calculateProjectedTotalEarnings({periods:DEFAULT_PERIODS,expenses:[]}), 8103.9659);
  const shortDates = ['2026-09-18','2026-10-02','2026-10-16','2026-10-30'];
  for (const date of shortDates) assert.equal(DEFAULT_PERIODS.find(p=>p.date===date)?.end, '16:30');
});

test('half-complete 12-hour 2x shift earns exactly half final net', () => {
  const p={id:'x',date:'2026-09-26',start:'07:00',end:'19:00',multiplier:2};
  const noon=ukDateTimeMs('2026-09-26','13:00');
  close(earnedForPeriod(p,noon), 6*43.1636);
});

test('future-dated expense subtracts immediately from current balance', () => {
  const p={id:'x',date:'2026-09-26',start:'07:00',end:'19:00',multiplier:2};
  const now=ukDateTimeMs('2026-09-26','13:00');
  const snap=calculateSnapshot(now,{periods:[p],expenses:[{id:'e',description:'Holiday',amount:200,date:'2026-12-01'}]});
  close(snap.totalNet, 6*43.1636-200);
});

test('future balance truncates overtime at selected day end and subtracts all spend', () => {
  const periods=[
    {id:'a',date:'2026-09-26',start:'07:00',end:'19:00',multiplier:2},
    {id:'b',date:'2026-09-27',start:'07:00',end:'19:00',multiplier:2},
  ];
  const state={periods,expenses:[{id:'e',description:'x',amount:100,date:'2026-10-01'}]};
  close(calculateProjectedBalance('2026-09-26',state),12*43.1636-100);
});

test('remaining earnings counts only unearned planned overtime', () => {
  const periods=[
    {id:'a',date:'2026-09-26',start:'07:00',end:'19:00',multiplier:2},
    {id:'b',date:'2026-09-27',start:'07:00',end:'19:00',multiplier:2},
  ];
  const now=ukDateTimeMs('2026-09-26','13:00');
  close(calculateRemainingEarnings(now,{periods,expenses:[]}),18*43.1636);
});

test('end balance is projected earnings minus all expenses', () => {
  const state={periods:[{id:'a',date:'2026-09-26',start:'07:00',end:'19:00',multiplier:2}],expenses:[{id:'e',description:'x',amount:100,date:'2027-01-01'}]};
  close(calculateEndBalance(state),12*43.1636-100);
});

test('completion is earnings progress and ignores expenses', () => {
  const periods=[{id:'a',date:'2026-09-26',start:'07:00',end:'19:00',multiplier:2}];
  const now=ukDateTimeMs('2026-09-26','13:00');
  close(calculateCompletion(now,{periods,expenses:[]}),0.5);
  close(calculateCompletion(now,{periods,expenses:[{id:'e',amount:999,date:'2026-09-26'}]}),0.5);
});

test('period validation rejects overlap but accepts adjacency', () => {
  const periods=[{id:'a',date:'2026-09-26',start:'07:00',end:'12:00',multiplier:2}];
  assert.equal(validatePeriod({id:'b',date:'2026-09-26',start:'11:59',end:'13:00',multiplier:2},periods).ok,false);
  assert.equal(validatePeriod({id:'b',date:'2026-09-26',start:'12:00',end:'13:00',multiplier:2},periods).ok,true);
});

test('quick adjustment changes finish time only', () => {
  const p={id:'a',date:'2026-09-26',start:'07:00',end:'19:00',multiplier:2};
  assert.deepEqual(adjustPeriodFinish(p,30),{...p,end:'19:30'});
  assert.deepEqual(adjustPeriodFinish(p,-60),{...p,end:'18:00'});
});

test('milestones distinguish achieved and projected dates', () => {
  const periods=[
    {id:'a',date:'2026-09-01',start:'07:00',end:'19:00',multiplier:2},
    {id:'b',date:'2026-09-02',start:'07:00',end:'19:00',multiplier:2},
    {id:'c',date:'2026-09-03',start:'07:00',end:'19:00',multiplier:2},
  ];
  const now=ukDateTimeMs('2026-09-02','19:00');
  const ms=getMilestones(now,{periods,expenses:[]},500);
  assert.equal(ms.find(m=>m.amount===500).status,'achieved');
  assert.equal(ms.find(m=>m.amount===500).date,'2026-09-01');
  assert.equal(ms.find(m=>m.amount===1000).status,'achieved');
  assert.equal(ms.find(m=>m.amount===1500).status,'projected');
  assert.equal(ms.find(m=>m.amount===1500).date,'2026-09-03');
});

test('levels and achievements unlock at exact thresholds', () => {
  const hundredHours={id:'a',date:'2026-01-01',start:'00:00',end:'23:59',multiplier:2};
  const periods=Array.from({length:10},(_,i)=>({id:String(i),date:`2026-01-${String(i+1).padStart(2,'0')}`,start:'08:00',end:'18:00',multiplier:2}));
  const now=ukDateTimeMs('2026-02-01','00:00');
  const ach=getAchievements(now,{periods,expenses:[]});
  assert.equal(ach.find(a=>a.id==='professional-clock-watcher').unlocked,true);
  assert.equal(ach.find(a=>a.id==='double-time-demon').unlocked,true);
  assert.equal(ach.find(a=>a.id==='i-live-here-now').unlocked,true);
  const afterOutage=ukDateTimeMs('2026-12-01','00:00');
  const level=getOutageLevel(afterOutage,{periods:DEFAULT_PERIODS,expenses:[]});
  assert.equal(level.name,'Outage Warlord');
  assert.equal(hundredHours.id,'a');
});

test('end timestamp comes from final scheduled period and countdown finishes cleanly', () => {
  const periods=[
    {id:'a',date:'2026-09-26',start:'07:00',end:'19:00',multiplier:2},
    {id:'b',date:'2026-09-27',start:'07:00',end:'17:00',multiplier:2},
  ];
  assert.equal(deriveEndMs(periods),ukDateTimeMs('2026-09-27','17:00'));
  assert.equal(countdownMessage(ukDateTimeMs('2026-09-27','17:01'),deriveEndMs(periods)),'OUTAGE COMPLETE — YOU SURVIVED.');
});

test('Europe/London conversion handles BST and GMT independent of device timezone', () => {
  assert.equal(new Date(ukDateTimeMs('2026-09-26','12:00')).toISOString(),'2026-09-26T11:00:00.000Z');
  assert.equal(new Date(ukDateTimeMs('2026-11-08','12:00')).toISOString(),'2026-11-08T12:00:00.000Z');
});


test('£5K Gremlin unlocks immediately while the threshold is crossed in an active shift',()=>{
  const periods=[];
  for(let i=1;i<=9;i++) periods.push({id:`d${i}`,date:`2026-01-${String(i).padStart(2,'0')}`,start:'07:00',end:'19:00',multiplier:2});
  periods.push({id:'active',date:'2026-01-10',start:'07:00',end:'19:00',multiplier:2});
  const now=ukDateTimeMs('2026-01-10','18:59');
  const achievement=getAchievements(now,{periods,expenses:[]}).find(a=>a.id==='5k-gremlin');
  assert.equal(achievement.unlocked,true);
});


test('new overtime defaults to 2x on weekends and 1.5x on weekdays',async()=>{
  const mod=await import('../js/core.js');
  assert.equal(mod.defaultMultiplierForDate('2026-09-26'),2);
  assert.equal(mod.defaultMultiplierForDate('2026-09-25'),1.5);
});
