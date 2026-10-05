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
