import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate, createUser } from './db.js';
import { saveAiConversation } from './aiConversationRepository.js';
import { questionOf } from '../src/assignmentQuestions.js';
import { matchStudyConcepts } from './studyRecommendationTopics.js';
import { recommendations, startRemediation, remediationSession, submitRemediation, feedbackRecommendation, sparkSummary } from './studyRecommendations.js';

const now = new Date('2026-10-09T06:00:00Z');
function fixture(t) {
  const db = openDatabase(':memory:'); migrate(db); t.after(() => db.close());
  const user = createUser(db, { username:'learner', displayName:'学习者', role:'student', passwordHash:'test' });
  const other = createUser(db, { username:'other', displayName:'另一人', role:'student', passwordHash:'test' });
  return { db, id:user.id, other:other.id };
}
function ask(db,id,question='补码表示与转换为什么这样计算？',answer={ source:'local' }, context={ conceptId:'concept-twos-complement' }) {
  const row = saveAiConversation(db,{studentId:id,kind:'question',question,answer,context});
  db.prepare('UPDATE ai_conversations SET created_at=? WHERE id=?').run('2026-10-09T05:00:00Z',row);
}
function practice(db,id,correct,questionId='ch2-q02',at='2026-10-09T05:30:00Z') {
  db.prepare('INSERT INTO chapter_practice_attempts (student_id,chapter_id,client_submission_id,answers_json,results_json,created_at) VALUES (?,?,?,?,?,?)')
    .run(id,'ch2',crypto.randomUUID(),JSON.stringify({[questionId]:correct?questionOf(questionId).answer:'错误答案'}),JSON.stringify({[questionId]:{correct}}),at);
}
function respond(db,id,session,correct=true,at=now) {
  return submitRemediation(db,id,session.id,{action:'answer',questionId:session.question.id,value:correct?questionOf(session.question.id).answer:'错误答案'},at);
}

test('cold start offers diagnosis, questions alone are clues and rejected questions are excluded',t=>{
  const {db,id,other}=fixture(t);
  assert.equal(recommendations(db,id,now).items[0].kind,'diagnosis');
  ask(db,id); ask(db,other);
  const item=recommendations(db,id,now).items[0];
  assert.equal(item.conceptId,'concept-twos-complement'); assert.equal(item.kind,'diagnosis');
  assert.match(item.reason,/提问/); assert.match(item.evidenceLabel,/线索/);
  assert.equal(sparkSummary(db,id,now).totalPoints,0);
  ask(db,id,'CPU 推荐电影',{source:'local',reason:'COURSE_SCOPE_REJECTED'},{conceptId:'concept-cpu-registers'});
  assert(!recommendations(db,id,now).items.some(x=>x.conceptId==='concept-cpu-registers'));
});

test('local history matching identifies specific concepts and leaves ambiguous broad topics unclassified',()=>{
  assert(matchStudyConcepts('补码怎么算').includes('concept-twos-complement'));
  assert(matchStudyConcepts('Cache映射为什么要分组').includes('concept-cache-mapping'));
  assert(!matchStudyConcepts('program 的运行').includes('concept-sram-dram'));
  assert.deepEqual(matchStudyConcepts('Cache 是什么'),[]);
});

test('wrong answers corroborate difficulty, feedback cools down and new errors reopen it',t=>{
  const {db,id}=fixture(t); ask(db,id); practice(db,id,false);
  const item=recommendations(db,id,now).items[0]; assert.equal(item.kind,'remediation'); assert.match(item.reason,/错题/);
  feedbackRecommendation(db,id,item.conceptId,'not-difficulty',now);
  assert(!recommendations(db,id,now).items.some(x=>x.conceptId===item.conceptId));
  practice(db,id,false,'ch2-q04','2026-10-09T06:01:00Z');
  assert(recommendations(db,id,new Date('2026-10-09T06:02:00Z')).items.some(x=>x.conceptId===item.conceptId));
});

test('recommendations stay within three actions, diversify chapters and prioritize an evidenced prerequisite',t=>{
  const {db,id}=fixture(t);
  const entries=[['concept-half-adder','半加器'],['concept-full-adder','全加器'],['concept-full-adder','全加器'],['concept-cache-mapping','Cache 地址映像'],['concept-cpu-registers','CPU 寄存器与状态'],['concept-bus-functions','总线功能']];
  for(const [conceptId,title] of entries)ask(db,id,`${title}为什么这样工作？`,{source:'local'},{conceptId});
  const items=recommendations(db,id,now).items;
  assert.equal(items.length,3);assert.equal(items[0].conceptId,'concept-half-adder');
  assert.match(items[0].reason,/前置基础/);assert.equal(new Set(items.map(i=>i.chapterId)).size,3);
});

