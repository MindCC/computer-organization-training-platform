import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate, createUser, createClass, addStudentToClass } from './db.js';
import { createClassroomSessionRepository } from './classroomSessionRepository.js';
import { createClassroomSessionService } from './classroomSessionService.js';
import { validateClassroomSessionConfig } from '../src/shared/classroomMissionDefinitions.js';
import { createAssignmentRepository } from './assignmentRepository.js';
import { getCircuitChallenge } from '../src/circuit/challengeCircuitModel.js';

function context() {
  const db = openDatabase(':memory:'); migrate(db);
  const teacher = createUser(db, {username:'chain-teacher',displayName:'教师',role:'teacher',passwordHash:'pw'});
  const student = createUser(db, {username:'chain-student',displayName:'学生',role:'student',passwordHash:'pw'});
  const stranger = createUser(db, {username:'chain-other',displayName:'外班学生',role:'student',passwordHash:'pw'});
  const classroom = createClass(db,teacher.id,'任务链班'); addStudentToClass(db,classroom.id,student.id);
  const service = createClassroomSessionService({db,repository:createClassroomSessionRepository(db)});
  const config = {templateKey:'task-chain',durationMinutes:45,passScore:80,taskChain:{title:'补码课堂',stages:[
    {id:'watch',type:'demo',title:'观察减法',demoId:'arithmetic-basics'},
    {id:'test',type:'practice',title:'检查编码',chapterId:'ch2',questionIds:['ch2-q02','ch2-q07'],completion:'passed'},
    {id:'reflect',type:'reflection',title:'解释原因'},
  ]}};
  const session = service.createDraft({teacherId:teacher.id,classId:classroom.id,config});
  return {db,teacher,student,stranger,service,session,config};
}

test('task chains validate resources and reject duplicate steps',()=>{
  const base={templateKey:'task-chain',durationMinutes:45,passScore:80};
  assert.throws(()=>validateClassroomSessionConfig({...base,taskChain:{title:'错误',stages:[{id:'a',title:'演示',type:'demo',demoId:'evil'}]}}),/演示/);
  assert.throws(()=>validateClassroomSessionConfig({...base,taskChain:{title:'错误',stages:[{id:'a',title:'反思',type:'reflection'},{id:'a',title:'反思',type:'reflection'}]}}),/重复/);
});

test('heterogeneous chain persists, grades actual answers, retries and completes idempotently',()=>{
  const c=context(); try {
    c.service.start({teacherId:c.teacher.id,sessionId:c.session.id});
    assert.throws(()=>c.service.enterStudent({studentId:c.stranger.id,sessionId:c.session.id}),/班级/);
    const entered=c.service.enterStudent({studentId:c.student.id,sessionId:c.session.id});
    assert.equal(entered.mission.stages.length,3);
    const send=(stageId,evidence={},id=`chain-${stageId}-request`)=>c.service.completeStage({studentId:c.student.id,sessionId:c.session.id,payload:{stageId,evidence,clientSubmissionId:id}});
    assert.throws(()=>send('reflect',{text:'解释为何符号位必须参与运算。'}),/当前/);
    const first=send('watch',{completed:true}); assert.equal(first.studentState.current_stage_index,1);
    assert.equal(send('watch',{completed:true}).studentState.current_stage_index,1);
    const wrong=send('test',{answers:{'ch2-q02':'0 ~ 255','ch2-q07':'10000101'}},'chain-wrong-answer');
    assert.equal(wrong.studentState.current_stage_index,1); assert.equal(wrong.result.score,0);
    assert.equal(wrong.studentState.result.stageResults[1].errors.length,2);
    const right=send('test',{answers:{'ch2-q02':'-128 ~ 127','ch2-q07':'11111011'}},'chain-correct-answer');
    assert.equal(right.studentState.current_stage_index,2);
    assert.equal(c.db.prepare('SELECT count(*) n FROM chapter_practice_attempts').get().n,2);
    c.service.pause({teacherId:c.teacher.id,sessionId:c.session.id});
    assert.throws(()=>send('reflect',{text:'符号位参与加法，超出范围时判断溢出。'}),/暂停/);
    c.service.resume({teacherId:c.teacher.id,sessionId:c.session.id});
    assert.throws(()=>send('reflect',{text:'好'}),/10/);
    const done=send('reflect',{text:'符号位参与加法，超出范围时判断溢出。'});
    assert.equal(done.studentState.status,'completed');
    assert.equal(done.studentState.result.averageScore,100);
    assert.equal(done.studentState.result.gradedStageCount,1);
    assert.equal(c.service.getStudentCurrent({studentId:c.student.id}).studentState.current_stage_index,3);
    c.service.end({teacherId:c.teacher.id,sessionId:c.session.id});
    const report=c.service.getReport({teacherId:c.teacher.id,sessionId:c.session.id});
    assert.equal(report.studentReports[0].completedStages,3);
    assert.equal(report.studentReports[0].stageResults[2].evidence.text,'符号位参与加法，超出范围时判断溢出。');
    assert.throws(()=>send('watch',{completed:true},'chain-after-end'),/结束/);
  } finally {c.db.close();}
});

