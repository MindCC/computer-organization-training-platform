import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate, createUser, createClass, addStudentToClass } from './db.js';
import { createClassroomSessionService } from './classroomSessionService.js';
import { createClassroomSessionRepository } from './classroomSessionRepository.js';
import { createTaskLibrary } from './taskLibrary.js';
import { saveAssistantReport, readAssistantReport } from './teacherAssistantHistory.js';

function setup(){
  const db=openDatabase(':memory:');migrate(db);
  const teacher=createUser(db,{username:'teacher',displayName:'教师',role:'teacher',passwordHash:'test'});
  const other=createUser(db,{username:'other',displayName:'其他教师',role:'teacher',passwordHash:'test'});
  const student=createUser(db,{username:'student',displayName:'学生',role:'student',passwordHash:'test'});
  const cls=createClass(db,teacher.id,'课堂');addStudentToClass(db,cls.id,student.id);
  const service=createClassroomSessionService({db,repository:createClassroomSessionRepository(db)});
  const library=createTaskLibrary({db,sessionService:service});
  const config={templateKey:'task-chain',durationMinutes:30,passScore:80,taskChain:{title:'讨论任务',stages:[{id:'discussion',type:'custom',title:'解释补码',instructions:'用例子解释补码减法',submissionMode:'text',position:{x:100,y:50}}]}};
  return {db,teacher,other,student,cls,service,library,config};
}
test('task library CRUD isolates owners, retains positions and detects stale revisions',()=>{
  const c=setup();try{
    const task=c.library.create(c.teacher.id,c.config);
    assert.equal(c.library.list(c.teacher.id).length,1);assert.equal(c.library.list(c.other.id).length,0);
    assert.throws(()=>c.library.get(c.other.id,task.id),/不存在/);
    assert.deepEqual(task.config.taskChain.stages[0].position,{x:100,y:50});
    const changed=c.library.update(c.teacher.id,task.id,{revision:1,config:{...c.config,taskChain:{...c.config.taskChain,title:'修改后'}}});
    assert.equal(changed.revision,2);assert.equal(changed.title,'修改后');
    assert.throws(()=>c.library.update(c.teacher.id,task.id,{revision:1,config:c.config}),/已被修改/);
    assert.throws(()=>c.library.remove(c.other.id,task.id,2),/不存在/);
    c.library.remove(c.teacher.id,task.id,2);assert.equal(c.library.list(c.teacher.id).length,0);
  }finally{c.db.close();}
});

test('task adoption rejects an assistant report that does not exist',()=>{
  const c=setup();try {
    assert.throws(()=>c.library.create(c.teacher.id,{...c.config,assistantReportId:999999}),/建议来源/);
    assert.equal(c.library.list(c.teacher.id).length,0);
  }finally{c.db.close();}
});

