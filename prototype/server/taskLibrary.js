import { validateClassroomSessionConfig, missionForSession } from '../src/shared/classroomMissionDefinitions.js';
import { classroomError } from './classroomMissionGrading.js';
import { teacherOwnsClass } from './db.js';
import { taskKnowledgeLearning,compareKnowledge } from './taskKnowledgeLearning.js';
import { initializeAssistantHistory, readAssistantReport } from './teacherAssistantHistory.js';

const fail=(code,message,status=400)=>{throw classroomError(code,message,status,false);};
const parseJson=value=>{try{return value?JSON.parse(value):null;}catch{return null;}};

// 任务链学情与「学情统计」同源：只统计 student_session_states 里的真实课堂记录。
// 计分平均沿用任务链口径——参与型环节（score 为 null）与未提交的学生都不进分母。
function studentGradedAverage(result){
  if(!result||!Number.isFinite(result.averageScore))return null;
  if(Number.isFinite(result.gradedStageCount))return result.gradedStageCount>0?result.averageScore:null;
  if(Array.isArray(result.stageScores))return result.stageScores.some(score=>Number.isFinite(score))?result.averageScore:null;
  return result.averageScore;
}
function meanOf(values){return values.length?Math.round(values.reduce((sum,score)=>sum+score,0)/values.length):null;}
export function createTaskLibrary({db,sessionService}) {
  initializeAssistantHistory(db);
  db.exec(`CREATE TABLE IF NOT EXISTS teacher_task_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL, config_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
    imported_session_id INTEGER UNIQUE REFERENCES classroom_sessions(id) ON DELETE SET NULL,
    deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ); CREATE INDEX IF NOT EXISTS idx_teacher_task_library ON teacher_task_library(teacher_id,deleted_at,id);
  CREATE TABLE IF NOT EXISTS task_library_publications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL REFERENCES teacher_task_library(id),
    teacher_id INTEGER NOT NULL REFERENCES users(id), revision INTEGER NOT NULL, class_id INTEGER NOT NULL REFERENCES classes(id),
    session_id INTEGER NOT NULL UNIQUE REFERENCES classroom_sessions(id), client_submission_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(teacher_id,client_submission_id)
  );
  CREATE TABLE IF NOT EXISTS task_assistant_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL REFERENCES teacher_task_library(id),
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_id INTEGER NOT NULL REFERENCES teacher_assistant_reports(id), revision INTEGER NOT NULL,
    config_json TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id,revision)
  );`);
  function normalize(config){try{return validateClassroomSessionConfig({...config,targetStudentIds:undefined,templateKey:'task-chain'});}catch(error){throw Object.assign(classroomError('INVALID_TASK',error.message,400,false),{stageId:error.stageId,stageIndex:error.stageIndex});}}
  function sourceFor(teacherId,config,checkRecipients=false){
    const source=config.taskChain?.followUp;if(!source)return null;
    const task=db.prepare('SELECT * FROM teacher_task_library WHERE id=? AND teacher_id=?').get(source.sourceTaskId,teacherId);
    const session=db.prepare('SELECT * FROM classroom_sessions WHERE id=? AND teacher_id=?').get(source.sourceSessionId,teacherId);
    if(!task||!session||!(learningSessions(task).some(s=>s.id===session.id)))fail('INVALID_TASK_SOURCE','后续任务来源不存在或不属于你',404);
    if(checkRecipients&&source.studentIds?.some(id=>!db.prepare('SELECT 1 FROM class_members WHERE class_id=? AND student_id=?').get(session.class_id,id)))fail('INVALID_TARGET_STUDENTS','后续任务的目标学生须属于来源班级');
    return session;
  }
  function own(teacherId,id){
    const row=db.prepare('SELECT * FROM teacher_task_library WHERE id=? AND teacher_id=? AND deleted_at IS NULL').get(id,teacherId);
    if(!row)fail('TASK_NOT_FOUND','任务不存在',404);return row;
  }
  // 删除任务只做软删除，课堂场次是独立快照（学生学习记录必须保留）。但快照不能一直「进行中」：
  // 否则学生端会一直把已删除的任务当成当前任务，该班级也会被 ACTIVE_SESSION_CONFLICT 挡住、
  // 再也发布不了新任务。因此把仍在进行中的课堂按正常流程结束（冻结课堂报告，记录原样保留）。
  // 注意：只处理「由任务库发布出去的」课堂；被导入进任务库的原课堂属于独立课堂，
  // 删除一个库中副本不得结束老师正在上的那节课。
  function openSessionsOfTask(taskId){
    return db.prepare(`SELECT s.id,s.title,s.teacher_id FROM classroom_sessions s
      JOIN task_library_publications p ON p.session_id=s.id
      WHERE p.task_id=? AND s.status IN ('live','paused') ORDER BY s.id`).all(taskId);
  }
  function openSessionsOfDeletedTasks(classId=null){
    return db.prepare(`SELECT s.id,s.title,s.teacher_id FROM classroom_sessions s
      JOIN task_library_publications p ON p.session_id=s.id
      JOIN teacher_task_library t ON t.id=p.task_id
      WHERE s.status IN ('live','paused') AND t.deleted_at IS NOT NULL
        AND (? IS NULL OR s.class_id=?) ORDER BY s.id`).all(classId,classId);
  }
  function withdrawSessions(teacherId,sessions,{tolerant=false}={}){
    const ended=[];
    for(const session of sessions){
      try{sessionService.end({teacherId:teacherId??session.teacher_id,sessionId:session.id});ended.push({id:session.id,title:session.title});}
      catch(error){if(!tolerant)throw error;}
    }
    return ended;
  }
  // 兼容历史数据：任务在上一次修复前就被删除，课堂却还留在进行中。服务启动与发布前各清理一次。
  function withdrawOrphanedSessions({teacherId=null,classId=null}={}){
    return withdrawSessions(teacherId,openSessionsOfDeletedTasks(classId),{tolerant:true});
  }
  withdrawOrphanedSessions();
  function decisionSource(teacherId,input,taskId=null){
    const saved=taskId?db.prepare('SELECT report_id FROM task_assistant_decisions WHERE task_id=? ORDER BY id LIMIT 1').get(taskId)?.report_id:null;
    const reportId=input.assistantReportId??saved;
    if(saved&&reportId!==saved)fail('ASSISTANT_SOURCE_IMMUTABLE','已保存的建议来源不能替换');
    if(reportId!=null)readAssistantReport(db,teacherId,reportId);
    if(input.decisionNote!==undefined&&(typeof input.decisionNote!=='string'||input.decisionNote.length>500))fail('INVALID_DECISION_NOTE','调整说明须为500字以内的文字');
    return reportId;
  }
  function recordDecision(teacherId,taskId,revision,reportId,config,note=''){
    if(reportId!=null)db.prepare('INSERT INTO task_assistant_decisions(task_id,teacher_id,report_id,revision,config_json,note) VALUES(?,?,?,?,?,?)')
      .run(taskId,teacherId,reportId,revision,JSON.stringify(config),note.trim());
  }
  function assistantReview(row){
    const decisions=db.prepare('SELECT * FROM task_assistant_decisions WHERE task_id=? ORDER BY revision DESC LIMIT 20').all(row.id);
    if(!decisions.length)return null;
    const report=readAssistantReport(db,row.teacher_id,decisions[0].report_id);
    const original={focus:report.report.lessonFocus,steps:report.report.nextClassPlan,teacherScript:report.report.teacherScript};
    return {report,decisions:decisions.map(d=>{
      const config=JSON.parse(d.config_json),plan=config.lessonPlan??null;
      const changedFields=plan?['focus','steps','teacherScript'].filter(key=>JSON.stringify(plan[key])!==JSON.stringify(original[key])):['removed'];
      return {revision:d.revision,savedAt:d.created_at,note:d.note,lessonPlan:plan,changedFields,taskTitle:config.taskChain.title,stageTitles:config.taskChain.stages.map(s=>s.title)};
    }),publications:db.prepare('SELECT revision,session_id AS sessionId,class_id AS classId,created_at AS publishedAt FROM task_library_publications WHERE task_id=? ORDER BY id DESC').all(row.id)};
  }
  function dto(row,learning=null,includeReview=false){return {id:row.id,title:row.title,revision:row.revision,config:JSON.parse(row.config_json),createdAt:row.created_at,updatedAt:row.updated_at,imported:row.imported_session_id!==null,
    ...(includeReview?{assistantReview:assistantReview(row)}:{}),
    publishedCount:db.prepare('SELECT count(*) n FROM task_library_publications WHERE task_id=?').get(row.id).n,learning};}
  // 一次查询汇总教师全部任务的课堂记录，供任务库卡片显示完成度与学情。
  function learningSummaries(teacherId){
    const rows=[
      ...db.prepare(`SELECT p.task_id AS task_id,sss.status,sss.result_json,sss.student_id,s.id AS session_id,s.template_key FROM task_library_publications p
        JOIN teacher_task_library t ON t.id=p.task_id AND t.teacher_id=? AND t.deleted_at IS NULL
        JOIN classroom_sessions s ON s.id=p.session_id
        JOIN student_session_states sss ON sss.session_id=p.session_id`).all(teacherId),
      ...db.prepare(`SELECT t.id AS task_id,sss.status,sss.result_json,sss.student_id,s.id AS session_id,s.template_key FROM teacher_task_library t
        JOIN student_session_states sss ON sss.session_id=t.imported_session_id
        JOIN classroom_sessions s ON s.id=t.imported_session_id
        WHERE t.teacher_id=? AND t.deleted_at IS NULL AND t.imported_session_id IS NOT NULL`).all(teacherId),
    ];
    const totals=new Map(),averages=new Map(),legacy=new Map();
    for(const row of rows){
      if(!totals.has(row.task_id)){totals.set(row.task_id,{totalStudents:0,completed:0,inProgress:0,notStarted:0});averages.set(row.task_id,[]);}
      const entry=totals.get(row.task_id);entry.totalStudents+=1;
      if(row.status==='completed')entry.completed+=1;
      else if(row.status==='in_progress')entry.inProgress+=1;
      else entry.notStarted+=1;
      if(row.template_key!=='task-chain'&&!legacy.has(row.session_id))legacy.set(row.session_id,sessionLearning(db.prepare('SELECT * FROM classroom_sessions WHERE id=?').get(row.session_id)).studentAverages);
      const average=row.template_key==='task-chain'?studentGradedAverage(parseJson(row.result_json)):(legacy.get(row.session_id).get(row.student_id)??null);
      if(average!==null)averages.get(row.task_id).push(average);
    }
    const summaries=new Map();
    for(const [taskId,entry] of totals){
      summaries.set(taskId,{...entry,completionRate:entry.totalStudents?Math.round(entry.completed/entry.totalStudents*100):0,averageScore:meanOf(averages.get(taskId))});
    }
    return summaries;
  }
  // 单个课堂场次的完成度与环节学情：环节完成以「学生当前进度超过该环节」为准，
  // 得分与错误取该生最近一次提交（stageResults 按下标与环节一一对应）。
  function sessionLearning(session){
    let mission;try{mission=missionForSession(session);}catch{mission={stages:[]};}
    const students=db.prepare('SELECT s.status,s.current_stage_index,s.result_json,u.id AS studentId,u.display_name AS displayName FROM student_session_states s JOIN users u ON u.id=s.student_id WHERE s.session_id=? ORDER BY u.id').all(session.id);
    const legacyAttempts=new Map();
    if(mission.key!=='task-chain')for(const attempt of db.prepare('SELECT * FROM challenge_attempts WHERE session_id=? ORDER BY id').all(session.id)){
      const result=parseJson(attempt.result_json);
      legacyAttempts.set(`${attempt.student_id}:${attempt.challenge_id}`,{score:result?.classroomPoints!==undefined?null:attempt.score,passed:Boolean(attempt.passed),errors:parseJson(attempt.errors_json)??[],evidence:{challengeId:attempt.challenge_id}});
    }
    const stages=mission.stages.map(stage=>({stageId:stage.id,title:stage.title,type:stage.type??'lab',definitionKey:JSON.stringify({...stage,position:undefined,minutes:undefined}),completed:0,inProgress:0,submitted:0,gradedCount:0,scoreSum:0,errors:new Map(),students:[]}));
    const summary={totalStudents:students.length,completed:0,inProgress:0,notStarted:0},averages=[],studentAverages=new Map();
    for(const student of students){
      if(student.status==='completed')summary.completed+=1;
      else if(student.status==='in_progress')summary.inProgress+=1;
      else summary.notStarted+=1;
      const result=parseJson(student.result_json);
      const average=mission.key==='task-chain'?studentGradedAverage(result):meanOf(mission.stages.map(stage=>legacyAttempts.get(`${student.studentId}:${stage.challengeId}`)?.score).filter(Number.isFinite));
      studentAverages.set(student.studentId,average);
      if(average!==null)averages.push(average);
      const stageResults=Array.isArray(result?.stageResults)?result.stageResults:[];
      const progressIndex=student.status==='completed'?stages.length:Math.max(0,Math.min(stages.length,student.current_stage_index??0));
      stages.forEach((stage,index)=>{
        if(index<progressIndex)stage.completed+=1;
        else if(student.status==='in_progress'&&index===progressIndex)stage.inProgress+=1;
        const original=mission.stages[index];
        const legacyEntry=legacyAttempts.get(`${student.studentId}:${original.challengeId}`);
        const entry=stageResults[index]??(legacyEntry?{...legacyEntry,stageId:stage.stageId,attempts:result?.stageAttempts?.[index]??1}:null);
        stage.students.push({studentId:student.studentId,displayName:student.displayName,
          status:index<progressIndex?'completed':student.status==='in_progress'&&index===progressIndex?'in_progress':'not_started',
          result:entry?.stageId===stage.stageId?entry:null});
        if(entry&&entry.stageId===stage.stageId){
          stage.submitted+=1;
          if(Number.isFinite(entry.score)){stage.gradedCount+=1;stage.scoreSum+=entry.score;}
          for(const message of Array.isArray(entry.errors)?entry.errors.slice(0,10):[]){
            if(typeof message==='string'&&message.trim())stage.errors.set(message,(stage.errors.get(message)??0)+1);
          }
        }
      });
    }
    return {stages,students:summary,averages,studentAverages,
      completionRate:summary.totalStudents?Math.round(summary.completed/summary.totalStudents*100):0,
      averageScore:meanOf(averages)};
  }
  // 任务的课堂场次：发布记录 + 导入来源课堂（导入任务的原课堂同样是真实学习记录）。
  function learningSessions(row){
    const sessions=db.prepare(`SELECT p.created_at AS published_at,s.*,c.name AS class_name FROM task_library_publications p
      JOIN classroom_sessions s ON s.id=p.session_id JOIN classes c ON c.id=s.class_id
      WHERE p.task_id=? ORDER BY p.id DESC`).all(row.id);
    if(row.imported_session_id!==null){
      const origin=db.prepare(`SELECT s.*,c.name AS class_name,s.started_at AS published_at FROM classroom_sessions s
        JOIN classes c ON c.id=s.class_id WHERE s.id=?`).get(row.imported_session_id);
      if(origin)sessions.push({...origin,imported:1});
    }
    return sessions;
  }
  function learning(teacherId,id,sessionId=null){
    const row=own(teacherId,id);
    const allSessions=learningSessions(row);
    const sessions=sessionId===null?allSessions:allSessions.filter(session=>session.id===sessionId);
    if(sessionId!==null&&!sessions.length)fail('SESSION_NOT_FOUND','该任务没有对应的课堂记录',404);
    const classIds=new Set(),totals={totalStudents:0,completed:0,inProgress:0,notStarted:0},allAverages=[],stageOrder=[],stageMap=new Map();
    const publications=sessions.map(session=>{
      const data=sessionLearning(session);
      classIds.add(session.class_id);
      totals.totalStudents+=data.students.totalStudents;totals.completed+=data.students.completed;
      totals.inProgress+=data.students.inProgress;totals.notStarted+=data.students.notStarted;
      allAverages.push(...data.averages);
      for(const stage of data.stages){
        let aggregate=stageMap.get(stage.definitionKey);
        if(!aggregate){aggregate={...stage,errors:new Map(stage.errors)};stageMap.set(stage.definitionKey,aggregate);stageOrder.push(aggregate);}
        else{aggregate.completed+=stage.completed;aggregate.inProgress+=stage.inProgress;aggregate.submitted+=stage.submitted;
          aggregate.gradedCount+=stage.gradedCount;aggregate.scoreSum+=stage.scoreSum;
          for(const [message,count] of stage.errors)aggregate.errors.set(message,(aggregate.errors.get(message)??0)+count);}
      }
      return {sessionId:session.id,classId:session.class_id,className:session.class_name,status:session.status,
        imported:session.imported===1,publishedAt:session.published_at??session.started_at,endedAt:session.ended_at??null,
        students:data.students,completionRate:data.completionRate,averageScore:data.averageScore};
    });
    const selected=sessionId===null?null:sessions[0];
    const knowledge=selected?taskKnowledgeLearning(db,selected):null;
    const source=selected?sourceFor(teacherId,parseJson(selected.config_json)):null;
    if(knowledge&&source)knowledge.comparison=compareKnowledge(taskKnowledgeLearning(db,source),knowledge);
    else if(knowledge&&missionForSession(selected).stages.some(s=>s.purpose==='retest'))knowledge.comparison=compareKnowledge(knowledge,knowledge,true);
    const followUps=selected?db.prepare(`SELECT p.task_id AS taskId,p.session_id AS sessionId,s.class_id AS classId,s.title,s.status FROM task_library_publications p JOIN classroom_sessions s ON s.id=p.session_id
      WHERE p.teacher_id=? AND json_extract(s.config_json,'$.taskChain.followUp.sourceSessionId')=? ORDER BY p.id DESC`).all(teacherId,sessionId):[];
    return {taskId:row.id,title:row.title,revision:row.revision,sessionId,knowledge,followUps,
      summary:{publishedCount:sessions.length,classCount:classIds.size,...totals,
        completionRate:totals.totalStudents?Math.round(totals.completed/totals.totalStudents*100):0,averageScore:meanOf(allAverages)},
      stages:stageOrder.map((stage,index)=>({key:String(index),stageId:stage.stageId,title:stage.title,type:stage.type,
        completed:stage.completed,inProgress:stage.inProgress,submitted:stage.submitted,gradedCount:stage.gradedCount,
        averageScore:stage.gradedCount?Math.round(stage.scoreSum/stage.gradedCount):null,
        students:sessionId===null?undefined:stage.students,
        topErrors:[...stage.errors.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([message,count])=>({message,count}))})),
      publications};
  }
  function importExisting(teacherId){
    const sessions=db.prepare(`SELECT s.* FROM classroom_sessions s WHERE s.teacher_id=?
      AND NOT EXISTS(SELECT 1 FROM teacher_task_library t WHERE t.imported_session_id=s.id)
      AND NOT EXISTS(SELECT 1 FROM task_library_publications p WHERE p.session_id=s.id) ORDER BY s.id`).all(teacherId);
    const insert=db.prepare('INSERT OR IGNORE INTO teacher_task_library(teacher_id,title,config_json,imported_session_id) VALUES(?,?,?,?)');
    db.transaction(()=>{for(const session of sessions){
      const saved=JSON.parse(session.config_json??'{}'),mission=missionForSession(session);
      const config=normalize({...saved,durationMinutes:session.duration_minutes,passScore:session.pass_score,allowMakeup:Boolean(session.allow_makeup),
        taskChain:saved.taskChain??{title:session.title,stages:mission.stages.map(stage=>({...stage,type:'lab',minutes:5,instructions:stage.instructions??stage.description??''}))}});
      insert.run(teacherId,config.taskChain.title,JSON.stringify(config),session.id);
    }})();
  }
  return {
    learning,
    list(teacherId){importExisting(teacherId);const summaries=learningSummaries(teacherId);
      return db.prepare('SELECT * FROM teacher_task_library WHERE teacher_id=? AND deleted_at IS NULL ORDER BY id DESC').all(teacherId).map(row=>dto(row,summaries.get(row.id)??null));},
    get(teacherId,id){return dto(own(teacherId,id),null,true);},
    create(teacherId,input){return db.transaction(()=>{const config=normalize(input);sourceFor(teacherId,config,true);const reportId=decisionSource(teacherId,input);
      const result=db.prepare('INSERT INTO teacher_task_library(teacher_id,title,config_json) VALUES(?,?,?)').run(teacherId,config.taskChain.title,JSON.stringify(config)),id=Number(result.lastInsertRowid);
      recordDecision(teacherId,id,1,reportId,config,input.decisionNote);return this.get(teacherId,id);})();},
    update(teacherId,id,input){
      const row=own(teacherId,id);if(input.revision!==row.revision)fail('TASK_VERSION_CONFLICT','任务已被修改，请重新打开最新版本',409);
      const config=normalize(input.config);
      sourceFor(teacherId,config,true);
      const reportId=decisionSource(teacherId,input,id);
      db.transaction(()=>{
        db.prepare('UPDATE teacher_task_library SET title=?,config_json=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(config.taskChain.title,JSON.stringify(config),id);
        recordDecision(teacherId,id,row.revision+1,reportId,config,input.decisionNote);
      })();
      return this.get(teacherId,id);
    },
    remove(teacherId,id,revision){const row=own(teacherId,id);if(revision!==row.revision)fail('TASK_VERSION_CONFLICT','任务已被修改，请重新打开最新版本',409);
      let endedSessions=[];
      db.transaction(()=>{
        try{endedSessions=withdrawSessions(teacherId,openSessionsOfTask(row.id));}
        catch(error){fail('TASK_WITHDRAW_FAILED','无法结束该任务进行中的课堂，请先在「课堂执行」中结束它，再删除任务');}
        db.prepare('UPDATE teacher_task_library SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
      })();
      return {ok:true,endedSessions};},
    publish(teacherId,id,input){return db.transaction(()=>{
      const key=input?.clientSubmissionId,classId=input?.classId;
      if(typeof key!=='string'||!/^[\w-]{8,100}$/.test(key))fail('INVALID_PUBLISH_REQUEST','发布标识无效');
      if(!Number.isInteger(classId)||!teacherOwnsClass(db,teacherId,classId))fail('CLASS_NOT_FOUND','班级不存在',404);
      const previous=db.prepare('SELECT * FROM task_library_publications WHERE teacher_id=? AND client_submission_id=?').get(teacherId,key);
      if(previous){if(previous.task_id!==id||previous.class_id!==classId||previous.revision!==input.revision)fail('PUBLISH_CONFLICT','同一次发布的内容不能更改',409);
        const oldTargets=parseJson(db.prepare('SELECT config_json FROM classroom_sessions WHERE id=?').get(previous.session_id).config_json)?.targetStudentIds??null;
        const targets=Array.isArray(input.targetStudentIds)?[...input.targetStudentIds].sort((a,b)=>a-b):input.targetStudentIds??null;
        if(JSON.stringify(oldTargets)!==JSON.stringify(targets))fail('PUBLISH_CONFLICT','同一次发布的内容不能更改',409);
        return {session:db.prepare('SELECT * FROM classroom_sessions WHERE id=?').get(previous.session_id),duplicate:true};}
      const row=own(teacherId,id);if(row.revision!==input.revision)fail('TASK_VERSION_CONFLICT','任务已被修改，请重新打开最新版本',409);
      // 历史遗留：已删除任务的课堂还留在进行中，会挡住这次发布；先按正常流程结束它。
      withdrawOrphanedSessions({teacherId,classId});
      if(input.targetStudentIds===undefined&&db.prepare("SELECT 1 FROM classroom_sessions WHERE class_id=? AND status IN ('live','paused')").get(classId))fail('ACTIVE_SESSION_CONFLICT','该班级已有进行中的课堂，请先结束当前课堂',409);
      const config=JSON.parse(row.config_json),source=sourceFor(teacherId,config);
      if(source&&source.class_id!==classId)fail('INVALID_TASK_SOURCE','后续任务须发布到来源班级');
      if(source&&source.status!=='ended')fail('SOURCE_SESSION_ACTIVE','请先结束来源课堂，再发布后续任务');
      if(source&&!input.targetStudentIds)fail('INVALID_TARGET_STUDENTS','后续任务请选择目标学生');
      const draft=sessionService.createDraft({teacherId,classId,config:{...config,...(input.targetStudentIds!==undefined?{targetStudentIds:input.targetStudentIds}:{})}});
      const session=sessionService.start({teacherId,sessionId:draft.id});
      db.prepare('INSERT INTO task_library_publications(task_id,teacher_id,revision,class_id,session_id,client_submission_id) VALUES(?,?,?,?,?,?)').run(id,teacherId,row.revision,classId,session.id,key);
      return {session,duplicate:false};
    })();},
  };
}
