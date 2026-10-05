import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase,migrate,createUser,createClass } from './db.js';
import { hashPassword } from './auth.js';
import { taskChainTemplate } from '../src/shared/classroomTaskChain.js';

async function setup(requester) {
  const db=openDatabase(':memory:');migrate(db);
  const passwordHash=await hashPassword('ChainTest123!');
  const teacher=createUser(db,{username:'chain-teacher',role:'teacher',displayName:'教师',passwordHash});
  const other=createUser(db,{username:'chain-other',role:'teacher',displayName:'另一位教师',passwordHash});
  createUser(db,{username:'chain-student',role:'student',displayName:'学生',passwordHash});
  const classId=createClass(db,teacher.id,'生成课堂').id,otherClass=createClass(db,other.id,'别班').id;
  const app=createApp({db,serveStatic:false,logger:()=>{},taskChainGeneratorOptions:{env:{DEEPSEEK_API_KEY:'test'},requester}});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  async function request(path,{cookie,...options}={}){
    const res=await fetch(url+path,{...options,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...options.headers}});
    return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  }
  const cookies={};for(const user of ['chain-teacher','chain-other','chain-student'])cookies[user]=(await request('/api/auth/login',{method:'POST',body:JSON.stringify({username:user,password:'ChainTest123!'})})).cookie;
  const post=(body,cookie=cookies['chain-teacher'],id=classId)=>request(`/api/teacher/classes/${id}/task-chain/generate`,{cookie,method:'POST',body:JSON.stringify(body)});
  return {db,cookies,classId,otherClass,post,close:async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});db.close();}};
}

test('real generation route enforces class ownership, isolates records and produces only a candidate',async()=>{
  let calls=0,sent='';const s=await setup(async(_config,messages)=>{calls++;sent=JSON.stringify(messages);return JSON.stringify(taskChainTemplate('twos'));});
  try {
    const payload={prompt:'补码运算课堂',consent:'deepseek-task-chain',students:'PRIVATE_STUDENTS',notes:'PRIVATE_NOTES',grades:'PRIVATE_GRADES'};
    assert.equal((await s.post(payload,null)).status,401);
    assert.equal((await s.post(payload,s.cookies['chain-student'])).status,403);
    assert.equal((await s.post(payload,s.cookies['chain-other'])).status,404);
    assert.equal((await s.post(payload,s.cookies['chain-teacher'],s.otherClass)).status,404);
    assert.equal(calls,0);
    assert.equal((await s.post({prompt:'补码课堂'})).status,400);
    const result=await s.post(payload);assert.equal(result.status,200);assert.equal(result.body.source,'deepseek');assert.equal(result.body.taskChain.stages.length,6);assert.equal(calls,1);assert.ok(!sent.includes('PRIVATE_'));
    assert.equal(s.db.prepare('SELECT count(*) n FROM classroom_sessions').get().n,0);
  }finally{await s.close();}
});

test('parallel generation is bounded per teacher and returns a retryable busy message',async()=>{
  let release,started;const ready=new Promise(resolve=>{started=resolve;});
  const s=await setup(async()=>{started();await new Promise(resolve=>{release=resolve;});return JSON.stringify(taskChainTemplate('twos'));});
  try {
    const first=s.post({prompt:'补码课堂',consent:'deepseek-task-chain'});await ready;
    const busy=await s.post({prompt:'补码课堂',consent:'deepseek-task-chain'});assert.equal(busy.status,429);assert.equal(busy.body.error.code,'AI_BUSY');release();assert.equal((await first).status,200);
  }finally{release?.();await s.close();}
});
