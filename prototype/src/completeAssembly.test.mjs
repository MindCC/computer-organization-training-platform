import test from 'node:test';
import assert from 'node:assert/strict';
import { structureAction, reconcileStructure, structureCheck, connectCable, CABLES } from './completeAssembly.js';
const parts={cpu:'cpu-a',memory:'ram-a',storage:'ssd-a',gpu:'gpu-integrated'};
test('case opening and motherboard prerequisites gate assembly',()=>{
 assert.equal(structureAction({},'motherboard',true,{},parts).ok,false);
 const open=structureAction({},'open',true,{},parts).state;
 assert.equal(structureAction(open,'motherboard',true,{},parts).ok,true);
 assert.equal(structureAction(open,'cooler',true,{},parts).ok,false);
});
test('correct cable endpoint pairs and installed parts are required',()=>{
 const state={open:true,motherboard:true,psu:true,cooler:'cpu-a',cables:{}};
 const installed={...parts};delete installed.gpu;
 assert.equal(connectCable(state,'psu-atx','cpu-power',installed,parts).ok,false);
 let next=state;
 for(const c of CABLES){const r=connectCable(next,c.from,c.to,installed,parts);assert.equal(r.ok,true);next=r.state;}
 assert.equal(structureCheck(next,installed,parts).ready,true);
 assert.equal(structureCheck({...next,cooler:false},installed,parts).ready,false);
});
test('CPU changes invalidate cooler, removing PSU clears connections',()=>{
 const state={open:true,motherboard:true,psu:true,cooler:'cpu-a',cables:Object.fromEntries(CABLES.map(c=>[c.id,true]))};
 assert.equal(reconcileStructure(state,{...parts,cpu:'cpu-b'},parts).cooler,false);
 const r=structureAction(state,'psu',false,parts,parts);
 assert.equal(r.ok,true);
 assert.deepEqual(r.state.cables,{});
});
test('motherboard cannot be removed with installed core parts and cover blocks installation',()=>{
 assert.equal(structureAction({open:true,motherboard:true},'motherboard',false,{cpu:'cpu-a'},parts).ok,false);
 assert.equal(structureAction({open:false,motherboard:true},'cooler',true,{cpu:'cpu-a'},parts).ok,false);
});
test('corrupt structure state is sanitized and missing storage invalidates SATA',()=>{
 const r=reconcileStructure({open:'yes',motherboard:1,psu:true,cooler:true,cables:{sata:true,unknown:true}}, {}, parts);
 assert.equal(r.open,false);assert.equal(r.motherboard,false);assert.equal(r.cooler,false);assert.deepEqual(r.cables,{});
});
