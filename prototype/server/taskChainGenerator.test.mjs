import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTaskChain, taskChainMessages } from './taskChainGenerator.js';
import { taskChainTemplate } from '../src/shared/classroomTaskChain.js';
import { requestChatCompletion } from './aiClient.js';

test('task-chain generation requires explicit action and bounded teaching requirements',async()=>{
  await assert.rejects(generateTaskChain({prompt:'讲解补码'}),/确认/);
  await assert.rejects(generateTaskChain({prompt:' ',consent:'deepseek-task-chain'}),/2000/);
  await assert.rejects(generateTaskChain({prompt:'a'.repeat(2001),consent:'deepseek-task-chain'}),/2000/);
});
test('unconfigured generation has a labeled, editable local fallback',async()=>{
  const result=await generateTaskChain({prompt:'补码课堂',consent:'deepseek-task-chain'},{env:{}});
  assert.equal(result.source,'local');assert.equal(result.reason,'AI_DISABLED');assert.equal(result.taskChain.stages.length,6);
});
test('configured generation uses only public catalogue and teacher-entered requirements',async()=>{
  let sent;
  const result=await generateTaskChain({prompt:'讲解补码减法，并安排学习反思',consent:'deepseek-task-chain',studentId:333,grades:'PRIVATE_GRADE',history:'PRIVATE_HISTORY'},
    {env:{DEEPSEEK_API_KEY:'test'},requester:async(_config,messages)=>{sent=JSON.stringify(messages);return JSON.stringify(taskChainTemplate('twos'));}});
  assert.equal(result.source,'deepseek');assert.equal(result.taskChain.stages.length,6);assert.ok(sent.includes('补码减法'));assert.ok(sent.includes('ch2-q08'));assert.ok(!sent.includes('PRIVATE_'));assert.ok(!sent.includes('333'));
});
test('unavailable or invalid generated resources fall back without pretending to be AI output',async()=>{
  for(const requester of [async()=>'{broken',async()=>JSON.stringify({title:'错误',stages:[{id:'a',type:'demo',title:'未知页面',demoId:'evil'}]}),async()=>{throw Object.assign(new Error('timeout'),{code:'AI_TIMEOUT'});}]){
    const result=await generateTaskChain({prompt:'补码课堂',consent:'deepseek-task-chain'},{env:{DEEPSEEK_API_KEY:'test'},requester});assert.equal(result.source,'local');
  }
});
test('normal teacher requirement mentioning reflection passes the real AI client boundary',async()=>{
  let called=false;
  const result=await generateTaskChain({prompt:'讲解补码，安排学习反思',consent:'deepseek-task-chain'}, {env:{DEEPSEEK_API_KEY:'test'},requester:(config,messages,options)=>requestChatCompletion(config,messages,{...options,fetchImpl:async()=>{called=true;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(taskChainTemplate('twos'))}}]})};}})});
  assert.equal(called,true);assert.equal(result.source,'deepseek');
  assert.ok(taskChainMessages('课程要求').every(message=>message.content.length<=8000));
});

test('teaching terminology exception keeps private shaped fields and credentials blocked',async()=>{
  for(const content of ['reflection: private details','学生笔记：私人内容','password_hash: sensitive']){
    let called=false;
    await assert.rejects(requestChatCompletion({enabled:true,baseUrl:'https://api.deepseek.com',apiKey:'test',model:'test',timeoutMs:100},[{role:'user',content}],{contentScope:'public-teaching-requirements',fetchImpl:async()=>{called=true;}}),/Forbidden/);
    assert.equal(called,false);
  }
});
