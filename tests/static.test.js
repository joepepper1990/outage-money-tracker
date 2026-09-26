import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = p => readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('index is a mobile PWA shell with module wiring',async()=>{
  const html=await read('index.html');
  assert.match(html,/viewport-fit=cover/);
  assert.match(html,/rel="manifest" href="manifest\.json"/);
  assert.match(html,/rel="stylesheet" href="styles\.css"/);
  assert.match(html,/type="module" src="js\/app\.js"/);
  assert.doesNotMatch(html,/OUTAGE_MONEY_CORE_START/);
});

test('main shell exposes Hours Plan Spend and omits rate clutter',async()=>{
  const html=await read('index.html');
  for(const label of ['Hours','Plan','Spend']) assert.match(html,new RegExp(`>${label}<`));
  assert.doesNotMatch(html,/net\s*\/\s*(minute|hour)|gross/i);
  assert.match(html,/id="completionRing"/);
  assert.match(html,/id="syncStatus"/);
});

test('calendar has seven weekday headings and date hooks',async()=>{
  const html=await read('index.html');
  for(const d of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']) assert.match(html,new RegExp(`>${d}<`));
  const ui=await read('js/ui.js');
  assert.match(ui,/data-date=/);
  for(const klass of ['completed','active','future','empty','today','double-time']) assert.match(ui,new RegExp(klass));
});

test('styles protect mobile viewport and safe areas',async()=>{
  const css=await read('styles.css');
  assert.match(css,/overflow-x:\s*hidden/);
  assert.match(css,/env\(safe-area-inset-top\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/@media\s*\(max-width:\s*430px\)/);
});

test('manifest and service worker define installable versioned app shell',async()=>{
  const manifest=JSON.parse(await read('manifest.json'));
  assert.equal(manifest.name,'Outage Money');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'./');
  assert.ok(manifest.icons.some(i=>i.src==='icon-192.png'));
  assert.ok(manifest.icons.some(i=>i.src==='icon-512.png'));
  const sw=await read('sw.js');
  for(const asset of ['./','./index.html','./styles.css','./js/core.js','./js/data.js','./js/ui.js','./js/effects.js','./js/app.js','./manifest.json','./icon-192.png','./icon-512.png']) assert.match(sw,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(sw,/outage-money-v2-/);
  assert.match(sw,/caches\.delete/);
});

test('offline read-only mode disables mutation controls without blocking navigation',async()=>{
  const css=await read('styles.css');
  assert.match(css,/\.read-only\s+\.form-card/);
  assert.match(css,/\.read-only\s+\.quick-grid/);
  assert.doesNotMatch(css,/\.read-only\s+\.topbar/);
});


test('calendar day detail exposes a direct edit-hours action',async()=>{
  const ui=await read('js/ui.js');
  const app=await read('js/app.js');
  assert.match(ui,/data-calendar-edit/);
  assert.match(app,/calendarEdit/);
});


test('edge function prefers the service-role JWT for direct REST authorization',async()=>{
  const fn=await read('supabase/functions/tracker-api/index.ts');
  const legacy=fn.indexOf("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
  const modern=fn.indexOf("Deno.env.get('SUPABASE_SECRET_KEYS')");
  assert.ok(legacy>=0 && modern>=0 && legacy<modern);
});


test('calendar allows editing even on a day with no existing overtime and new forms use date rate defaults',async()=>{
  const ui=await read('js/ui.js');
  const app=await read('js/app.js');
  assert.ok((ui.match(/data-calendar-edit/g)||[]).length>=2);
  assert.match(app,/defaultMultiplierForDate/);
});


test('mutations fail closed offline and guard against duplicate saves',async()=>{
  const app=await read('js/app.js');
  assert.match(app,/let\s+[^;]*saving=false/);
  assert.match(app,/if\(!client\|\|!online\)[^{]*\{[^}]*throw/s);
  assert.match(app,/if\(saving\)\{[^}]*throw\s+e[^}]*\}/s);
  assert.match(app,/finally\s*\{\s*saving=false/);
  assert.match(app,/e\.code==='offline'/);
});

test('unconnected home-screen install exposes one-time shared tracker connection flow',async()=>{
  const html=await read('index.html');
  const app=await read('js/app.js');
  const ui=await read('js/ui.js');
  assert.match(html,/id="connectPanel"/);
  assert.match(html,/id="connectForm"/);
  assert.match(app,/connectShareLink/);
  assert.match(ui,/showConnectPanel/);
});

test('service worker cache version is bumped for migration hotfix',async()=>{
  const sw=await read('sw.js');
  assert.match(sw,/outage-money-v2-20260926-2/);
});
