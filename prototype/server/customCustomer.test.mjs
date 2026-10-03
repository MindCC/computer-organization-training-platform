import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCustomerInput, parseCustomerStory, generateCustomerStory } from './customCustomer.js';
import { gradeHardwareOrder } from '../src/hardwareGame.js';

export const sampleInput={profile:{name:'阿禾',occupation:'自由设计师',personality:'认真、爱问细节'},requirements:'办公和表格，资料约200GB，想用SSD，8GB内存即可。',budget:2200};
export const sampleStory={summary:'日常办公，优先响应速度。',reasoning:'SSD减少等待，集成显卡足够办公。',targets:{cpu:45,memory:8,storageCapacity:256,storageSpeed:70,gpu:30},questions:[],nodes:[{id:'arrival',text:'我想把办公软件打开得快一点，预算要控制住。',choices:[{label:'先聊聊为什么想换电脑',next:'detail'},{label:'了解了，看看满足需求的方案',next:null}]},{id:'detail',text:'现在打开表格总要等，SSD和内存够用就好。',choices:[{label:'先保证响应速度和预算',next:null}]}]};

test('input retains only bounded explicit customer fields',()=>{
  const clean=normalizeCustomerInput({...sampleInput,token:'secret',profile:{...sampleInput.profile,userId:99}});
  assert.deepEqual(Object.keys(clean),['profile','requirements','budget']);assert.equal(clean.profile.userId,undefined);
  assert.throws(()=>normalizeCustomerInput({...sampleInput,budget:0}));
  assert.throws(()=>normalizeCustomerInput({...sampleInput,requirements:'a'.repeat(2001)}));
});
test('AI story targets use the player budget and valid forward dialogue branches',()=>{
  const story=parseCustomerStory(JSON.stringify({...sampleStory,targets:{...sampleStory.targets,budget:1}}),sampleInput);
  assert.equal(story.targets.budget,2200);assert.equal(story.source,'ai');
  assert.throws(()=>parseCustomerStory(JSON.stringify({...sampleStory,nodes:[{id:'a',text:'x',choices:[{label:'loop',next:'a'}]}]}),sampleInput));
  assert.throws(()=>parseCustomerStory(JSON.stringify({...sampleStory,targets:{...sampleStory.targets,memory:-1}}),sampleInput));
  assert.throws(()=>parseCustomerStory('not json',sampleInput));
});
test('missing requirements cannot create an accepted target order',()=>{
  const story=parseCustomerStory(JSON.stringify({...sampleStory,targets:null,questions:['资料需要多少空间？']}),sampleInput);
  assert.equal(story.targets,null);assert.ok(story.questions.length);
  assert.throws(()=>parseCustomerStory(JSON.stringify({...sampleStory,targets:null}),sampleInput));
});
test('AI disabled and failed requests are never replaced with a fabricated story',async()=>{
  await assert.rejects(generateCustomerStory(sampleInput,{env:{}}),e=>e.code==='AI_DISABLED');
  let sent;
  const result=await generateCustomerStory(sampleInput,{env:{DEEPSEEK_API_KEY:'test'},aiRequester:async(_config,messages)=>{sent=messages;return JSON.stringify(sampleStory);}});
  assert.equal(result.source,'ai');assert.ok(sent[0].content.includes('hdd-1tb'));
  await assert.rejects(generateCustomerStory(sampleInput,{env:{DEEPSEEK_API_KEY:'test'},aiRequester:async()=>{throw new Error('offline');}}));
});
test('dynamic orders retain unmet capacity and share the real catalog grader',()=>{
  const selection={cpu:'cpu-i3',memory:'mem-8',storage:'ssd-512',gpu:'gpu-integrated'};
  const order={title:'办公需求',targets:{...sampleStory.targets,budget:2200}};
  assert.equal(gradeHardwareOrder(order,selection).passed,true);
  const impossible=gradeHardwareOrder({...order,targets:{...order.targets,storageCapacity:2048}},selection);
  assert.equal(impossible.passed,false);assert.ok(impossible.errors.some(e=>e.type==='容量不足'));
});
test('one repair validates a malformed model response without weakening story rules',async()=>{
  let calls=0;
  const story=await generateCustomerStory(sampleInput,{env:{DEEPSEEK_API_KEY:'test'},aiRequester:async()=>++calls===1?'not json':JSON.stringify(sampleStory)});
  assert.equal(calls,2);assert.equal(story.source,'ai');
  calls=0;await assert.rejects(generateCustomerStory(sampleInput,{env:{DEEPSEEK_API_KEY:'test'},aiRequester:async()=>{calls++;return 'not json';}}),e=>e.code==='AI_RESPONSE');assert.equal(calls,2);
});
