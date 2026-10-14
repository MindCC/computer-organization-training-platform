import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase, createUser } from './db.js';
import { hashPassword } from './auth.js';
import { selectedStudyDialogue } from './studyDialogue.js';
import { saveAiConversation } from './aiConversationRepository.js';

test('teacher and student dialogues persist privately and link only explicitly consented owner turns',async()=>{
 const db=openDatabase(':memory:'),prompts=[],reviews=[];
 const app=createApp({db,serveStatic:false,logger:()=>{},studyAssistantOptions:{env:{DEEPSEEK_API_KEY:'test-provider'},scopeRequester:async(_config,messages)=>{reviews.push(JSON.stringify(messages));return '{"decision":"course"}';},requester:async(_config,messages)=>{prompts.push(JSON.stringify(messages));return JSON.stringify({explanation:'补码减法的第二步是按当前位宽相加。',steps:['求负数补码。','按位宽相加。'],check:'是否发生补码溢出？'});}}});
 const password='Dialogue-Test-123!',passwordHash=await hashPassword(password);
 const users={};for(const role of ['student','teacher'])users[role]=createUser(db,{username:`dialogue-${role}`,displayName:`PRIVATE_${role}_NAME`,role,passwordHash});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 async function post(path,body,cookie){const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});return {status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0],data:await response.json()};}
 const firstIds={};
 try{
  for(const role of ['student','teacher']){
   const cookie=(await post('/api/auth/login',{username:`dialogue-${role}`,password})).cookie;
   const first=await post(`/api/${role}/study-assistant`,{question:'补码减法',consent:'deepseek-public-question'},cookie);
   assert.equal(first.status,200);assert.ok(Number.isSafeInteger(first.data.conversationId));firstIds[role]=first.data.conversationId;
   const payload={question:'刚才第二步我不理解',consent:'deepseek-public-question',dialogueIds:[first.data.conversationId]};
   const calls=prompts.length;
   assert.equal((await post(`/api/${role}/study-assistant`,payload,cookie)).status,400);assert.equal(prompts.length,calls);
   const follow=await post(`/api/${role}/study-assistant`,{...payload,dialogueConsent:'current-course-dialogue',dialogueTurns:[{question:'FORGED_PRIVATE_CLIENT',answer:'FORGED_ANSWER'}]},cookie);
   assert.equal(follow.status,200);assert.equal(follow.data.source,'ai');
   assert.ok(prompts.at(-1).includes(first.data.explanation));assert.ok(!prompts.at(-1).includes('FORGED_'));
   assert.ok(reviews.at(-1).includes(first.data.explanation));
   const history=await(await fetch(base+`/api/${role}/study-assistant/history`,{headers:{cookie}})).json();assert.equal(history.conversations.length,2);assert.equal(history.conversations[0].id,follow.data.conversationId);
   assert.equal((await fetch(base+`/api/${role==='student'?'teacher':'student'}/study-assistant/history`,{headers:{cookie}})).status,403);
   const independent=await post(`/api/${role}/study-assistant`,{question:'补码溢出判断',consent:'deepseek-public-question'},cookie);
   assert.equal(independent.status,200);assert.ok(!prompts.at(-1).includes('补码减法的第二步是按当前位宽相加。'));
  }
  assert.throws(()=>selectedStudyDialogue(db,users.teacher.id,[firstIds.student],'current-course-dialogue'),/不存在|当前账号/);
  assert.throws(()=>selectedStudyDialogue(db,users.teacher.id,[firstIds.teacher,firstIds.teacher],'current-course-dialogue'),/三轮/);
  assert.throws(()=>selectedStudyDialogue(db,users.teacher.id,[1,2,3,4],'current-course-dialogue'),/三轮/);
  const rejectedId=saveAiConversation(db,{studentId:users.teacher.id,kind:'question',question:'无关输入',answer:{reason:'COURSE_SCOPE_REJECTED',source:'local'}});
  assert.throws(()=>selectedStudyDialogue(db,users.teacher.id,[rejectedId],'current-course-dialogue'),/范围/);
  assert.ok(!JSON.stringify([...prompts,...reviews]).includes('PRIVATE_'));assert.ok(!JSON.stringify([...prompts,...reviews]).includes('dialogue-teacher'));
 }finally{await new Promise(r=>{server.close(r);server.closeAllConnections();});db.close();}
});
