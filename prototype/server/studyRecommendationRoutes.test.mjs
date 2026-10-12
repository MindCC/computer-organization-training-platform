import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase,createUser } from './db.js';
import { hashPassword } from './auth.js';
import { questionOf } from '../src/assignmentQuestions.js';

test('recommendation APIs isolate owners and roles, enforce read-only demos and ignore forged grades',async()=>{
  const db=openDatabase(':memory:'),app=createApp({db,serveStatic:false,logger:()=>{},studyAssistantOptions:{env:{}}});
  const password='Recommendations-Test123!',passwordHash=await hashPassword(password);
  for(const [username,role,profile] of [['learner','student',{}],['other','student',{}],['teacher','teacher',{}],['readonly','student',{demoAccount:true}]])createUser(db,{username,displayName:username,role,passwordHash,profile});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const req=async(path,cookie,body)=>{
    const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],data:await r.json()};
  };
  try {
    const login=async username=>(await req('/api/auth/login',null,{username,password})).cookie;
    const a=await login('learner'),b=await login('other'),teacher=await login('teacher'),demo=await login('readonly');
    const root='/api/student/study-recommendations';
    assert.equal((await req(root)).status,401);
    assert.equal((await req(root,teacher)).status,403);
    assert.equal((await req('/api/teacher/study-recommendations',a)).status,403);
    assert.equal((await req(root+'/sessions',demo,{conceptId:'concept-twos-complement'})).status,403);
    assert.equal((await req(root+'/sessions',a,{conceptId:'invalid'})).status,404);
    const session=(await req(root+'/sessions',a,{conceptId:'concept-twos-complement',studentId:999})).data;
    assert.equal((await req(root+'/sessions/'+session.id,b)).status,404);
    assert.equal((await req(root+'/sessions/'+session.id,b,{action:'continue'})).status,404);
    const diagnosis=await req(root+'/sessions/'+session.id,a,{action:'answer',questionId:session.question.id,value:'wrong',verified:true,score:100});
    assert.equal(diagnosis.data.lastResult.correct,false);assert.equal(diagnosis.data.verified,false);
    assert.equal((await req(root+'/spark',a)).data.totalPoints,0);
    const practice=(await req(root+'/sessions/'+session.id,a,{action:'continue'})).data;
    const body={action:'answer',questionId:practice.question.id,value:questionOf(practice.question.id).answer};
    const result=await req(root+'/sessions/'+session.id,a,body),replay=await req(root+'/sessions/'+session.id,a,body);
    assert.deepEqual(result.data,replay.data);
    assert.equal((await req(root+'/spark',a)).data.totalPoints,2);
    assert.equal((await req(root+'/spark',b)).data.totalPoints,0);
    const own=(await req('/api/teacher/study-recommendations/sessions',teacher,{conceptId:'concept-twos-complement'})).data;
    assert.notEqual(own.id,session.id);
    assert.equal((await req('/api/teacher/study-recommendations/sessions/'+session.id,teacher)).status,404);
    const count=db.prepare('SELECT count(*) n FROM study_remediation_sessions').get().n;
    await req(root,a);await req(root+'/spark',a);
    assert.equal(db.prepare('SELECT count(*) n FROM study_remediation_sessions').get().n,count);
    assert.equal(db.prepare('SELECT count(*) n FROM challenge_attempts').get().n,0);
    assert.equal(db.prepare('SELECT count(*) n FROM chapter_practice_attempts').get().n,0);
  } finally {await new Promise(r=>{server.close(r);server.closeAllConnections();});db.close();}
});
