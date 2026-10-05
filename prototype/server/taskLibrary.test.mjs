import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate, createUser, createClass, addStudentToClass } from './db.js';
import { createClassroomSessionService } from './classroomSessionService.js';
import { createClassroomSessionRepository } from './classroomSessionRepository.js';
import { createTaskLibrary } from './taskLibrary.js';

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
