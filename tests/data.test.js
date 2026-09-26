import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseShareFragment, consumeShareFragment, readV1State, normalizeLegacyState,
  createDataClient, startPolling
} from '../js/data.js';

class MemStorage {
  constructor(seed={}){ this.m=new Map(Object.entries(seed)); }
  getItem(k){ return this.m.has(k)?this.m.get(k):null; }
  setItem(k,v){ this.m.set(k,String(v)); }
  removeItem(k){ this.m.delete(k); }
}

test('share fragment parses tracker id and secret',()=>{
  const r=parseShareFragment('#join=8b65a4d8-2b84-49b8-bb6d-73f1cf2dc504.abcdefghijklmnopqrstuvwxyzABCDEFGH123456');
  assert.equal(r.trackerId,'8b65a4d8-2b84-49b8-bb6d-73f1cf2dc504');
  assert.equal(r.accessKey,'abcdefghijklmnopqrstuvwxyzABCDEFGH123456');
});

test('share fragment is stored and removed from visible url',()=>{
  const storage=new MemStorage();
  let replaced='';
  const locationLike={hash:'#join=8b65a4d8-2b84-49b8-bb6d-73f1cf2dc504.abcdefghijklmnopqrstuvwxyzABCDEFGH123456',pathname:'/outage-money-tracker/',search:'?x=1'};
  const historyLike={replaceState(_a,_b,url){replaced=url;}};
  const creds=consumeShareFragment(locationLike,historyLike,storage);
  assert.equal(creds.trackerId,'8b65a4d8-2b84-49b8-bb6d-73f1cf2dc504');
  assert.equal(replaced,'/outage-money-tracker/?x=1');
  assert.ok(storage.getItem('outageMoneyTrackerV2Access').includes('abcdefghijklmnopqrstuvwxyz'));
});

test('malformed v1 localStorage returns null',()=>{
  const storage=new MemStorage({outageMoneyTrackerV1:'{nope'});
  assert.equal(readV1State(storage),null);
});

test('legacy long versions of known short Fridays are corrected without altering custom Friday',()=>{
  const state={periods:[
    {id:'a',date:'2026-09-18',start:'15:30',end:'19:00',multiplier:1.5},
    {id:'b',date:'2026-10-02',start:'15:30',end:'18:00',multiplier:1.5}
  ],expenses:[]};
  const n=normalizeLegacyState(state);
  assert.equal(n.periods[0].end,'16:30');
  assert.equal(n.periods[1].end,'18:00');
});

test('data client sends only one-record mutations to tracker api and maps invalid link',async()=>{
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init,body:JSON.parse(init.body)});
    if(calls.length===1) return new Response(JSON.stringify({period:{id:'1'}}),{status:200,headers:{'Content-Type':'application/json'}});
    return new Response(JSON.stringify({error:'invalid-link'}),{status:403,headers:{'Content-Type':'application/json'}});
  };
  const c=createDataClient({projectUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test',trackerId:'8b65a4d8-2b84-49b8-bb6d-73f1cf2dc504',accessKey:'abcdefghijklmnopqrstuvwxyzABCDEFGH123456',fetchImpl});
  await c.upsertPeriod({id:'x',date:'2026-09-26',start:'07:00',end:'19:00',multiplier:2});
  assert.equal(calls[0].body.action,'upsertPeriod');
  assert.equal(calls[0].body.period.date,'2026-09-26');
  assert.equal(calls[0].init.headers['x-tracker-key'],'abcdefghijklmnopqrstuvwxyzABCDEFGH123456');
  assert.equal(calls[0].init.headers.apikey,'sb_publishable_test');
  await assert.rejects(()=>c.getState(),e=>e.code==='invalid-link');
});

test('independent writes do not send or replace full tracker state',async()=>{
  const actions=[];
  const fetchImpl=async(_url,init)=>{
    const body=JSON.parse(init.body); actions.push(body);
    return new Response(JSON.stringify(body.action==='upsertExpense'?{expense:{...body.expense,id:'e1'}}:{period:{...body.period,id:'p1'}}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const c=createDataClient({projectUrl:'https://example.supabase.co',publishableKey:'pub',trackerId:'8b65a4d8-2b84-49b8-bb6d-73f1cf2dc504',accessKey:'abcdefghijklmnopqrstuvwxyzABCDEFGH123456',fetchImpl});
  await c.upsertPeriod({date:'2026-09-26',start:'07:00',end:'19:00',multiplier:2});
  await c.upsertExpense({description:'Holiday',amount:100,date:'2026-10-01'});
  assert.deepEqual(actions.map(x=>Object.keys(x).sort()),[
    ['action','period','trackerId'],['action','expense','trackerId']
  ]);
});

test('polling emits only when updatedAt changes',async()=>{
  let n=0; const seen=[];
  const stop=startPolling({
    load:async()=>({updatedAt:++n<3?'a':'b'}),
    intervalMs:10,
    onChange:s=>seen.push(s.updatedAt),
    onStatus:()=>{}
  });
  await new Promise(r=>setTimeout(r,42));
  stop();
  assert.deepEqual(seen,['a','b']);
});


test('legacy migration does not rewrite a user-custom 19:00 Friday period',()=>{
  const state={periods:[
    {id:'custom-shift',date:'2026-09-18',start:'15:30',end:'19:00',multiplier:1.5}
  ],expenses:[]};
  const n=normalizeLegacyState(state);
  assert.equal(n.periods[0].end,'19:00');
});
