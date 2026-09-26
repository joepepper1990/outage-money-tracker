const allowedOrigins = new Set([
  'https://joepepper1990.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
]);

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function secretKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (modern) {
    try { const parsed = JSON.parse(modern); if (parsed.default) return parsed.default; } catch {}
  }
  return '';
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = secretKey();

async function db(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('apikey', SERVICE_KEY);
  headers.set('Authorization', `Bearer ${SERVICE_KEY}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const err = new Error(typeof data === 'object' && data?.message ? data.message : `Database request failed (${res.status})`);
    (err as any).status = res.status;
    (err as any).code = data?.code;
    throw err;
  }
  return data;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorize(trackerId: string, accessKey: string) {
  if (!uuidRe.test(trackerId) || accessKey.length < 32) return null;
  const rows = await db(`trackers?id=eq.${encodeURIComponent(trackerId)}&select=id,access_key_hash,updated_at,initialized_at`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  const supplied = await sha256Hex(accessKey);
  return constantTimeEqual(supplied, row.access_key_hash) ? row : null;
}

function cleanTime(value: string) { return String(value || '').slice(0, 5); }
function periodOut(r: any) {
  return { id:r.id, date:r.work_date, start:cleanTime(r.start_time), end:cleanTime(r.end_time), multiplier:Number(r.multiplier) };
}
function expenseOut(r: any) {
  return { id:r.id, description:r.description, amount:Number(r.amount), date:r.expense_date };
}

async function getState(trackerId: string, trackerRow?: any) {
  const [periods, expenses] = await Promise.all([
    db(`overtime_periods?tracker_id=eq.${trackerId}&select=id,work_date,start_time,end_time,multiplier,updated_at&order=work_date.asc,start_time.asc`),
    db(`expenses?tracker_id=eq.${trackerId}&select=id,description,amount,expense_date,updated_at&order=expense_date.asc,created_at.asc`)
  ]);
  const stamps = [trackerRow?.updated_at, ...periods.map((r:any)=>r.updated_at), ...expenses.map((r:any)=>r.updated_at)].filter(Boolean);
  const updatedAt = stamps.sort().at(-1) || new Date(0).toISOString();
  return { periods:periods.map(periodOut), expenses:expenses.map(expenseOut), updatedAt, initialized:!!trackerRow?.initialized_at };
}

function validatePeriod(p: any) {
  if (!p || !dateRe.test(p.date) || !timeRe.test(p.start) || !timeRe.test(p.end) || p.end <= p.start) throw Object.assign(new Error('Enter a valid date, start and finish time.'), { status:400 });
  if (![1.5, 2].includes(Number(p.multiplier))) throw Object.assign(new Error('Choose a valid overtime rate.'), { status:400 });
}

function validateExpense(e: any) {
  if (!e || !dateRe.test(e.date) || !String(e.description || '').trim() || String(e.description).trim().length > 160 || !(Number(e.amount) > 0)) throw Object.assign(new Error('Enter a valid description, amount and date.'), { status:400 });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error:'method-not-allowed' }, 405);
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return json(req, { error:'server-not-configured' }, 500);
    const body = await req.json();
    const trackerId = String(body?.trackerId || '');
    const accessKey = req.headers.get('x-tracker-key') || '';
    const tracker = await authorize(trackerId, accessKey);
    if (!tracker) return json(req, { error:'invalid-link', message:'This share link is not valid.' }, 403);

    switch (body.action) {
      case 'getState': return json(req, await getState(trackerId, tracker));
      case 'seedIfEmpty': {
        const state = body.state || {};
        const seeded = await db('rpc/tracker_seed_internal', {
          method:'POST', body:JSON.stringify({ p_tracker_id:trackerId, p_periods:state.periods || [], p_expenses:state.expenses || [] })
        });
        const freshTracker = (await db(`trackers?id=eq.${trackerId}&select=id,updated_at,initialized_at`))[0];
        return json(req, { seeded:!!seeded, state:await getState(trackerId, freshTracker) });
      }
      case 'upsertPeriod': {
        validatePeriod(body.period);
        const id = uuidRe.test(body.period.id || '') ? body.period.id : crypto.randomUUID();
        const existing = await db(`overtime_periods?id=eq.${id}&select=tracker_id`);
        if (existing[0] && existing[0].tracker_id !== trackerId) return json(req, { error:'not-found' }, 404);
        const rows = await db('overtime_periods?on_conflict=id', {
          method:'POST',
          headers:{ Prefer:'resolution=merge-duplicates,return=representation' },
          body:JSON.stringify({ id, tracker_id:trackerId, work_date:body.period.date, start_time:body.period.start, end_time:body.period.end, multiplier:Number(body.period.multiplier) })
        });
        return json(req, { period:periodOut(rows[0]) });
      }
      case 'deletePeriod': {
        if (!uuidRe.test(body.id || '')) return json(req, { error:'not-found' }, 404);
        await db(`overtime_periods?id=eq.${body.id}&tracker_id=eq.${trackerId}`, { method:'DELETE' });
        return json(req, { ok:true });
      }
      case 'upsertExpense': {
        validateExpense(body.expense);
        const id = uuidRe.test(body.expense.id || '') ? body.expense.id : crypto.randomUUID();
        const existing = await db(`expenses?id=eq.${id}&select=tracker_id`);
        if (existing[0] && existing[0].tracker_id !== trackerId) return json(req, { error:'not-found' }, 404);
        const rows = await db('expenses?on_conflict=id', {
          method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=representation' },
          body:JSON.stringify({ id, tracker_id:trackerId, description:String(body.expense.description).trim(), amount:Number(body.expense.amount), expense_date:body.expense.date })
        });
        return json(req, { expense:expenseOut(rows[0]) });
      }
      case 'deleteExpense': {
        if (!uuidRe.test(body.id || '')) return json(req, { error:'not-found' }, 404);
        await db(`expenses?id=eq.${body.id}&tracker_id=eq.${trackerId}`, { method:'DELETE' });
        return json(req, { ok:true });
      }
      case 'rotateAccessKey': {
        const newKey = String(body.newKey || '');
        if (newKey.length < 32) return json(req, { error:'weak-key' }, 400);
        const hash = await sha256Hex(newKey);
        await db(`trackers?id=eq.${trackerId}`, { method:'PATCH', body:JSON.stringify({ access_key_hash:hash }) });
        return json(req, { ok:true });
      }
      default: return json(req, { error:'unknown-action' }, 400);
    }
  } catch (error) {
    const e:any = error;
    const status = e.code === '23P01' ? 409 : (e.status || 500);
    const message = e.code === '23P01' ? 'That overtime overlaps another period.' : (e.message || 'Unexpected error');
    return json(req, { error:'request-failed', message }, status);
  }
});