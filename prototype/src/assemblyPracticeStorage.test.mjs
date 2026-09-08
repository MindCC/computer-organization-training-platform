import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceStorageKey, readPracticeStore, savePracticeProgress, resumePractice } from './assemblyPracticeStorage.js';
import { createPracticeSeed, recordPracticeEvent } from './assemblyPractice.js';
const parts={cpu:'cpu-i3',memory:'mem-8',storage:'ssd-512',gpu:'gpu-integrated'};
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
const run=()=>({id:'test-run-1',mode:'fault',fault:'power',parts,...createPracticeSeed(parts,'fault','power'),category:'memory',session:{startedAt:1000,events:[{type:'hint',message:'检查供电',at:2000}]}});
test('draft and history are isolated by student and order; invalid identities cannot persist',()=>{
 const storage=memory(),key=practiceStorageKey('student-a','order-1');
 assert.equal(savePracticeProgress(storage,key,run(),4000).ok,true);
 assert.ok(readPracticeStore(storage,key).active);
 assert.equal(readPracticeStore(storage,practiceStorageKey('student-b','order-1')).active,null);
 assert.equal(readPracticeStore(storage,practiceStorageKey('student-a','order-2')).active,null);
 assert.equal(practiceStorageKey(null,'order-1'),null);
 assert.equal(savePracticeProgress(storage,null,run(),4000).ok,false);
});
test('resume retains actual assembly, errors and hints, excludes offline time and drops boot flags',()=>{
 const storage=memory(),key=practiceStorageKey('a','b');savePracticeProgress(storage,key,run(),5000);
 const payload=JSON.parse(storage.getItem(key));payload.active.powered=true;payload.active.session={completedAt:5000};storage.setItem(key,JSON.stringify(payload));
 const restored=resumePractice(readPracticeStore(storage,key).active,100000);
 assert.equal(restored.session.startedAt,96000);assert.equal(restored.session.completedAt,undefined);
 assert.equal(restored.powered,undefined);assert.equal(restored.installed.cpu,parts.cpu);
 assert.equal(restored.structure.cables.eps,undefined);assert.equal(restored.session.events.length,1);
 assert.equal(restored.category,'memory');
});
test('completion clears resumable draft and appends one bounded historical review per run ID',()=>{
 const storage=memory(),key=practiceStorageKey('a','b'),current=run();
 current.session=recordPracticeEvent(current.session,{type:'complete'},9000);
 savePracticeProgress(storage,key,current,9000);savePracticeProgress(storage,key,current,10000);
 const saved=readPracticeStore(storage,key);assert.equal(saved.active,null);assert.equal(saved.history.length,1);assert.equal(saved.history[0].score,97);
 for(let i=2;i<=25;i++)savePracticeProgress(storage,key,{...current,id:'test-run-'+i},10000+i);
 assert.equal(readPracticeStore(storage,key).history.length,20);
});
test('corrupt or unsupported storage cannot restore a session and write failures preserve the old draft',()=>{
 const storage=memory(),key=practiceStorageKey('a','b');storage.setItem(key,'{bad');assert.equal(readPracticeStore(storage,key).active,null);
 storage.setItem(key,JSON.stringify({version:999,active:run()}));assert.equal(readPracticeStore(storage,key).active,null);
 savePracticeProgress(storage,key,run(),5000);const before=storage.getItem(key);
 storage.setItem=()=>{throw new Error('quota');};assert.equal(savePracticeProgress(storage,key,run(),6000).ok,false);assert.equal(storage.getItem(key),before);
});
