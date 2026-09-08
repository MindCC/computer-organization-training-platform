import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_FAULTS, createPracticeSeed, practiceNextStep, practiceBootFeedback, recordPracticeEvent, practiceReview } from './assemblyPractice.js';
import { structureCheck, connectCable, structureAction } from './completeAssembly.js';
import { assemblyCheck } from './hardwareAssembly.js';
const parts={cpu:'cpu-i3',memory:'mem-8',storage:'ssd-512',gpu:'gpu-integrated'};

test('each fault is a real incomplete assembly and its specific repair enables boot',()=>{
 for(const fault of PRACTICE_FAULTS){
  const seed=createPracticeSeed(parts,'fault',fault.id);
  assert.ok(assemblyCheck(seed.installed,parts).ready);
  assert.equal(structureCheck(seed.structure,seed.installed,parts).ready,false);
  assert.ok(practiceBootFeedback(seed.installed,seed.structure,parts).length);
  let repaired;
  if(fault.id==='cooling'){
   repaired=structureAction(seed.structure,'cooler',true,seed.installed,parts).state;
   repaired=connectCable(repaired,'cooler-fan','cpu-fan',seed.installed,parts).state;
  }else{
   repaired=connectCable(seed.structure,...(fault.id==='power'?['psu-cpu','cpu-power']:['ssd-data','board-sata']),seed.installed,parts).state;
  }
  assert.ok(structureCheck(repaired,seed.installed,parts).ready);
 }
});
test('guided steps follow actual prerequisites and omit an integrated GPU',()=>{
 const seed=createPracticeSeed(parts,'guided');
 assert.equal(practiceNextStep(seed.installed,seed.structure,parts).id,'open');
 const ready=createPracticeSeed(parts,'fault','power');ready.structure.cables.eps=true;
 assert.equal(practiceNextStep(ready.installed,ready.structure,parts).id,'boot');
 assert.equal(ready.installed.gpu,undefined);
});
test('review requires completion and charges errors and explicit help only',()=>{
 let session={startedAt:1000,events:[]};
 session=recordPracticeEvent(session,{type:'action',ok:true,message:'安装成功'},2000);
 session=recordPracticeEvent(session,{type:'action',ok:false,message:'接口不匹配'},3000);
 session=recordPracticeEvent(session,{type:'hint',message:'检查供电'},4000);
 assert.equal(practiceReview(session).complete,false);
 session=recordPracticeEvent(session,{type:'complete'},9000);
 assert.deepEqual({...practiceReview(session),errors:undefined}, {complete:true,score:92,hints:1,errorCount:1,seconds:8,errors:undefined});
 assert.equal(recordPracticeEvent(session,{type:'complete'},20000),session);
});

test('fault exercises include a discrete GPU and a repair must also retain all other requirements',()=>{
 const discrete={...parts,gpu:'gpu-entry'},seed=createPracticeSeed(discrete,'fault','power');
 assert.equal(seed.installed.gpu,'gpu-entry');
 assert.equal(assemblyCheck(seed.installed,discrete).total,4);
 seed.structure.cables.eps=true;delete seed.installed.memory;
 assert.equal(assemblyCheck(seed.installed,discrete).ready,false);
 assert.match(practiceBootFeedback(seed.installed,seed.structure,discrete),/初始化未通过/);
 assert.throws(()=>createPracticeSeed(parts,'fault','unknown'));
});

test('repeated mistakes cannot produce a negative score and completion freezes the record',()=>{
 let session={startedAt:1000,events:[]};
 for(let i=0;i<25;i++)session=recordPracticeEvent(session,{type:'action',ok:false,message:'错误'},2000+i);
 session=recordPracticeEvent(session,{type:'complete'},5000);
 assert.equal(practiceReview(session).score,0);
 assert.equal(recordPracticeEvent(session,{type:'hint'},6000),session);
});
