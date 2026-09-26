import { DEFAULT_PERIODS } from './core.js';

export const V1_KEY='outageMoneyTrackerV1';
export const CACHE_KEY='outageMoneyTrackerV2Cache';
export const ACCESS_KEY='outageMoneyTrackerV2Access';
const legacyShortFridayIds=new Map([['2026-09-18','default-12'],['2026-10-02','default-24'],['2026-10-16','default-36'],['2026-10-30','default-48']]);
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getStorage = storage => storage ?? globalThis.localStorage;
const clone = value => JSON.parse(JSON.stringify(value));

export function parseShareFragment(hash=''){
  const m=String(hash).match(/^#join=([0-9a-f-]{36})\.([A-Za-z0-9_-]{32,})$/i);
  if(!m||!uuidRe.test(m[1])) return null;
  return {trackerId:m[1],accessKey:m[2]};
}

export function parseShareLink(value=''){
  const raw=String(value).trim();
  if(!raw) return null;
  if(raw.startsWith('#')) return parseShareFragment(raw);
  try{return parseShareFragment(new URL(raw,'https://invalid.local').hash)}catch{return null}
}

export function storeShareLink(value,storage){
  const creds=parseShareLink(value);
  if(!creds)return null;
  storeShareLink(`#join=${creds.trackerId}.${creds.accessKey}`,storage);
  return creds;
}

export function loadStoredAccess(storage){
  try{
    const raw=getStorage(storage)?.getItem(ACCESS_KEY);
    if(!raw) return null;
    const x=JSON.parse(raw);
    return uuidRe.test(x.trackerId||'')&&String(x.accessKey||'').length>=32?x:null;
  }catch{return null;}
}

export function consumeShareFragment(locationLike=globalThis.location,historyLike=globalThis.history,storage){
  const creds=parseShareFragment(locationLike?.hash||'');
  if(!creds) return loadStoredAccess(storage);
  getStorage(storage)?.setItem(ACCESS_KEY,JSON.stringify(creds));
  if(historyLike?.replaceState) historyLike.replaceState(null,'',`${locationLike.pathname||''}${locationLike.search||''}`);
  return creds;
}

export function saveLocalCache(state,storage){
  try{ getStorage(storage)?.setItem(CACHE_KEY,JSON.stringify(state)); }catch{}
}
export function loadLocalCache(storage){
  try{
    const raw=getStorage(storage)?.getItem(CACHE_KEY); if(!raw) return null;
    const s=JSON.parse(raw);
    return Array.isArray(s.periods)&&Array.isArray(s.expenses)?s:null;
  }catch{return null;}
}

export function normalizeLegacyState(state){
  if(!state||!Array.isArray(state.periods)||!Array.isArray(state.expenses)) return null;
  const periods=state.periods.map(p=>{
    const out={...p,multiplier:Number(p.multiplier)};
    if(legacyShortFridayIds.get(out.date)===out.id&&out.start==='15:30'&&out.end==='19:00'&&Number(out.multiplier)===1.5) out.end='16:30';
    return out;
  });
  return {periods,expenses:state.expenses.map(e=>({...e,amount:Number(e.amount)||0}))};
}

export function readV1State(storage){
  try{
    const raw=getStorage(storage)?.getItem(V1_KEY); if(!raw) return null;
    return normalizeLegacyState(JSON.parse(raw));
  }catch{return null;}
}

export function defaultState(){ return {periods:clone(DEFAULT_PERIODS),expenses:[]}; }

export function createDataClient({projectUrl,publishableKey,trackerId,accessKey,fetchImpl=globalThis.fetch}){
  if(!projectUrl||!trackerId||!accessKey) throw new Error('Missing shared tracker configuration.');
  const url=`${String(projectUrl).replace(/\/$/,'')}/functions/v1/tracker-api`;
  async function call(action,payload={}){
    let res;
    try{
      res=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json','x-tracker-key':accessKey,apikey:publishableKey||''},body:JSON.stringify({action,trackerId,...payload})});
    }catch(err){ const e=new Error('Offline'); e.code='offline'; e.cause=err; throw e; }
    let body={}; try{body=await res.json();}catch{}
    if(!res.ok){
      const e=new Error(body.message||body.error||`Request failed (${res.status})`);
      e.code=body.error==='invalid-link'?'invalid-link':(res.status===409?'conflict':'request-failed');
      e.status=res.status; throw e;
    }
    return body;
  }
  return {
    getState:()=>call('getState'),
    async seedIfEmpty(state){ const r=await call('seedIfEmpty',{state}); return r; },
    async upsertPeriod(period){ return (await call('upsertPeriod',{period})).period; },
    async deletePeriod(id){ return call('deletePeriod',{id}); },
    async upsertExpense(expense){ return (await call('upsertExpense',{expense})).expense; },
    async deleteExpense(id){ return call('deleteExpense',{id}); },
    async rotateAccessKey(newKey){ return call('rotateAccessKey',{newKey}); }
  };
}

export function startPolling({load,intervalMs=4000,onChange=()=>{},onStatus=()=>{}}){
  let stopped=false, busy=false, last;
  const tick=async()=>{
    if(stopped||busy) return; busy=true;
    try{
      const state=await load();
      onStatus('synced');
      if(state?.updatedAt!==last){ last=state?.updatedAt; onChange(state); }
    }catch(e){ onStatus(e?.code==='invalid-link'?'invalid-link':'offline'); }
    finally{busy=false;}
  };
  tick();
  const timer=setInterval(tick,intervalMs);
  return ()=>{stopped=true;clearInterval(timer);};
}
