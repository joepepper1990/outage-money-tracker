import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('frontend has simple four-tab navigation',async()=>{const html=await read('index.html');for(const x of ['Pay','Work','Forecast','Settings'])assert.match(html,new RegExp(`>${x}<`));assert.match(html,/id="nextPayNet"/);assert.match(html,/id="actualDialog"/)});
test('monthly input actions are obvious and mobile friendly',async()=>{const html=await read('index.html');for(const x of ['Add overtime','Add pager','Save actual payslip','Save pay deal'])assert.match(html,new RegExp(x));const css=await read('styles.css');assert.match(css,/env\(safe-area-inset-bottom\)/);assert.match(css,/@media\(max-width:520px\)/)});
test('service worker includes payroll engine and removes old caches',async()=>{const sw=await read('sw.js');assert.match(sw,/\.\/js\/payroll\.js/);assert.match(sw,/pay-tracker-v3-20261025-3/);assert.match(sw,/outage-money-v2-/)});
test('manifest is renamed without changing install scope',async()=>{const m=JSON.parse(await read('manifest.json'));assert.equal(m.name,'Pay Tracker');assert.equal(m.start_url,'./');assert.equal(m.display,'standalone')});
test('payroll backend source contains actual payslip and pay deal actions',async()=>{const fn=await read('supabase/functions/tracker-api/index.ts');for(const a of ['upsertActualPayslip','upsertPayDeal','upsertStandby','updateProfile'])assert.match(fn,new RegExp(a))});


test('overtime is added and edited inline with date hours and rate',async()=>{
  const html=await read('index.html');
  const app=await read('js/app.js');
  assert.match(html,/id="overtimeAddForm"/);
  assert.match(html,/id="addOtDate"/);
  assert.match(html,/id="addOtHours"/);
  assert.match(html,/id="addOtRate"/);
  assert.doesNotMatch(html,/id="overtimeDialog"/);
  assert.match(app,/data-inline-ot-form/);
  assert.match(app,/data-delete-inline-ot/);
  assert.match(app,/client\.upsertPeriod\(p\)/);
  assert.doesNotMatch(html,/id="addActualBtn"/);
});

test('pager form uses start date and inclusive whole days',async()=>{
  const html=await read('index.html');
  assert.match(html,/Start date/);
  assert.match(html,/Days \(incl\. start\)/);
  assert.match(html,/id="standbyUnits"[^>]*step="1"/);
});

test('iPhone modal controls are explicitly constrained to viewport',async()=>{
  const css=await read('styles.css');
  assert.match(css,/dialog\.sheet\{inline-size:calc\(100dvw - 24px\)/);
  assert.match(css,/max-inline-size:100%!important/);
});

test('database migration converts overtime to hours and includes full payslip history',async()=>{
  const sql=await read('supabase/migrations/20261025_mobile_hours_payslip_history.sql');
  assert.match(sql,/add column if not exists hours/);
  assert.match(sql,/2025-01-01/);
  assert.match(sql,/2026-10-01/);
  assert.match(sql,/hours set not null/);
});


test('inline overtime editor stays inside the iPhone viewport',async()=>{
  const css=await read('styles.css');
  assert.match(css,/\.inline-ot-fields\{display:grid/);
  assert.match(css,/@media\(max-width:520px\)[\s\S]*\.inline-ot-fields\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)\}/);
});
