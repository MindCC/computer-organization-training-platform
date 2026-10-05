import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase,migrate,createUser } from './db.js';
import { hashPassword } from './auth.js';
const input={profile:{name:'阿禾',occupation:'学生',personality:'耐心'},requirements:'表格、文档、SSD、8GB内存、256GB空间',budget:2200};
const story={summary:'办公需求',reasoning:'SSD更适合日常响应。',targets:{cpu:45,memory:8,storageCapacity:256,storageSpeed:70,gpu:30},questions:[],nodes:[{id:'hello',text:'想让日常文档打开快一些。',choices:[{label:'先看够用的配置',next:null}]}]};
const parts={cpu:'cpu-i3',memory:'mem-8',storage:'ssd-512',gpu:'gpu-integrated'};
async function setup(customCustomerOptions){
  const db=openDatabase(':memory:');migrate(db);const passwordHash=await hashPassword('Student123!');
  for(const username of ['one','two'])createUser(db,{username,displayName:username,role:'student',passwordHash});
  createUser(db,{username:'teacher',displayName:'teacher',role:'teacher',passwordHash});
  const app=createApp({db,serveStatic:false,customCustomerOptions}),server=app.listen(0);await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(route,{cookie='',body,method=body?'POST':'GET',headers={}}={}){
    const response=await fetch(base+route,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const login=async username=>(await request('/api/auth/login',{body:{username,password:'Student123!'}})).cookie;
  return {db,server,request,login,close:async()=>{await new Promise(r=>server.close(r));db.close();}};
}
test('custom orders enforce ownership, server grading, valid parts and idempotent receipts without classroom progress',async()=>{
  const env={DEEPSEEK_API_KEY:'test'},s=await setup({env,aiRequester:async()=>JSON.stringify(story)});
  try{
    const one=await s.login('one'),two=await s.login('two');
    assert.equal((await s.request('/api/student/custom-customers/status')).status,401);
    const created=await s.request('/api/student/custom-customers',{cookie:one,body:input});assert.equal(created.status,201);const id=created.data.order.id;
    assert.equal((await s.request(`/api/student/custom-customers/${id}`,{cookie:two})).status,404);
    assert.equal((await s.request(`/api/student/custom-customers/${id}`,{cookie:one,headers:{'x-custom-student':'999'}})).status,403);
    const path=`/api/student/custom-customers/${id}/receipts`;
    assert.equal((await s.request(path,{cookie:two,body:{selection:parts,operationId:'operation-1'}})).status,404);
    assert.equal((await s.request(path,{cookie:one,body:{selection:{...parts,cpu:'invented'},operationId:'operation-1'}})).status,400);
    const submitted=await s.request(path,{cookie:one,body:{selection:parts,operationId:'operation-1',targets:{budget:0},score:0}});
    assert.equal(submitted.status,201);assert.equal(submitted.data.result.passed,true);assert.equal(submitted.data.result.score,100);assert.equal(submitted.data.result.targets.budget,2200);
    assert.equal((await s.request(path,{cookie:one,body:{selection:parts,operationId:'operation-1'}})).status,200);
    assert.equal((await s.request(path,{cookie:one,body:{selection:{...parts,memory:'mem-16'},operationId:'operation-1'}})).status,409);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM custom_customer_receipts').get().n,1);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM challenge_attempts').get().n,0);
  }finally{await s.close();}
});
test('missing AI config, bad AI response and incomplete requirements create no usable order',async()=>{
  const disabled=await setup({env:{}});try{const cookie=await disabled.login('one');const result=await disabled.request('/api/student/custom-customers',{cookie,body:input});assert.equal(result.status,503);assert.equal(result.data.error.code,'AI_DISABLED');assert.equal(disabled.db.prepare('SELECT COUNT(*) AS n FROM custom_customer_orders').get().n,0);}finally{await disabled.close();}
  const s=await setup({env:{DEEPSEEK_API_KEY:'test'},aiRequester:async()=>JSON.stringify({...story,targets:null,questions:['资料需要多大空间？']})});
  try{const cookie=await s.login('one');const created=await s.request('/api/student/custom-customers',{cookie,body:input});assert.equal(created.status,201);assert.equal((await s.request(`/api/student/custom-customers/${created.data.order.id}/receipts`,{cookie,body:{selection:parts,operationId:'operation-1'}})).status,409);}finally{await s.close();}
  const invalid=await setup({env:{DEEPSEEK_API_KEY:'test'},aiRequester:async()=> 'invalid json'});try{const cookie=await invalid.login('one');const result=await invalid.request('/api/student/custom-customers',{cookie,body:input});assert.equal(result.status,502);assert.equal(result.data.error.code,'AI_RESPONSE');assert.equal(invalid.db.prepare('SELECT COUNT(*) AS n FROM custom_customer_orders').get().n,0);}finally{await invalid.close();}
});

test('teachers have private custom customer practice with student account isolation',async()=>{
  const s=await setup({env:{DEEPSEEK_API_KEY:'test'},aiRequester:async()=>JSON.stringify(story)});
  try{
    const teacher=await s.login('teacher'),student=await s.login('one');
    assert.equal((await s.request('/api/teacher/custom-customers/status',{cookie:teacher})).status,200);
    assert.equal((await s.request('/api/teacher/custom-customers/status',{cookie:student})).status,403);
    assert.equal((await s.request('/api/student/custom-customers/status',{cookie:teacher})).status,403);
    const created=await s.request('/api/teacher/custom-customers',{cookie:teacher,body:input});assert.equal(created.status,201);
    const id=created.data.order.id,path=`/api/teacher/custom-customers/${id}/receipts`;
    assert.equal((await s.request(`/api/student/custom-customers/${id}`,{cookie:student})).status,404);
    const result=await s.request(path,{cookie:teacher,body:{selection:parts,operationId:'teacher-trial-1'}});assert.equal(result.status,201);assert.equal(result.data.result.score,100);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM challenge_attempts').get().n,0,'custom trials do not create classroom grades');
  }finally{await s.close();}
});
