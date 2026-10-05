import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase,migrate,createUser,createClass,addStudentToClass } from './db.js';
import { createClassroomSessionService } from './classroomSessionService.js';
import { createClassroomSessionRepository } from './classroomSessionRepository.js';
import { createTaskLibrary } from './taskLibrary.js';
import { questionsForChapter } from '../src/assignmentQuestions.js';
import { knowledgePointOf } from '../src/knowledgePoints.js';

function setup(){
  const db=openDatabase(':memory:');migrate(db);
  const teacher=createUser(db,{username:'teacher',displayName:'教师',role:'teacher',passwordHash:'test'});
  const students=['甲','乙','丙'].map((name,i)=>createUser(db,{username:`student${i}`,displayName:name,role:'student',passwordHash:'test'}));
  const cls=createClass(db,teacher.id,'课程');students.forEach(s=>addStudentToClass(db,cls.id,s.id));
  const service=createClassroomSessionService({db,repository:createClassroomSessionRepository(db)});
  const library=createTaskLibrary({db,sessionService:service});
  return {db,teacher,students,cls,service,library};
}
function config(chapterId,purpose='diagnosis',followUp){
  const qs=chapterId==='ch4'?questionsForChapter(chapterId).filter(q=>q.id===(purpose==='retest'?'ch4-q07':'ch4-q04')):questionsForChapter(chapterId).slice(0,3);
  return {templateKey:'task-chain',durationMinutes:30,passScore:80,taskChain:{title:`${chapterId} 教学闭环`,knowledgePointIds:[...new Set(qs.map(q=>knowledgePointOf(q.kpId).id))],...(followUp?{followUp}:{}),stages:[{id:'quiz',type:'practice',title:purpose,instructions:'',purpose,chapterId,questionIds:qs.map(q=>q.id),completion:'submitted'}]}};
}
function submit(c,session,student,wrong){c.service.enterStudent({studentId:student.id,sessionId:session.id});c.service.completeStage({studentId:student.id,sessionId:session.id,payload:{stageId:'quiz',clientSubmissionId:`answer-${session.id}-${student.id}`,evidence:{answers:Object.fromEntries(JSON.parse(session.config_json).taskChain.stages[0].questionIds.map(id=>[id,wrong?'错误答案':questionsForChapter(id.slice(0,3)).find(q=>q.id===id).answer]))}}});}

test('knowledge diagnosis uses graded question evidence in different chapters; no answers stays unverified',()=>{
  for(const chapterId of ['ch4','ch6']){const c=setup();try{
    const task=c.library.create(c.teacher.id,config(chapterId));const session=c.library.publish(c.teacher.id,task.id,{classId:c.cls.id,revision:1,clientSubmissionId:`publish-${chapterId}`}).session;
    submit(c,session,c.students[0],true);
    const learning=c.library.learning(c.teacher.id,task.id,session.id);
    assert.ok(learning.knowledge.points.some(p=>p.students.find(s=>s.studentId===c.students[0].id)?.correct===0));
    assert.ok(learning.knowledge.points.every(p=>p.students.find(s=>s.studentId===c.students[1].id)?.status==='unverified'));
    assert.ok(learning.knowledge.recommendations.some(r=>r.studentIds.includes(c.students[0].id)));
    assert.equal(learning.knowledge.source,'local-evidence');
  }finally{c.db.close();}}
});
test('targeted follow-ups are isolated, permit disjoint groups, prevent overlaps, and compare matched students',()=>{
  const c=setup();try{
    const task=c.library.create(c.teacher.id,config('ch4'));const source=c.library.publish(c.teacher.id,task.id,{classId:c.cls.id,revision:1,clientSubmissionId:'source-publish'}).session;
    submit(c,source,c.students[0],true);c.service.end({teacherId:c.teacher.id,sessionId:source.id});
    const follow=c.library.create(c.teacher.id,config('ch4','retest',{sourceTaskId:task.id,sourceSessionId:source.id}));
    const payload={classId:c.cls.id,revision:1,targetStudentIds:[c.students[0].id],clientSubmissionId:'follow-publish'};
    const first=c.library.publish(c.teacher.id,follow.id,payload).session;
    assert.equal(c.library.learning(c.teacher.id,follow.id,first.id).summary.totalStudents,1);
    assert.notEqual(c.service.getStudentCurrent({studentId:c.students[1].id}).session?.id,first.id);
    const studentView=c.service.getStudentCurrent({studentId:c.students[0].id});
    assert.equal(JSON.parse(studentView.session.config_json).targetStudentIds,undefined,'student API must not return other recipients');
    assert.throws(()=>c.service.enterStudent({studentId:c.students[1].id,sessionId:first.id}),/对象/);
    assert.throws(()=>c.service.completeStage({studentId:c.students[1].id,sessionId:first.id,payload:{}}),/对象/);
    assert.throws(()=>c.library.publish(c.teacher.id,follow.id,{...payload,targetStudentIds:[c.students[1].id]}),/内容不能更改/);
    assert.throws(()=>c.library.publish(c.teacher.id,follow.id,{...payload,clientSubmissionId:'overlap-publish'}),/其他活动课堂/);
    const second=c.library.publish(c.teacher.id,follow.id,{...payload,targetStudentIds:[c.students[1].id],clientSubmissionId:'group-two-publish'}).session;
    assert.notEqual(first.id,second.id);
    submit(c,first,c.students[0],true);
    const comparison=c.library.learning(c.teacher.id,follow.id,first.id).knowledge.comparison;
    assert.equal(comparison.sourceSessionId,source.id);
    assert.ok(comparison.points.some(p=>p.students.some(s=>s.studentId===c.students[0].id&&s.before!==null&&s.after!==null)));
    assert.ok(comparison.points.every(p=>p.students.every(s=>s.studentId===c.students[0].id)));
    assert.equal(c.library.learning(c.teacher.id,task.id,source.id).followUps.length,2);
  }finally{c.db.close();}
});
test('forged source and class/roster changes are rejected',()=>{
  const c=setup();try{
    assert.throws(()=>c.library.create(c.teacher.id,config('ch4','retest',{sourceTaskId:999,sourceSessionId:999})),/来源/);
    const task=c.library.create(c.teacher.id,config('ch4'));const source=c.library.publish(c.teacher.id,task.id,{classId:c.cls.id,revision:1,clientSubmissionId:'source-publish'}).session;
    const follow=c.library.create(c.teacher.id,config('ch4','retest',{sourceTaskId:task.id,sourceSessionId:source.id}));
    assert.throws(()=>c.library.publish(c.teacher.id,follow.id,{classId:c.cls.id,revision:1,clientSubmissionId:'early-publish',targetStudentIds:[c.students[0].id]}),/结束/);
    c.service.end({teacherId:c.teacher.id,sessionId:source.id});
    assert.throws(()=>c.library.publish(c.teacher.id,follow.id,{classId:c.cls.id,revision:1,clientSubmissionId:'bad-roster-publish',targetStudentIds:[999]}),/学生/);
  }finally{c.db.close();}
});
