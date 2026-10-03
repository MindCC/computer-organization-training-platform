import test from 'node:test';
import assert from 'node:assert/strict';
import { initialChapter, advanceChapter, readChapter, saveChapter } from './shopChapter.js';

test('customer conversation discovers requirements before quoting and gives a recovery path',()=>{
  let state=initialChapter(false);
  state=advanceChapter(state,{type:'OPEN'});
  assert.equal(state.node,'mentor');
  state=advanceChapter(state,{type:'HINT'});
  assert.equal(state.node,'hint');
  state=advanceChapter(state,{type:'WELCOME'});
  state=advanceChapter(state,{type:'PITCH'});
  assert.equal(state.node,'redirect');
  state=advanceChapter(state,{type:'INQUIRE'});
  assert.equal(advanceChapter(state,{type:'OFFERS'},{asked:[]}).node,'questions');
  state=advanceChapter(state,{type:'OFFERS'},{asked:['usage','capacity','budget']});
  assert.equal(state.node,'offers');
});
test('a chapter only thanks the customer after a current synced passing delivery',()=>{
  const state=initialChapter(true);
  for(const context of [{}, {delivered:false}, {delivered:false,receipt:{result:{passed:true},synced:false}}]){
    assert.equal(advanceChapter(state,{type:'DELIVERED'},context).node,'workshop');
  }
  let delivered=advanceChapter(state,{type:'DELIVERED'},{delivered:true});
  assert.equal(delivered.node,'thanks');
  delivered=advanceChapter(delivered,{type:'AFTERCARE',choice:'explanation'},{delivered:true});
  assert.equal(delivered.courtesy,'explanation');
  assert.equal(advanceChapter(delivered,{type:'AFTERCARE',choice:'support'},{delivered:true}).courtesy,'explanation');
  assert.equal(advanceChapter(delivered,{type:'END'},{delivered:false}).node,'reflection');
  assert.equal(advanceChapter(delivered,{type:'END'},{delivered:true}).node,'closing');
  assert.equal(advanceChapter(delivered,{type:'BOOT_INVALIDATED'}).node,'workshop');
});
test('recovery stores only reading and courtesy, never boot, receipts or successful endings',()=>{
  const map=new Map(),storage={setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)};
  saveChapter(storage,'student/order',{node:'closing',opened:true,courtesy:'support',cash:999,score:100,powered:true,receipt:{synced:true}});
  const restored=readChapter(storage,'student/order',true);
  assert.equal(restored.node,'workshop');
  assert.equal(restored.courtesy,'support');
  assert.equal(map.get('student/order').includes('receipt'),false);
  assert.equal(map.get('student/order').includes('cash'),false);
  assert.equal(readChapter(storage,'other-user/order',false).node,'opening');
  assert.equal(readChapter(storage,'legacy-accepted/order',true).node,'opening');
  map.set('bad','broken');assert.equal(readChapter(storage,'bad',false).node,'opening');
  saveChapter(storage,'quote',{node:'quote',opened:true});assert.equal(readChapter(storage,'quote',false).node,'offers');
});
