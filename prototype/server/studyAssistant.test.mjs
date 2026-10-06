import test from 'node:test';
import assert from 'node:assert/strict';
import { askStudyAssistant, publicStudyContext, studyAssistantMessages, safeCircuitSnapshot } from './studyAssistant.js';

test('study AI uses public course material and drops all private fields', () => {
  const context = { questionId: 'ch3-q01', studentAnswer: 'PRIVATE_ANSWER', teacherFeedback: 'PRIVATE_FEEDBACK', grades: [77], activityLog: 'PRIVATE_LOG' };
  const material = publicStudyContext(context);
  assert.ok(material.exercise.title);
  assert.ok(material.concepts.length);
  const content = JSON.stringify(studyAssistantMessages('半加器如何进位？', context));
  assert.ok(!content.includes('PRIVATE_'));
  assert.ok(!content.includes('77'));
  assert.ok(!Object.hasOwn(material.exercise, 'answer'));
});
test('sending to DeepSeek requires explicit per-question consent', async () => {
  await assert.rejects(askStudyAssistant({ question: '什么是缓存？' }), /确认/);
});
test('unconfigured AI reports local course reference truthfully', async () => {
  const result = await askStudyAssistant({ question: '什么是缓存？', context: {chapterId: 'ch4'}, consent: 'deepseek-public-question' }, {env: {}});
  assert.equal(result.source, 'local'); assert.equal(result.reason, 'AI_DISABLED'); assert.ok(result.explanation.length);
});
test('configured AI returns validated answer and sends only public context', async () => {
  let messages;
  const result = await askStudyAssistant({ question: '半加器是什么？', context: {questionId:'ch3-q01', studentAnswer:'SECRET'}, consent:'deepseek-public-question' }, {env:{DEEPSEEK_API_KEY:'test'},requester:async (_config, input) => { messages=input; return JSON.stringify({explanation:'异或得到和，与门得到进位。',steps:['列出四种输入。'],check:'两个输入均为1时，和与进位各是多少？'}); }});
  assert.equal(result.source,'ai'); assert.ok(!JSON.stringify(messages).includes('SECRET'));
});
test('malformed or unavailable model replies keep local fallback distinct from AI', async () => {
  const result = await askStudyAssistant({question:'内存是什么？',consent:'deepseek-public-question'}, {env:{DEEPSEEK_API_KEY:'test'},requester:async()=>'{bad'});
  assert.equal(result.source,'local');
});
test('current assembly state requires separate consent and gives useful local fallback',async()=>{
 const assembly={selection:{cpu:'cpu-i3',memory:'mem-8',storage:'ssd-512',gpu:'gpu-entry'},installed:{cpu:'cpu-i3',memory:'mem-8',storage:'ssd-512',gpu:'gpu-entry'},structure:{open:false,motherboard:true,psu:true,cooler:'cpu-i3',cables:{}}};
 const payload={question:'为什么4/4还不能开机？',context:{assembly},consent:'deepseek-public-question'};
 const noConsent=await askStudyAssistant(payload,{env:{}});assert.ok(!noConsent.explanation.includes('5 条'));
 const result=await askStudyAssistant({...payload,stateConsent:'current-task-state'},{env:{}});
 assert.match(result.explanation,/5/);assert.match(result.steps[0],/打开侧板/);
 let messages;
 await askStudyAssistant({...payload,stateConsent:'current-task-state',context:{assembly:{...assembly,studentName:'PRIVATE'}}},{env:{DEEPSEEK_API_KEY:'test'},requester:async(_config,input)=>{messages=input;return '{bad';}});
 assert.match(JSON.stringify(messages),/24-pin/);assert.ok(!JSON.stringify(messages).includes('PRIVATE'));
});
test('current circuit counts are bounded, opt-in and never include wiring or identity',async()=>{
 const circuit={challengeId:'full-adder',connectionCount:4,issueCount:2,unknownOutputCount:1,edges:['PRIVATE'],studentName:'SECRET'};
 assert.equal(safeCircuitSnapshot({...circuit,connectionCount:-1}),null);
 assert.equal(safeCircuitSnapshot({...circuit,challengeId:'computer-components'}),null);
 const payload={question:'为什么没有输出？',context:{circuit},consent:'deepseek-public-question'};
 const ignored=await askStudyAssistant(payload,{env:{}});assert.ok(!ignored.explanation.includes('4 条'));
 const result=await askStudyAssistant({...payload,stateConsent:'current-task-state'},{env:{}});assert.match(result.explanation,/4 条/);
 let messages;await askStudyAssistant({...payload,stateConsent:'current-task-state'},{env:{DEEPSEEK_API_KEY:'test'},requester:async(_config,m)=>{messages=m;return '{}';}});
 assert.ok(!JSON.stringify(messages).includes('PRIVATE'));assert.ok(!JSON.stringify(messages).includes('SECRET'));
});
