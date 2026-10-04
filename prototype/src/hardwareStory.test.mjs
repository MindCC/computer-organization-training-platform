import test from 'node:test';
import assert from 'node:assert/strict';
import { HARDWARE_GAME_CASES, gradeHardwareBuild } from './hardwareGame.js';
import { storyProfile, buildStoryOffers, buildOrderOffers, storyStorageKey, readStory, saveStory, storyStage } from './hardwareStory.js';

test('office offers change the actual configuration and meet the original grading rules',()=>{
  const offers=buildStoryOffers('game-office-pc');
  assert.equal(offers.length,2);
  assert.notDeepEqual(offers[0].selection,offers[1].selection);
  assert.equal(offers[0].price,1190);
  for(const offer of offers){const result=gradeHardwareBuild('game-office-pc',offer.selection);assert.equal(result.passed,true);assert.equal(offer.price,result.metrics.totalPrice);}
});
test('all customer requirements come from the active order and impossible orders stay visible',()=>{
  for(const order of HARDWARE_GAME_CASES){const profile=storyProfile(order.id);assert.ok(profile.name);assert.ok(profile.questions.find(q=>q.id==='budget').answer.includes(String(order.targets.budget)));}
  for(const order of HARDWARE_GAME_CASES)assert.ok(buildStoryOffers(order.id).every(offer=>gradeHardwareBuild(order.id,offer.selection).passed),`${order.id} must have deliverable offers`);
  assert.ok(buildOrderOffers({...HARDWARE_GAME_CASES[0],targets:{...HARDWARE_GAME_CASES[0].targets,storageCapacity:4096}}).every(offer=>!offer.passed));
  assert.deepEqual(buildStoryOffers('missing-order'),[]);
});
test('story recovery whitelists conversation state and never restores boot or grade',()=>{
  const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
  const key=storyStorageKey('student-a','game-office-pc');
  saveStory(storage,key,{accepted:true,asked:['usage','unknown','usage'],powered:true,score:100,receipt:{synced:true}});
  assert.deepEqual(readStory(storage,key),{accepted:true,asked:['usage']});
  assert.equal(map.get(key).includes('powered'),false);
  assert.notEqual(key,storyStorageKey('student-b','game-office-pc'));
  assert.notEqual(key,storyStorageKey('student-a','game-student-pc'));
  map.set(key,'bad json');assert.deepEqual(readStory(storage,key),{accepted:false,asked:[]});
  assert.equal(saveStory(null,key,{accepted:true}),false);
});
test('acceptance, real boot and matching receipt determine the current stage',()=>{
  const current={accepted:true,ready:false,caseId:'a',selectionSignature:'s'};
  assert.equal(storyStage({...current,accepted:false}),0);
  assert.equal(storyStage(current),1);
  assert.equal(storyStage({...current,ready:true}),2);
  assert.equal(storyStage({...current,ready:true,receipt:{caseId:'a',signature:'s'}}),3);
  assert.equal(storyStage({...current,ready:true,receipt:{caseId:'b',signature:'s'}}),2);
  assert.equal(storyStage({...current,receipt:{caseId:'a',signature:'s'}}),1);
});
