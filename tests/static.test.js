import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('frontend has simple four-tab navigation',async()=>{const html=await read('index.html');for(const x of ['Pay','Work','Forecast','Settings'])assert.match(html,new RegExp(`>${x}<`));assert.match(html,/id="nextPayNet"/);assert.match(html,/id="actualDialog"/)});
test('monthly input actions are obvious and mobile friendly',async()=>{const html=await read('index.html');for(const x of ['Add overtime','Add pager','Save actual payslip','Save pay deal'])assert.match(html,new RegExp(x));const css=await read('styles.css');assert.match(css,/env\(safe-area-inset-bottom\)/);assert.match(css,/@media\(max-width:520px\)/)});
test('service worker includes payroll engine and removes old caches',async()=>{const sw=await read('sw.js');assert.match(sw,/\.\/js\/payroll\.js/);assert.match(sw,/pay-tracker-v3-20261025-1/);assert.match(sw,/outage-money-v2-/)});
test('manifest is renamed without changing install scope',async()=>{const m=JSON.parse(await read('manifest.json'));assert.equal(m.name,'Pay Tracker');assert.equal(m.start_url,'./');assert.equal(m.display,'standalone')});
test('payroll backend source contains actual payslip and pay deal actions',async()=>{const fn=await read('supabase/functions/tracker-api/index.ts');for(const a of ['upsertActualPayslip','upsertPayDeal','upsertStandby','updateProfile'])assert.match(fn,new RegExp(a))});
