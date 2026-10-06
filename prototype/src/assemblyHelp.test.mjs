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

test('a rejected cable attempt explains the actual endpoints despite unchanged cable state',()=>{
 const raw={selection,installed:selection,structure:{...structure,open:true},lastAction:{kind:'connect',source:'psu-cpu',target:'board-atx',ok:false,code:'interface-mismatch',sequence:2,message:'PRIVATE'}};
 const help=assemblyHelp(raw);
 assert.match(help.action.description,/CPU 8-pin.*主板 24-pin/);
 assert.match(help.action.reason,/不同/);assert.match(help.action.fix,/CPU 8-pin 供电接口/);
 assert.equal(help.cables,0);assert.ok(!JSON.stringify(safeAssemblySnapshot(raw)).includes('PRIVATE'));
 const corrected=assemblyHelp({...raw,structure:{...raw.structure,cables:{eps:true}},lastAction:{...raw.lastAction,target:'cpu-power',ok:true,code:'ok',sequence:3}});
 assert.equal(corrected.action.ok,true);assert.match(corrected.action.reason,/成功/);assert.equal(corrected.cables,1);
});

test('operation evidence covers installation and ordering and rejects arbitrary identities',()=>{
 const raw={selection,installed:{},structure:{open:true,motherboard:true,psu:true}};
 const misplaced=assemblyHelp({...raw,lastAction:{kind:'install',source:'cpu',target:'memory',ok:false,code:'socket-mismatch',sequence:1}});
 assert.match(misplaced.action.description,/处理器.*DIMM/);assert.match(misplaced.action.fix,/CPU 插座/);
 const closed=assemblyHelp({...raw,lastAction:{kind:'connect',source:'psu-cpu',target:'cpu-power',ok:false,code:'cover-closed',sequence:2}});
 assert.match(closed.action.fix,/打开侧板/);
 assert.ok(!safeAssemblySnapshot({...raw,lastAction:{kind:'connect',source:'SECRET',target:'cpu-power',ok:false,code:'SECRET',sequence:4}}).lastAction);
 assert.ok(!safeAssemblySnapshot({...raw,lastAction:{kind:'boot',ok:false,code:'interface-mismatch',sequence:5}}).lastAction);
});