test('draft editing is allowed before start and forbidden once live',()=>{
  const c=context();try {
    const changed=c.service.updateDraft({teacherId:c.teacher.id,sessionId:c.session.id,config:{...c.config,taskChain:{...c.config.taskChain,title:'改后的课'}}});
    assert.equal(changed.title,'改后的课');
    c.service.start({teacherId:c.teacher.id,sessionId:c.session.id});
    assert.throws(()=>c.service.updateDraft({teacherId:c.teacher.id,sessionId:c.session.id,config:c.config}),/草稿/);
  }finally{c.db.close();}
});

test('assignment stages require current-class publication and real student submission',()=>{
  const c=context();try {
    const repo=createAssignmentRepository(c.db);
    const ownClass=c.session.class_id,otherClass=createClass(c.db,c.teacher.id,'另一个班').id;
    const own=repo.createAssignment({classId:ownClass,teacherId:c.teacher.id,title:'解释补码'});
    const question=repo.addQuestion({assignmentId:own.id,type:'short_answer',stem:'解释补码减法',answer:[],score:10});
    const other=repo.createAssignment({classId:otherClass,teacherId:c.teacher.id,title:'外班作业'});
    repo.addQuestion({assignmentId:other.id,type:'short_answer',stem:'解释',answer:[],score:10});repo.updateStatus(other.id,'published');
    const config=id=>({...c.config,taskChain:{title:'作业链',stages:[{id:'assignment',type:'assignment',title:'完成说明',assignmentId:id}]}});
    assert.throws(()=>c.service.updateDraft({teacherId:c.teacher.id,sessionId:c.session.id,config:config(other.id)}),/当前班级/);
    assert.throws(()=>c.service.updateDraft({teacherId:c.teacher.id,sessionId:c.session.id,config:config(own.id)}),/已发布/);
    repo.updateStatus(own.id,'published');c.service.updateDraft({teacherId:c.teacher.id,sessionId:c.session.id,config:config(own.id)});
    c.service.start({teacherId:c.teacher.id,sessionId:c.session.id});c.service.enterStudent({studentId:c.student.id,sessionId:c.session.id});
    const send=()=>c.service.completeStage({studentId:c.student.id,sessionId:c.session.id,payload:{stageId:'assignment',clientSubmissionId:'assignment-submit-1',evidence:{completed:true}}});
    assert.throws(send,/先完成并提交/);
    const submission=repo.upsertSubmission({assignmentId:own.id,studentId:c.student.id,answers:[{questionId:question.id,value:'将减数取负后用补码相加'}]});
    assert.throws(send,/先完成并提交/);
    repo.markSubmitted(submission.id,{totalScore:0,questionScores:[]});const done=send();assert.equal(done.studentState.status,'completed');assert.equal(done.result.score,null);assert.equal(done.studentState.result.gradedStageCount,0);
  }finally{c.db.close();}
});

test('custom lab uses actual evidence, requires acceptance, and excludes participation from grades',()=>{
  const c=context();try {
    c.service.updateDraft({teacherId:c.teacher.id,sessionId:c.session.id,config:{...c.config,taskChain:{title:'机器编码',stages:[{id:'lab',type:'lab',title:'机器编码',challengeId:'machine-number'}]}}});
    c.service.start({teacherId:c.teacher.id,sessionId:c.session.id});
    const payload={challengeId:'machine-number',clientSubmissionId:'chain-lab-evidence-1',result:{circuitEdges:getCircuitChallenge('machine-number').requiredEdges,elapsedMinutes:1}};
    assert.throws(()=>c.service.submitAttempt({studentId:c.student.id,payload}),/先接受/);
    c.service.enterStudent({studentId:c.student.id,sessionId:c.session.id});
    const done=c.service.submitAttempt({studentId:c.student.id,payload});assert.equal(done.studentState.status,'completed');assert.equal(done.studentState.result.gradedStageCount,0);assert.equal(done.studentState.result.averageScore,null);
    const duplicate=c.service.submitAttempt({studentId:c.student.id,payload});assert.equal(duplicate.studentState.current_stage_index,1);assert.equal(c.db.prepare('SELECT count(*) n FROM challenge_attempts').get().n,1);
  }finally{c.db.close();}
});
