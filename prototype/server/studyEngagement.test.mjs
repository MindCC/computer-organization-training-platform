import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate, createUser, createClass, addStudentToClass } from './db.js';
import { ASSIGNMENT_QUESTIONS } from '../src/assignmentQuestions.js';
import { saveAiConversation } from './aiConversationRepository.js';
import { engagementSummary, saveEngagementPolicy, classEngagement, confirmEngagementBonus, recordStudyVisit } from './studyEngagement.js';
import { normalizeQuestionObservation } from './questionObservation.js';
import { normalizeDemoAttemptPayload } from './demoValidation.js';

const now = new Date('2026-10-09T08:00:00Z');
function setup() {
  const db=openDatabase(':memory:');migrate(db);
  const teacher=createUser(db,{username:'owner',displayName:'Teacher',role:'teacher',passwordHash:'test'});
  const student=createUser(db,{username:'learner',displayName:'Learner',role:'student',passwordHash:'test'});
  const classroom=createClass(db,teacher.id,'Class');addStudentToClass(db,classroom.id,student.id);
  return {db,teacher,student,classroom};
}
function practice(db,id,q,correct=false,date=now.toISOString(),observation=null) {
  db.prepare(`INSERT INTO chapter_practice_attempts(student_id,chapter_id,client_submission_id,answers_json,results_json,created_at,observations_json) VALUES (?,?,?,?,?,?,?)`)
    .run(id,q.chapterId,crypto.randomUUID(),JSON.stringify({[q.id]:'answer'}),JSON.stringify({[q.id]:{correct}}),date,JSON.stringify(observation?{[q.id]:observation}:{}));
}
test('time observations whitelist fields, reject impossible values, and preserve unknown legacy timings',()=>{
  assert.equal(normalizeQuestionObservation(undefined),null);
  assert.deepEqual(normalizeQuestionObservation({visibleActiveMs:1000,firstAnswerMs:400,inputChanges:2,score:100,hesitation:1}),{visibleActiveMs:1000,firstAnswerMs:400,answerActiveMs:600,inputChanges:2,source:'client-visible'});
  for(const value of [{visibleActiveMs:-1},{visibleActiveMs:100,firstAnswerMs:200},{visibleActiveMs:Infinity},{visibleActiveMs:100,firstAnswerMs:'4'}])assert.throws(()=>normalizeQuestionObservation(value));
  const q={stem:'题目',studentAnswer:'答案',referenceAnswer:'答案',explanation:'解析',correct:true,observation:{visibleActiveMs:2000,firstAnswerMs:500,inputChanges:1,score:999}};
  const result=normalizeDemoAttemptPayload({demoId:'cpu',result:{total:1,correct:1,questions:[q]}});
  assert.equal(result.ok,true);assert.equal(result.result.questions[0].observation.answerActiveMs,1500);assert.equal(result.result.questions[0].observation.score,undefined);
});
test('pure visits/questions yield no rapport; submitted wrong answers count participation once and corrections count follow-through',()=>{
  const {db,student}=setup();try {
    const q=ASSIGNMENT_QUESTIONS.find(q=>q.kpId);
    recordStudyVisit(db,student.id,now);recordStudyVisit(db,student.id,now);
    saveAiConversation(db,{studentId:student.id,kind:'question',question:q.stem,answer:{source:'local'},context:{conceptId:q.kpId}});
    db.prepare('UPDATE ai_conversations SET created_at=? WHERE student_id=?').run(now.toISOString(),student.id);
    let summary=engagementSummary(db,student.id,undefined,now);
    assert.equal(summary.score,0);assert.equal(summary.visits,1);assert.equal(summary.memory.length,1);
    practice(db,student.id,q,false);
    practice(db,student.id,q,false);
    summary=engagementSummary(db,student.id,undefined,now);
    assert.equal(summary.questions,1);assert.equal(summary.correctQuestions,0);assert.equal(summary.activeDays,1);assert.equal(summary.followThrough,0);
    practice(db,student.id,q,true,'2026-10-09T08:00:01Z',{visibleActiveMs:1200,firstAnswerMs:600,answerActiveMs:600,inputChanges:1,source:'client-visible'});
    summary=engagementSummary(db,student.id,undefined,new Date('2026-10-09T08:00:02Z'));
    assert.equal(summary.questions,1);assert.equal(summary.correctQuestions,1);assert.equal(summary.followThrough,1);assert.equal(summary.timings.length,1);
    assert.equal(engagementSummary(db,student.id,{startDate:'2026-10-10',endDate:'2026-10-11'},now).score,0);
  }finally{db.close();}
});
test('teacher cap is explicit, snapshot review is bounded, stale rules/evidence fail, retries cannot multiply bonus, existing grades unchanged',()=>{
  const {db,teacher,student,classroom}=setup();try {
    const q=ASSIGNMENT_QUESTIONS.find(q=>q.kpId);practice(db,student.id,q,true);
    let view=classEngagement(db,teacher.id,classroom.id,now);
    assert.equal(view.policy.bonusCap,0);assert.equal(view.students[0].suggestedBonus,0);
    const policy={startDate:'2026-10-01',endDate:'2026-10-31',bonusCap:5,dayTarget:1,questionTarget:1,labTarget:1,followThroughTarget:1};
    saveEngagementPolicy(db,teacher.id,classroom.id,policy,now);
    view=classEngagement(db,teacher.id,classroom.id,now);assert.equal(view.students[0].suggestedBonus,2.5);
    const row=view.students[0],body={studentId:student.id,reviewToken:row.reviewToken,bonus:row.suggestedBonus,clientSubmissionId:crypto.randomUUID(),reason:''};
    assert.throws(()=>confirmEngagementBonus(db,teacher.id,classroom.id,{...body,bonus:6},now));
    assert.throws(()=>confirmEngagementBonus(db,teacher.id,classroom.id,{...body,bonus:2},now));
    const confirmed=confirmEngagementBonus(db,teacher.id,classroom.id,body,now);
    assert.deepEqual(confirmEngagementBonus(db,teacher.id,classroom.id,body,now),confirmed);
    assert.equal(db.prepare('SELECT count(*) n FROM study_bonus_reviews').get().n,1);
    assert.equal(engagementSummary(db,student.id,undefined,now).confirmedBonuses[0].bonus,2.5);
    practice(db,student.id,ASSIGNMENT_QUESTIONS.find(other=>other.id!==q.id&&other.kpId),true);
    assert.throws(()=>confirmEngagementBonus(db,teacher.id,classroom.id,{...body,clientSubmissionId:crypto.randomUUID()},now),/依据已变化/);
    saveEngagementPolicy(db,teacher.id,classroom.id,{...policy,bonusCap:3},now);
    assert.equal(classEngagement(db,teacher.id,classroom.id,now).students[0].confirmation,null);
    assert.equal(engagementSummary(db,student.id,undefined,now).confirmedBonuses[0].needsReview,true);
    assert.equal(db.prepare('SELECT count(*) n FROM submission_answers').get().n,0);
  }finally{db.close();}
});
test('mixed-source timelines keep the latest question result and distinguish experiments from time-only demo heartbeats',()=>{
  const {db,student}=setup();try {
    const q=ASSIGNMENT_QUESTIONS.find(q=>q.kpId),old=new Date(now.getTime()-10000).toISOString();
    db.prepare('INSERT INTO study_remediation_sessions(student_id,concept_id,state_json,created_at,updated_at) VALUES (?,?,?,?,?)').run(student.id,q.kpId,JSON.stringify({checks:[{questionId:q.id,stage:'diagnosis',correct:true,createdAt:old}]}),old,old);
    practice(db,student.id,q,false);
    const challenge='computer-components';
    for(let i=0;i<2;i++)db.prepare('INSERT INTO challenge_attempts(student_id,challenge_id,passed,elapsed_minutes,created_at) VALUES (?,?,?,?,?)').run(student.id,challenge,1,2,now.toISOString());
    db.prepare('INSERT INTO demo_attempts(student_id,demo_id,total,elapsed_minutes,created_at) VALUES (?,?,?,?,?)').run(student.id,'cpu',0,10,now.toISOString());
    const summary=engagementSummary(db,student.id,undefined,now);
    assert.equal(summary.questions,1);assert.equal(summary.correctQuestions,0);assert.equal(summary.followThrough,0);
    assert.equal(summary.labs,1);assert.equal(summary.completedLabs,1);assert.equal(summary.labDetails[0].submissions,2);assert.equal(summary.labDetails[0].elapsedMinutes,4);
    assert.equal(summary.activeDays,1);
  }finally{db.close();}
});
