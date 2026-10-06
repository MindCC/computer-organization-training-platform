import test from 'node:test';
import assert from 'node:assert/strict';
import { assemblyHelp, safeAssemblySnapshot } from './assemblyHelp.js';
import { CABLES } from './completeAssembly.js';
const selection={cpu:'cpu-i3',memory:'mem-8',storage:'ssd-512',gpu:'gpu-entry'};
const structure={open:false,motherboard:true,psu:true,cooler:selection.cpu,cables:{}};
test('installed 4/4 with closed cover and no cables explains the exact boot blockers',()=>{
 const help=assemblyHelp({selection,installed:selection,structure});
 assert.equal(help.ready,false);assert.equal(help.installed,4);assert.equal(help.missing.length,5);
 assert.match(help.summary,/5/);assert.match(help.steps[0],/打开侧板/);
 assert.match(help.steps[1],/24-pin/);assert.match(help.steps[1],/主板/);
});
test('live reconnection updates guidance; closed cover does not prevent valid POST',()=>{
 const cables=Object.fromEntries(CABLES.map(c=>[c.id,true]));
 assert.equal(assemblyHelp({selection,installed:selection,structure:{...structure,cables}}).ready,true);
 delete cables.eps;
 const help=assemblyHelp({selection,installed:selection,structure:{...structure,open:true,cables}});
 assert.deepEqual(help.missing,['CPU 8-pin 供电']);assert.match(help.steps[0],/8-pin/);
});
test('assembly context reconstructs known hardware state and removes private/forged fields',()=>{
 const safe=safeAssemblySnapshot({selection:{...selection,name:'PRIVATE'},installed:{...selection,history:'SECRET'},structure:{...structure,cables:{atx:true,unknown:true}},powered:true,grades:[90]});
 assert.ok(!JSON.stringify(safe).includes('PRIVATE'));assert.ok(!JSON.stringify(safe).includes('SECRET'));
 assert.equal(safe.powered,false);assert.deepEqual(Object.keys(safe.selection),['cpu','memory','storage','gpu']);
 assert.ok(!Object.hasOwn(safe.structure.cables,'unknown'));
 assert.equal(safeAssemblySnapshot(null),null);
});