test('two distinct later correct questions reduce old difficulty, one repeated question does not',t=>{
  const {db,id}=fixture(t); ask(db,id); practice(db,id,false);
  practice(db,id,true,'ch2-q02'); practice(db,id,true,'ch2-q02');
  assert(recommendations(db,id,now).items.some(x=>x.conceptId==='concept-twos-complement'));
  practice(db,id,true,'ch2-q04');
  assert(!recommendations(db,id,now).items.some(x=>x.conceptId==='concept-twos-complement'));
  const review=recommendations(db,id,new Date(now.getTime()+8*86400000)).items.find(x=>x.conceptId==='concept-twos-complement');
  assert.equal(review.kind,'review');assert.match(review.reason,/间隔自测/);
});

test('guided learning is server graded, account owned, replay safe and retest uses another question',t=>{
  const {db,id,other}=fixture(t); ask(db,id);
  let s=startRemediation(db,id,'concept-twos-complement',now);
  assert.equal(startRemediation(db,id,s.conceptId,now).id,s.id);
  assert.equal(s.question.answer,undefined); assert.equal(s.question.analysis,undefined);
  assert.throws(()=>remediationSession(db,other,s.id),/不存在/);
  assert.throws(()=>submitRemediation(db,id,s.id,{action:'answer',questionId:'ch2-q04',value:'-1'},now),/当前题目/);
  s=respond(db,id,s,false); assert.equal(s.stage,'learning');
  const replay=submitRemediation(db,id,s.id,{action:'answer',questionId:s.lastResult.questionId,value:'错误答案'},now);
  assert.deepEqual(replay,s);
  s=submitRemediation(db,id,s.id,{action:'continue'},now); assert.equal(s.stage,'practice');
  s=respond(db,id,s,false); assert.equal(s.stage,'practice');
  s=submitRemediation(db,id,s.id,{action:'retry'},now);
  const practiceQuestion=s.question.id;
  s=respond(db,id,s); assert.equal(s.stage,'retest'); assert.notEqual(s.question.id,practiceQuestion);
  s=respond(db,id,s); assert.equal(s.stage,'complete'); assert.equal(s.verified,true);
  assert.equal(remediationSession(db,id,s.id).verified,true);
  const spark=sparkSummary(db,id,now); assert.equal(spark.todayPoints,10); assert.equal(spark.breakthroughs,1);
  assert.equal(submitRemediation(db,id,s.id,{action:'answer',questionId:s.lastResult.questionId,value:questionOf(s.lastResult.questionId).answer},now).stage,'complete');
  assert.equal(sparkSummary(db,id,now).totalPoints,spark.totalPoints);
  assert.equal(sparkSummary(db,other,now).totalPoints,0);
  assert(!recommendations(db,id,now).items.some(x=>x.conceptId===s.conceptId));
});

test('single-question coverage never claims a verified retest',t=>{
  const {db,id}=fixture(t);
  let s=startRemediation(db,id,'concept-radix-conversion',now); s=respond(db,id,s);
  s=submitRemediation(db,id,s.id,{action:'continue'},now); s=respond(db,id,s);
  assert.equal(s.stage,'complete'); assert.equal(s.verified,false); assert.match(s.limitation,/题量不足/);
  assert.equal(sparkSummary(db,id,now).breakthroughs,0);
});

test('seeing a retest solution then repeating it does not count as a breakthrough',t=>{
  const {db,id}=fixture(t);
  let s=startRemediation(db,id,'concept-full-adder',now);s=respond(db,id,s);
  s=submitRemediation(db,id,s.id,{action:'continue'},now);s=respond(db,id,s);
  s=respond(db,id,s,false);s=submitRemediation(db,id,s.id,{action:'retry'},now);s=respond(db,id,s);
  assert.equal(s.verified,false);assert.match(s.limitation,/展示过答案/);
  assert.equal(sparkSummary(db,id,now).breakthroughs,0);
});

test('concepts without questions allow reading only, give no spark and retain insufficient evidence',t=>{
  const {db,id}=fixture(t);
  let s=startRemediation(db,id,'concept-computer-applications',now);assert.equal(s.stage,'learning');assert.equal(s.question,null);
  s=submitRemediation(db,id,s.id,{action:'continue',score:100,verified:true},now);
  assert.equal(s.verified,false);assert.equal(sparkSummary(db,id,now).totalPoints,0);
});

test('Beijing day boundary, daily caps and streak use effective evidence only',t=>{
  const {db,id}=fixture(t);
  for(let i=0;i<5;i++)practice(db,id,true,'ch2-q02','2026-10-08T16:01:00Z');
  practice(db,id,true,'ch2-q04','2026-10-08T15:59:00Z');
  const spark=sparkSummary(db,id,now); assert.equal(spark.todayPoints,2); assert.equal(spark.totalPoints,4); assert.equal(spark.streak,2);
  assert.equal(sparkSummary(db,id,new Date('2026-10-11T06:00:00Z')).streak,0);
});