test('adoption preserves a server snapshot, revisions and publication without exposing it to students',()=>{
  const c=setup();try {
    const report={source:'fallback',generatedAt:'2026-10-06T00:00:00.000Z',report:{lessonFocus:'原始重点',nextClassPlan:['原始步骤'],teacherScript:'原始提示',evidence:[{id:'E1',label:'私人错误证据',studentIds:[c.student.id]}]}};
    const saved=saveAssistantReport(c.db,c.teacher.id,c.cls.id,report);
    assert.throws(()=>readAssistantReport(c.db,c.other.id,saved.reportId),/建议来源/);
    assert.throws(()=>c.library.create(c.other.id,{...c.config,assistantReportId:saved.reportId}),/建议来源/);
    report.report.lessonFocus='客户端伪造';
    const config={...c.config,lessonPlan:{focus:'教师修订重点',steps:['独立复测'],teacherScript:'原始提示'}};
    const task=c.library.create(c.teacher.id,{...config,assistantReportId:saved.reportId,decisionNote:'先补充独立诊断',sourceReport:report});
    assert.equal(task.assistantReview.report.report.lessonFocus,'原始重点');
    assert.equal(task.assistantReview.decisions[0].note,'先补充独立诊断');
    assert.deepEqual(task.assistantReview.decisions[0].changedFields,['focus','steps']);
    const updated=c.library.update(c.teacher.id,task.id,{revision:1,config:{...config,lessonPlan:{...config.lessonPlan,teacherScript:'观察反例再提示'}},decisionNote:'增加反例讨论'});
    assert.equal(updated.assistantReview.decisions.length,2);
    assert.equal(updated.assistantReview.decisions[1].lessonPlan.teacherScript,'原始提示');
    assert.throws(()=>c.library.update(c.teacher.id,task.id,{revision:1,config}),/已被修改/);
    assert.equal(c.library.get(c.teacher.id,task.id).assistantReview.decisions.length,2);
    const second=saveAssistantReport(c.db,c.teacher.id,c.cls.id,report);
    assert.throws(()=>c.library.update(c.teacher.id,task.id,{revision:2,config,assistantReportId:second.reportId}),/不能替换/);
    assert.throws(()=>c.library.update(c.teacher.id,task.id,{revision:2,config,decisionNote:{text:'伪造'}}),/调整说明/);
    const publication=c.library.publish(c.teacher.id,task.id,{classId:c.cls.id,revision:2,clientSubmissionId:'publish-assistant-audit'});
    assert.equal(c.library.get(c.teacher.id,task.id).assistantReview.publications[0].revision,2);
    assert.equal(c.library.get(c.teacher.id,task.id).assistantReview.publications[0].sessionId,publication.session.id);
    c.service.enterStudent({studentId:c.student.id,sessionId:publication.session.id});
    assert.doesNotMatch(JSON.stringify(c.service.getStudentCurrent({studentId:c.student.id})),/私人错误证据|sourceReport|assistantReview|reportId/);
    assert.equal(c.library.list(c.teacher.id)[0].assistantReview,undefined,'list must not return private report snapshots');
  }finally{c.db.close();}
});
test('publication is atomic and idempotent; library changes cannot alter classroom evidence',()=>{
  const c=setup();try{
    const task=c.library.create(c.teacher.id,c.config),payload={classId:c.cls.id,revision:1,clientSubmissionId:'publish-request-001'};
    const first=c.library.publish(c.teacher.id,task.id,payload);
    assert.equal(first.session.status,'live');assert.equal(c.library.publish(c.teacher.id,task.id,payload).session.id,first.session.id);
    assert.equal(c.db.prepare('SELECT count(*) n FROM classroom_sessions').get().n,1);
    assert.throws(()=>c.library.publish(c.other.id,task.id,payload),/班级不存在/);
    assert.throws(()=>c.library.publish(c.teacher.id,task.id,{...payload,clientSubmissionId:'publish-request-002'}),/已有进行中/);
    assert.equal(c.db.prepare('SELECT count(*) n FROM classroom_sessions').get().n,1);
    c.service.enterStudent({studentId:c.student.id,sessionId:first.session.id});
    assert.throws(()=>c.service.completeStage({studentId:c.student.id,sessionId:first.session.id,payload:{stageId:'discussion',evidence:{completed:true},clientSubmissionId:'student-custom-001'}}),/10到2000/);
    const complete=c.service.completeStage({studentId:c.student.id,sessionId:first.session.id,payload:{stageId:'discussion',evidence:{text:'用负数的补码作为加数，符号位一起参与运算。'},clientSubmissionId:'student-custom-002'}});
    assert.equal(complete.studentState.status,'completed');assert.equal(complete.result.score,null);
    c.library.update(c.teacher.id,task.id,{revision:1,config:{...c.config,taskChain:{...c.config.taskChain,title:'新版本'}}});
    c.library.remove(c.teacher.id,task.id,2);
    assert.equal(c.library.list(c.teacher.id).length,0,'published sessions are not imported back as duplicate tasks');
    const overview=c.service.getTeacherOverview({teacherId:c.teacher.id,sessionId:first.session.id});
    assert.equal(overview.session.title,'讨论任务');assert.match(overview.students[0].result.stageResults[0].evidence.text,/符号位/);
    c.service.end({teacherId:c.teacher.id,sessionId:first.session.id});
    assert.equal(c.service.getReport({teacherId:c.teacher.id,sessionId:first.session.id}).studentReports[0].completedStages,1);
  }finally{c.db.close();}
});
test('task learning aggregates completion from real classroom records, participation stays unscored',()=>{
  const c=setup();try{
    const task=c.library.create(c.teacher.id,c.config);
    const {session}=c.library.publish(c.teacher.id,task.id,{classId:c.cls.id,revision:1,clientSubmissionId:'publish-learning-001'});
    let learning=c.library.learning(c.teacher.id,task.id);
    assert.equal(learning.summary.totalStudents,1);assert.equal(learning.summary.notStarted,1);assert.equal(learning.summary.completed,0);
    assert.equal(learning.stages.length,1);assert.equal(learning.stages[0].submitted,0);assert.equal(learning.stages[0].completed,0);
    assert.equal(learning.publications.length,1);assert.equal(learning.publications[0].className,'课堂');assert.equal(learning.publications[0].status,'live');
    assert.equal(c.library.list(c.teacher.id)[0].learning.totalStudents,1);
    c.service.enterStudent({studentId:c.student.id,sessionId:session.id});
    learning=c.library.learning(c.teacher.id,task.id);
    assert.equal(learning.summary.inProgress,1);assert.equal(learning.stages[0].inProgress,1);
    c.service.completeStage({studentId:c.student.id,sessionId:session.id,payload:{stageId:'discussion',evidence:{text:'用负数的补码作为加数，符号位一起参与运算。'},clientSubmissionId:'student-learning-001'}});
    learning=c.library.learning(c.teacher.id,task.id);
    assert.equal(learning.summary.completed,1);assert.equal(learning.summary.completionRate,100);
    assert.equal(learning.stages[0].completed,1);assert.equal(learning.stages[0].submitted,1);
    // 参与型环节不计知识成绩：平均分保持 null，不能当成 0 分
    assert.equal(learning.stages[0].averageScore,null);assert.equal(learning.summary.averageScore,null);
    const listed=c.library.list(c.teacher.id)[0];
    assert.equal(listed.learning.completed,1);assert.equal(listed.learning.averageScore,null);
    assert.throws(()=>c.library.learning(c.other.id,task.id),/不存在/);
  }finally{c.db.close();}
});
test('graded stage learning averages the latest real submissions and keeps common errors',()=>{
  const c=setup();try{
    const config={templateKey:'task-chain',durationMinutes:30,passScore:80,taskChain:{title:'诊断任务',stages:[
      {id:'quiz',type:'practice',title:'课前诊断',instructions:'',chapterId:'ch2',questionIds:['ch2-q02','ch2-q04','ch2-q07'],completion:'passed'},
      {id:'wrap',type:'custom',title:'总结确认',instructions:'',submissionMode:'confirm'}]}};
    const task=c.library.create(c.teacher.id,config);
    const {session}=c.library.publish(c.teacher.id,task.id,{classId:c.cls.id,revision:1,clientSubmissionId:'publish-learning-002'});
    c.service.enterStudent({studentId:c.student.id,sessionId:session.id});
    const wrong=Object.fromEntries(['ch2-q02','ch2-q04','ch2-q07'].map(id=>[id,'错误答案']));
    const failed=c.service.completeStage({studentId:c.student.id,sessionId:session.id,payload:{stageId:'quiz',evidence:{answers:wrong},clientSubmissionId:'student-learning-002a'}});
    assert.equal(failed.result.passed,false);assert.equal(failed.result.score,0);
    let learning=c.library.learning(c.teacher.id,task.id);
    assert.equal(learning.stages[0].submitted,1);assert.equal(learning.stages[0].completed,0);assert.equal(learning.stages[0].inProgress,1);
    assert.equal(learning.stages[0].averageScore,0,'真实考出的 0 分要显示');assert.equal(learning.stages[0].topErrors.length,3);
    assert.equal(learning.summary.averageScore,0);
    const right={'ch2-q02':'-128 ~ 127','ch2-q04':'-1','ch2-q07':'11111011'};
    const passed=c.service.completeStage({studentId:c.student.id,sessionId:session.id,payload:{stageId:'quiz',evidence:{answers:right},clientSubmissionId:'student-learning-002b'}});
    assert.equal(passed.result.score,100);
    learning=c.library.learning(c.teacher.id,task.id);
    assert.equal(learning.stages[0].completed,1);assert.equal(learning.stages[0].averageScore,100,'平均分取最近一次真实提交');
    assert.equal(learning.stages[0].topErrors.length,0);
    assert.equal(learning.stages[1].completed,0);assert.equal(learning.stages[1].inProgress,1);
    c.service.completeStage({studentId:c.student.id,sessionId:session.id,payload:{stageId:'wrap',evidence:{completed:true},clientSubmissionId:'student-learning-002c'}});
    learning=c.library.learning(c.teacher.id,task.id);
    assert.equal(learning.summary.completed,1);assert.equal(learning.summary.averageScore,100);
    assert.equal(learning.stages[1].submitted,1);assert.equal(learning.stages[1].averageScore,null);
  }finally{c.db.close();}
});
test('existing classrooms become reusable library copies; deleting a copy never deletes or reimports the classroom',()=>{
  const c=setup();try{
    const existing=c.service.createDraft({teacherId:c.teacher.id,classId:c.cls.id,config:c.config});
    const [task]=c.library.list(c.teacher.id);assert.equal(task.imported,true);
    assert.equal(c.library.list(c.teacher.id).length,1);
    c.library.remove(c.teacher.id,task.id,1);assert.equal(c.library.list(c.teacher.id).length,0);
    assert.equal(c.db.prepare('SELECT title FROM classroom_sessions WHERE id=?').get(existing.id).title,'讨论任务');
    const legacy=c.service.createDraft({teacherId:c.teacher.id,classId:c.cls.id,config:{templateKey:'computer-data-flow',durationMinutes:45,passScore:80}});
    const [converted]=c.library.list(c.teacher.id);assert.equal(converted.config.taskChain.stages.length,4);
    assert.equal(c.db.prepare('SELECT count(*) n FROM classroom_sessions WHERE id=?').get(legacy.id).n,1);
  }finally{c.db.close();}
});

