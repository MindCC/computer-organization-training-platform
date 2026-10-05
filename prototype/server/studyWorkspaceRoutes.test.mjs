import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase, migrate, createUser } from './db.js';
import { hashPassword } from './auth.js';

test('HTTP study workspace requires role/ownership and persists private plans and timer state', async () => {
  const db = openDatabase(':memory:'); migrate(db);
  const passwordHash = await hashPassword('StudyTest123!');
  for (const [username,role] of [['student','student'],['other','student'],['teacher','teacher']]) createUser(db,{username,displayName:username,role,passwordHash});
  let now = Date.parse('2026-10-05T01:00:00Z');
  const app = createApp({db,serveStatic:false,logger:()=>{},studyWorkspaceOptions:{now:()=>now}});
  const server = app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`, cookies={};
  async function request(path,body,cookie,method=body?'POST':'GET') { const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)}); return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}; }
  try {
    for(const username of ['student','other','teacher'])cookies[username]=(await request('/api/auth/login',{username,password:'StudyTest123!'})).cookie;
    const path='/api/student/study-workspace';
    assert.equal((await request(path)).status,401);
    assert.equal((await request(path,null,cookies.teacher)).status,403);
    const p=(await request(path+'/plans',{title:'学习全加器',date:'2026-10-05',minutes:25,target:{kind:'lab',id:'full-adder'}},cookies.student)).body.plan;
    assert.equal((await request(path+'/plans/'+p.id+'/complete',{revision:p.revision},cookies.other)).status,404);
    assert.equal((await request(path+'/plans',{title:'无效日期',date:'2026-02-30',minutes:25},cookies.student)).status,400);
    let timer=(await request(path+'/timer',{planId:p.id,clientId:'http-study-timer-1',minutes:1},cookies.student)).body.timer;
    now+=30000;
    timer=(await request(path+`/timer/${timer.id}/pause`,{revision:timer.revision},cookies.student)).body.timer;
    assert.equal(timer.elapsedMs,30000);
    const saved=(await request(path,null,cookies.student)).body; assert.equal(saved.active.id,timer.id); assert.equal(saved.plans[0].id,p.id);
    assert.equal((await request(path+`/timer/${timer.id}/finish`,{revision:timer.revision,outcome:'私人成果'},cookies.other)).status,404);
    assert.equal((await request(path+`/timer/${timer.id}/resume`,{revision:1},cookies.student)).status,409);
    await request(path+`/timer/${timer.id}/finish`,{revision:timer.revision,outcome:'找到了进位路径',question:'如何区分溢出？',elapsedMs:10000000},cookies.student);
    const result=(await request(path,null,cookies.student)).body;
    assert.equal(result.week.focusMs,30000); assert.equal(result.history[0].question,'如何区分溢出？'); assert.equal(result.plans[0].status,'pending');
    const own=(await request('/api/teacher/study-workspace',null,cookies.teacher)).body; assert.equal(own.plans.length,0); assert.equal(own.history.length,0);
    const teacherPlan=await request('/api/teacher/study-workspace/plans',{title:'教师个人试练',date:'2026-10-05',minutes:20,target:{kind:'chapter',id:'ch3'}},cookies.teacher); assert.equal(teacherPlan.status,200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM challenge_attempts').get().n,0);
  } finally { await new Promise(r=>{server.close(r);server.closeAllConnections();});db.close(); }
});
