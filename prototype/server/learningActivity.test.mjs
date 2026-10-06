import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase, migrate, createUser, recordStudentAttempt, recordDemoAttempt } from './db.js';
import { hashPassword } from './auth.js';

test('learning calendars read only the current account and enforce each role endpoint', async()=>{
  const db=openDatabase(':memory:');migrate(db);const passwordHash=await hashPassword('CalendarTest123!');
  const users={};for(const role of ['teacher','student'])users[role]=createUser(db,{username:role,displayName:role,role,passwordHash});
  recordStudentAttempt(db,users.teacher.id,'full-adder',{score:50,passed:false,elapsedMinutes:7});
  recordStudentAttempt(db,users.student.id,'half-adder',{score:100,passed:true,elapsedMinutes:3});
  recordDemoAttempt(db,users.teacher.id,'ch3-alu',{score:50,total:2,correct:1,elapsedMinutes:4});
  const server=createApp({db,serveStatic:false,logger:()=>{}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const cookies={};for(const role of ['teacher','student']){const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:role,password:'CalendarTest123!'})});assert.equal(response.status,200);cookies[role]=response.headers.get('set-cookie').split(';')[0];}
    const get=(role,identity)=>fetch(base+`/api/${role}/activity`,{headers:{cookie:cookies[identity]}});
    const teacher=await get('teacher','teacher');assert.equal(teacher.status,200);const data=await teacher.json();assert.deepEqual(data.challenges.map(c=>[c.challengeId,c.attempts,c.minutes]),[['full-adder',1,7]]);assert.equal(data.demos[0].minutes,4);assert.equal(data.demos[0].correct,1);
    const student=await get('student','student');assert.equal(student.status,200);assert.deepEqual((await student.json()).challenges.map(c=>c.challengeId),['half-adder']);
    assert.equal((await get('teacher','student')).status,403);assert.equal((await get('student','teacher')).status,403);
    const report=await fetch(base+'/api/teacher/report.md',{headers:{cookie:cookies.teacher}});assert.equal(report.status,200);assert.match(report.headers.get('content-type'),/text\/markdown/);const markdown=await report.text();assert.match(markdown,/full-adder \| 进行中 \| 50 \| 1 \| 7 分钟/);assert.match(markdown,/half-adder \| 未解锁 \| 0 \| 0 \| 0 分钟/);assert.match(markdown,/课堂演示练习/);
    assert.equal((await fetch(base+'/api/teacher/report.md',{headers:{cookie:cookies.student}})).status,403);
    const cpu=await fetch(base+'/api/teacher/cpu-practice',{headers:{cookie:cookies.teacher}});assert.equal(cpu.status,200);const cpuRun=(await cpu.json()).run;assert.equal(cpuRun.student_id,users.teacher.id);
    assert.equal((await fetch(base+'/api/teacher/cpu-practice',{headers:{cookie:cookies.student}})).status,403);
    const cpuSave=await fetch(base+'/api/teacher/cpu-practice/events',{method:'POST',headers:{cookie:cookies.teacher,'content-type':'application/json'},body:JSON.stringify({baseRevision:0,batchId:'teacher-test',events:[{eventId:'teacher-step',type:'cpu.stepMicro',payload:{source:'HALT'}}]})});assert.equal(cpuSave.status,200);assert.equal((await cpuSave.json()).run.state.revision,1);
    const studentCpu=await fetch(base+'/api/student/cpu-practice',{headers:{cookie:cookies.student}});assert.equal((await studentCpu.json()).run.state.revision,0);
    const hint=await fetch(base+'/api/teacher/lab-assistant',{method:'POST',headers:{cookie:cookies.teacher,'content-type':'application/json'},body:JSON.stringify({})});assert.equal(hint.status,400);
    assert.equal((await fetch(base+'/api/teacher/lab-assistant',{method:'POST',headers:{cookie:cookies.student,'content-type':'application/json'},body:'{}'})).status,403);
  }finally{await new Promise(r=>{server.close(r);server.closeAllConnections();});db.close();}
});
