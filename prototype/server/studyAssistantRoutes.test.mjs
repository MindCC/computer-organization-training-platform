import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase,migrate,createUser } from './db.js';
import { hashPassword } from './auth.js';

test('teachers and students can ask course questions through their own role endpoint',async()=>{
  const db=openDatabase(':memory:');migrate(db);const passwordHash=await hashPassword('CourseTest123!');
  for(const role of ['teacher','student'])createUser(db,{username:role,displayName:role,role,passwordHash});
  const app=createApp({db,serveStatic:false,logger:()=>{},studyAssistantOptions:{env:{}}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function post(path,body,cookie){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});return{status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],data:r.headers.get('content-type')?.includes('application/json')?await r.json():await r.text()};}
  try {
    const teacher=(await post('/api/auth/login',{username:'teacher',password:'CourseTest123!'})).cookie,student=(await post('/api/auth/login',{username:'student',password:'CourseTest123!'})).cookie;
    const payload={question:'半加器与全加器有什么区别？',context:{chapterId:'ch3'},consent:'deepseek-public-question'};
    const answer=await post('/api/teacher/study-assistant',payload,teacher);assert.equal(answer.status,200);assert.equal(answer.data.source,'local');assert.ok(answer.data.explanation);
    assert.equal((await post('/api/teacher/study-assistant',payload,student)).status,403);
    assert.equal((await post('/api/student/study-assistant',payload,teacher)).status,403);
    assert.equal((await post('/api/student/study-assistant',payload,student)).status,200);
    assert.equal(db.prepare('SELECT count(*) AS n FROM challenge_attempts').get().n,0);
  }finally{await new Promise(r=>{server.close(r);server.closeAllConnections();});db.close();}
});