test('learning drilldown preserves the selected historical classroom and separates changed node definitions',()=>{
  const c=setup();try{
    const task=c.library.create(c.teacher.id,c.config);
    const first=c.library.publish(c.teacher.id,task.id,{classId:c.cls.id,revision:1,clientSubmissionId:'history-publish-001'}).session;
    c.service.enterStudent({studentId:c.student.id,sessionId:first.id});
    const text='负数使用补码表示，符号位一起参加加法运算。';
    c.service.completeStage({studentId:c.student.id,sessionId:first.id,payload:{stageId:'discussion',evidence:{text},clientSubmissionId:'history-submit-001'}});
    c.service.end({teacherId:c.teacher.id,sessionId:first.id});
    const updated={...c.config,taskChain:{...c.config.taskChain,stages:[{...c.config.taskChain.stages[0],title:'新的讨论内容',instructions:'解释溢出'}]}};
    c.library.update(c.teacher.id,task.id,{revision:1,config:updated});
    const second=c.library.publish(c.teacher.id,task.id,{classId:c.cls.id,revision:2,clientSubmissionId:'history-publish-002'}).session;
    const all=c.library.learning(c.teacher.id,task.id);
    assert.equal(all.summary.totalStudents,2,'two classroom participations, one student');
    assert.equal(all.stages.length,2,'changed definitions must not share averages');
    const historical=c.library.learning(c.teacher.id,task.id,first.id);
    assert.equal(historical.publications[0].status,'ended');assert.equal(historical.sessionId,first.id);
    assert.equal(historical.summary.completed,1);assert.equal(historical.stages[0].title,'解释补码');
    assert.equal(historical.stages[0].students[0].result.evidence.text,text);
    const live=c.library.learning(c.teacher.id,task.id,second.id);
    assert.equal(live.stages[0].students[0].status,'not_started');assert.equal(live.stages[0].students[0].result,null);
    assert.throws(()=>c.library.learning(c.teacher.id,task.id,999),/对应的课堂/);
    assert.throws(()=>c.library.learning(c.other.id,task.id,first.id),/不存在/);
  }finally{c.db.close();}
});

test('imported legacy classrooms use actual attempt feedback and do not turn participation rewards into grades',()=>{
  const c=setup();try{
    const draft=c.service.createDraft({teacherId:c.teacher.id,classId:c.cls.id,config:{templateKey:'computer-data-flow',durationMinutes:45,passScore:80}});
    c.service.start({teacherId:c.teacher.id,sessionId:draft.id});c.service.enterStudent({studentId:c.student.id,sessionId:draft.id});
    c.service.submitAttempt({studentId:c.student.id,payload:{clientSubmissionId:'legacy-explore-001',challengeId:'computer-components',result:{completed:true,elapsedMinutes:1}}});
    const [task]=c.library.list(c.teacher.id);
    const learning=c.library.learning(c.teacher.id,task.id,draft.id);
    assert.equal(learning.stages[0].completed,1);assert.equal(learning.stages[0].submitted,1);
    assert.equal(learning.stages[0].students[0].result.passed,true);
    assert.equal(learning.stages[0].averageScore,null);
    assert.equal(learning.summary.averageScore,null);
    assert.equal(task.learning.averageScore,null);
  }finally{c.db.close();}
});
