import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldCelebrateOnce, bossModel } from '../js/effects.js';
import * as core from '../js/core.js';

class MemStorage { constructor(){this.m=new Map()} getItem(k){return this.m.get(k)||null} setItem(k,v){this.m.set(k,String(v))} }

test('celebration key only succeeds once per device storage',()=>{
  const s=new MemStorage();
  assert.equal(shouldCelebrateOnce('milestone-5000',s),true);
  assert.equal(shouldCelebrateOnce('milestone-5000',s),false);
  assert.equal(shouldCelebrateOnce('milestone-6000',s),true);
});

test('weekend boss progress is driven by real shift time',()=>{
  const p={id:'x',date:'2026-09-26',start:'07:00',end:'19:00',multiplier:2};
  const now=core.ukDateTimeMs('2026-09-26','13:00');
  const b=bossModel(p,now,core);
  assert.equal(b.title,'SATURDAY BOSS');
  assert.equal(b.progress,0.5);
  assert.equal(b.hp,21600);
  assert.ok(Math.abs(b.earned-6*core.hourlyNetRate(2))<1e-6);
});
