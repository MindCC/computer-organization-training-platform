import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { hashPassword } from "./auth.js";
import { createUser, migrate, openDatabase } from "./db.js";
import { questionsForChapter } from "../src/assignmentQuestions.js";

async function fixture() {
  const db = openDatabase(":memory:"); migrate(db);
  const hash = await hashPassword("Student123!");
  const teacher = createUser(db, {username:"teacher",displayName:"教师",role:"teacher",passwordHash:hash});
  const student = createUser(db, {username:"student",displayName:"学生",role:"student",passwordHash:hash});
  createUser(db, {username:"other",displayName:"另一位学生",role:"student",passwordHash:hash});
  const app = createApp({db,serveStatic:false,assistantOptions:{env:{}}});
  const server = app.listen(0); await new Promise(resolve=>server.once("listening",resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path,jar={},payload,method=payload===undefined?"GET":"POST") {
    const response=await fetch(base+path,{method,headers:{...(jar.cookie?{cookie:jar.cookie}:{}),...(payload===undefined?{}:{"content-type":"application/json"})},body:payload===undefined?undefined:JSON.stringify(payload)});
    const cookie=response.headers.get("set-cookie");if(cookie)jar.cookie=cookie.split(";")[0];
    return {status:response.status,body:await response.json()};
  }
  const studentJar={},otherJar={},teacherJar={};
  for(const [username,jar] of [["student",studentJar],["other",otherJar],["teacher",teacherJar]])await request("/api/auth/login",jar,{username,password:"Student123!"});
  return {db,student,teacher,request,studentJar,otherJar,teacherJar,close:async()=>{await new Promise(resolve=>server.close(resolve));db.close();}};
}

test("题库练习服务端判分、错题订正与复发、持久化、账号隔离和幂等重试",async()=>{
  const f=await fixture();try{
    const q=questionsForChapter("ch1").find(q=>q.type==="choice");const wrong=q.options.find(option=>option!==q.answer);
    const payload={chapterId:"ch1",answers:{[q.id]:wrong},clientSubmissionId:"practice-wrong-001",score:100,passed:true};
    assert.equal((await f.request("/api/student/chapter-practice",{},payload)).status,401);
    assert.equal((await f.request("/api/student/chapter-practice",f.teacherJar,payload)).status,403);
    const submitted=await f.request("/api/student/chapter-practice",f.studentJar,payload);assert.equal(submitted.status,201);assert.equal(submitted.body.results[q.id].correct,false);
    assert.equal((await f.request("/api/student/chapter-practice",f.studentJar,payload)).status,200);
    assert.equal((await f.request("/api/student/chapter-practice",f.studentJar,{...payload,answers:{[q.id]:q.answer}})).status,409);
    let book=(await f.request("/api/student/mistakes",f.studentJar)).body;
    const item=book.items.find(item=>item.questionId===q.id);assert.equal(item.source,"practice");assert.equal(item.count,1);assert.equal(item.studentAnswer,wrong);assert.equal(item.referenceAnswer,q.answer);assert.equal(item.navigation.questionId,q.id);
    assert.equal((await f.request("/api/student/mistakes",f.otherJar)).body.items.length,0);
    assert.equal((await f.request("/api/student/chapter-practice",f.studentJar)).body.answers[q.id],wrong);
    assert.equal((await f.request("/api/student/chapter-practice",f.otherJar)).body.graded[q.id],undefined);
    await f.request("/api/student/chapter-practice",f.studentJar,{...payload,answers:{[q.id]:q.answer},clientSubmissionId:"practice-correct-002"});
    book=(await f.request("/api/student/mistakes",f.studentJar)).body;assert.equal(book.items.find(item=>item.questionId===q.id).resolved,true);
    await f.request("/api/student/chapter-practice",f.studentJar,{...payload,clientSubmissionId:"practice-wrong-003"});
    book=(await f.request("/api/student/mistakes",f.studentJar)).body;assert.equal(book.items.find(item=>item.questionId===q.id).resolved,false);assert.equal(book.items.find(item=>item.questionId===q.id).count,2);
    for(const invalid of [{...payload,chapterId:"invalid"},{...payload,answers:{unknown:"x"}},{...payload,chapterId:"ch2"},{...payload,answers:{[q.id]:"x".repeat(3000)}}])assert.equal((await f.request("/api/student/chapter-practice",f.studentJar,{...invalid,clientSubmissionId:"invalid-submit-001"})).status,400);
    await f.request("/api/student/chapter-practice",f.studentJar,{chapterId:"ch1",answers:{[q.id]:""},clientSubmissionId:"practice-empty-004"});
    assert.equal((await f.request("/api/student/mistakes",f.studentJar)).body.items.find(item=>item.questionId===q.id).count,2,"未作答不增加错题");
  }finally{await f.close();}
});

test("作业错题仅来自本人已判分提交，客观题可独立订正且不修改原作业成绩",async()=>{
  const f=await fixture();try{
    const classId=(await f.request("/api/classes",f.teacherJar,{name:"联动班"})).body.class.id;
    f.db.prepare("INSERT INTO class_members (class_id,student_id) VALUES (?,?)").run(classId,f.student.id);
    const assignmentId=(await f.request(`/api/teacher/classes/${classId}/assignments`,f.teacherJar,{title:"组成原理课后作业"})).body.assignment.id;
    const ids=[];
    for(const q of [{type:"choice",stem:"CPU 是什么？",options:["中央处理器","硬盘"],answer:"中央处理器",score:10,explanation:"CPU 执行指令"},{type:"short_answer",stem:"描述指令执行过程",answer:"取指、译码、执行",score:10}]){
      const result=await f.request(`/api/teacher/assignments/${assignmentId}/questions`,f.teacherJar,q);ids.push(result.body.question.id);
    }
    await f.request(`/api/teacher/assignments/${assignmentId}/publish`,f.teacherJar,{});
    await f.request(`/api/student/assignments/${assignmentId}/draft`,f.studentJar,{answers:[{questionId:ids[0],value:"硬盘"}]});
    assert.equal((await f.request("/api/student/mistakes",f.studentJar)).body.items.length,0,"草稿不应泄漏答案或入错题本");
    const submission=(await f.request(`/api/student/assignments/${assignmentId}/submit`,f.studentJar,{answers:[{questionId:ids[0],value:"硬盘"},{questionId:ids[1],value:"只取指"}]})).body.submission;
    let book=(await f.request("/api/student/mistakes",f.studentJar)).body;assert.equal(book.items.length,1,"未批改简答题不纳入错题");assert.equal(book.items[0].source,"assignment");
    await f.request(`/api/teacher/submissions/${submission.id}/grade`,f.teacherJar,{questionScores:ids.map(questionId=>({questionId,score:0})),feedback:"还要说明译码与执行"});
    book=(await f.request("/api/student/mistakes",f.studentJar)).body;assert.equal(book.items.length,2);assert.equal(book.items.find(item=>item.questionId===ids[1]).feedback,"还要说明译码与执行");
    const retry={questionId:ids[0],value:"中央处理器",clientSubmissionId:"assignment-review-001"};
    assert.equal((await f.request("/api/student/mistakes/review",f.otherJar,retry)).status,404);
    const reviewed=await f.request("/api/student/mistakes/review",f.studentJar,retry);assert.equal(reviewed.status,201);assert.equal(reviewed.body.correct,true);
    assert.equal((await f.request("/api/student/mistakes/review",f.studentJar,retry)).status,200);
    assert.equal((await f.request("/api/student/mistakes/review",f.studentJar,{...retry,value:"硬盘"})).status,409);
    assert.equal((await f.request("/api/student/mistakes/review",f.studentJar,{...retry,questionId:ids[1],clientSubmissionId:"assignment-short-002"})).status,400);
    book=(await f.request("/api/student/mistakes",f.studentJar)).body;assert.equal(book.items.find(item=>item.questionId===ids[0]).resolved,true);
    const detail=(await f.request(`/api/student/assignments/${assignmentId}`,f.studentJar)).body;assert.equal(detail.submission.total_score,0);assert.equal(detail.submission.answers.find(answer=>answer.questionId===ids[0]).value,"硬盘");
  }finally{await f.close();}
});
