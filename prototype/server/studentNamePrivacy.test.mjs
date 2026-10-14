import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase, createUser, createClass, addStudentToClass, getUserById } from './db.js';
import { hashPassword } from './auth.js';
import { maskStudentName, projectStudentNames, studentNamePrivacyEnabled } from './studentNamePrivacy.js';

test('privacy defaults to production and handles short, long and Unicode names without mutating data',()=>{
 assert.equal(studentNamePrivacyEnabled({}, {NODE_ENV:'production'}),true);
 assert.equal(studentNamePrivacyEnabled({}, {NODE_ENV:'development'}),false);
 assert.equal(studentNamePrivacyEnabled({}, {MASK_STUDENT_NAMES:'1'}),true);
 assert.equal(studentNamePrivacyEnabled({}, {NODE_ENV:'production',MASK_STUDENT_NAMES:'0'}),false);
 assert.equal(studentNamePrivacyEnabled({maskStudentNames:false},{NODE_ENV:'production'}),false);
 for(const [input,expected] of [['张晓明','张*明'],['李明','李*'],['欧阳晓明','欧**明'],['𠮷小明','𠮷*明'],['王','*'],['','']])assert.equal(maskStudentName(input),expected);
 const date=new Date(),source={student:{role:'student',displayName:'张晓明'},teacher:{role:'teacher',displayName:'张晓明'},riskStudents:[{studentId:1,name:'旧姓名'}],notes:[{authorName:'张晓明',authorRole:'student'},{authorName:'张晓明',authorRole:'teacher'}],username:'20260001',date};
 const projected=projectStudentNames(source,new Set(['张晓明']));
 assert.equal(projected.student.displayName,'张*明');assert.equal(projected.teacher.displayName,'张晓明');
 assert.equal(projected.riskStudents[0].name,'旧*名');assert.equal(projected.notes[0].authorName,'张*明');assert.equal(projected.notes[1].authorName,'张晓明');
 assert.equal(projected.username,'20260001');assert.equal(projected.date,date);assert.equal(source.student.displayName,'张晓明');
});

test('online identity responses and exports mask students without changing accounts or saved names',async()=>{
 const db=openDatabase(':memory:');
 const app=createApp({db,serveStatic:false,logger:()=>{},maskStudentNames:true});
 const password='Privacy-Test-123!',passwordHash=await hashPassword(password);
 const teacher=createUser(db,{username:'privacy-teacher',displayName:'隐私教师',role:'teacher',passwordHash});
 const student=createUser(db,{username:'20260001',displayName:'张晓明',role:'student',passwordHash,profile:{mode:'适中提示模式',mustChangePassword:false}});
 const cls=createClass(db,teacher.id,'测试教学班');addStudentToClass(db,cls.id,student.id);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function request(path,{body,cookie,method=body?'POST':'GET'}={}){
  const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0],data:response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text()};
 }
 try{
  const t=await request('/api/auth/login',{body:{username:'privacy-teacher',password}});
  const s=await request('/api/auth/login',{body:{username:'20260001',password}});
  assert.equal(t.status,200);assert.equal(t.data.user.displayName,'隐私教师');
  assert.equal(s.status,200);assert.equal(s.data.user.displayName,'张*明');assert.equal(s.data.user.username,'20260001');
  const me=await request('/api/auth/me',{cookie:s.cookie});assert.equal(me.data.user.displayName,'张*明');
  for(const suffix of ['overview','export.csv','study-engagement','study-engagement/export.csv','learning-coach/export.csv']){
   const result=await request(`/api/teacher/classes/${cls.id}/${suffix}`,{cookie:t.cookie});
   assert.equal(result.status,200,suffix);
   const text=typeof result.data==='string'?result.data:JSON.stringify(result.data);
   assert.ok(text.includes('张*明'),suffix);assert.ok(!text.includes('张晓明'),suffix);
  }
  const report=await request('/api/student/report.md',{cookie:s.cookie});assert.equal(report.status,200);assert.ok(report.data.includes('张*明'));assert.ok(!report.data.includes('张晓明'));
  // Saving an untouched masked settings form must not overwrite the original roster name.
  const settings=await request('/api/auth/settings',{method:'PUT',cookie:s.cookie,body:{displayName:'张*明',mode:'挑战模式'}});
  assert.equal(settings.status,200);assert.equal(getUserById(db,student.id).display_name,'张晓明');assert.equal(settings.data.user.displayName,'张*明');
  const profile=await request('/api/student/profile',{method:'PUT',cookie:s.cookie,body:{displayName:'张*明',goal:'练习补码'}});
  assert.equal(profile.status,200);assert.equal(getUserById(db,student.id).display_name,'张晓明');
  const rename=await request('/api/auth/settings',{method:'PUT',cookie:s.cookie,body:{displayName:'李明',mode:'适中提示模式'}});
  assert.equal(rename.status,200);assert.equal(rename.data.user.displayName,'李*');assert.equal(getUserById(db,student.id).display_name,'李明');
  assert.equal((await request('/api/auth/me',{cookie:s.cookie})).data.user.displayName,'李*');
 }finally{await new Promise(r=>{server.close(r);server.closeAllConnections();});db.close();}
});
