import { validateClassroomSessionConfig, missionForSession } from '../src/shared/classroomMissionDefinitions.js';
import { classroomError } from './classroomMissionGrading.js';
import { teacherOwnsClass } from './db.js';

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
  );`);
  function normalize(config){try{return validateClassroomSessionConfig({...config,templateKey:'task-chain'});}catch(error){fail('INVALID_TASK',error.message);}}
  function own(teacherId,id){
    const row=db.prepare('SELECT * FROM teacher_task_library WHERE id=? AND teacher_id=? AND deleted_at IS NULL').get(id,teacherId);
    if(!row)fail('TASK_NOT_FOUND','任务不存在',404);return row;
  }
  function dto(row,learning=null){return {id:row.id,title:row.title,revision:row.revision,config:JSON.parse(row.config_json),createdAt:row.created_at,updatedAt:row.updated_at,imported:row.imported_session_id!==null,
    publishedCount:db.prepare('SELECT count(*) n FROM task_library_publications WHERE task_id=?').get(row.id).n,learning};}
  // 一次查询汇总教师全部任务的课堂记录，供任务库卡片显示完成度与学情。
  function learningSummaries(teacherId){
    const rows=[
      ...db.prepare(`SELECT p.task_id AS task_id,sss.status,sss.result_json FROM task_library_publications p
        JOIN teacher_task_library t ON t.id=p.task_id AND t.teacher_id=? AND t.deleted_at IS NULL
        JOIN student_session_states sss ON sss.session_id=p.session_id`).all(teacherId),
      ...db.prepare(`SELECT t.id AS task_id,sss.status,sss.result_json FROM teacher_task_library t
        JOIN student_session_states sss ON sss.session_id=t.imported_session_id
        WHERE t.teacher_id=? AND t.deleted_at IS NULL AND t.imported_session_id IS NOT NULL`).all(teacherId),
    ];
    const totals=new Map(),averages=new Map();
    for(const row of rows){
      if(!totals.has(row.task_id)){totals.set(row.task_id,{totalStudents:0,completed:0,inProgress:0,notStarted:0});averages.set(row.task_id,[]);}
      const entry=totals.get(row.task_id);entry.totalStudents+=1;
      if(row.status==='completed')entry.completed+=1;
      else if(row.status==='in_progress')entry.inProgress+=1;
      else entry.notStarted+=1;
      const average=studentGradedAverage(parseJson(row.result_json));
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
    const stages=mission.stages.map(stage=>({stageId:stage.id,title:stage.title,type:stage.type??'lab',definitionKey:JSON.stringify({...stage,position:undefined,minutes:undefined}),completed:0,inProgress:0,submitted:0,gradedCount:0,scoreSum:0,errors:new Map(),students:[]}));
    const summary={totalStudents:students.length,completed:0,inProgress:0,notStarted:0},averages=[];
    for(const student of students){
      if(student.status==='completed')summary.completed+=1;
      else if(student.status==='in_progress')summary.inProgress+=1;
      else summary.notStarted+=1;
      const result=parseJson(student.result_json);
      const average=studentGradedAverage(result);
      if(average!==null)averages.push(average);
      const stageResults=Array.isArray(result?.stageResults)?result.stageResults:[];
      const progressIndex=student.status==='completed'?stages.length:Math.max(0,Math.min(stages.length,student.current_stage_index??0));
      stages.forEach((stage,index)=>{
        if(index<progressIndex)stage.completed+=1;
        else if(student.status==='in_progress'&&index===progressIndex)stage.inProgress+=1;
        const entry=stageResults[index];
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
    return {stages,students:summary,averages,
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
    return {taskId:row.id,title:row.title,revision:row.revision,sessionId,
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
    get(teacherId,id){return dto(own(teacherId,id));},
    create(teacherId,input){const config=normalize(input);const result=db.prepare('INSERT INTO teacher_task_library(teacher_id,title,config_json) VALUES(?,?,?)').run(teacherId,config.taskChain.title,JSON.stringify(config));return this.get(teacherId,Number(result.lastInsertRowid));},
    update(teacherId,id,input){
      const row=own(teacherId,id);if(input.revision!==row.revision)fail('TASK_VERSION_CONFLICT','任务已被修改，请重新打开最新版本',409);
      const config=normalize(input.config);
      db.prepare('UPDATE teacher_task_library SET title=?,config_json=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(config.taskChain.title,JSON.stringify(config),id);
      return this.get(teacherId,id);
    },
    remove(teacherId,id,revision){const row=own(teacherId,id);if(revision!==row.revision)fail('TASK_VERSION_CONFLICT','任务已被修改，请重新打开最新版本',409);
      db.prepare('UPDATE teacher_task_library SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);return {ok:true};},
    publish(teacherId,id,input){return db.transaction(()=>{
      const key=input?.clientSubmissionId,classId=input?.classId;
      if(typeof key!=='string'||!/^[\w-]{8,100}$/.test(key))fail('INVALID_PUBLISH_REQUEST','发布标识无效');
      if(!Number.isInteger(classId)||!teacherOwnsClass(db,teacherId,classId))fail('CLASS_NOT_FOUND','班级不存在',404);
      const previous=db.prepare('SELECT * FROM task_library_publications WHERE teacher_id=? AND client_submission_id=?').get(teacherId,key);
      if(previous){if(previous.task_id!==id||previous.class_id!==classId||previous.revision!==input.revision)fail('PUBLISH_CONFLICT','同一次发布的内容不能更改',409);
        return {session:db.prepare('SELECT * FROM classroom_sessions WHERE id=?').get(previous.session_id),duplicate:true};}
      const row=own(teacherId,id);if(row.revision!==input.revision)fail('TASK_VERSION_CONFLICT','任务已被修改，请重新打开最新版本',409);
      if(db.prepare("SELECT 1 FROM classroom_sessions WHERE class_id=? AND status IN ('live','paused')").get(classId))fail('ACTIVE_SESSION_CONFLICT','该班级已有进行中的课堂，请先结束当前课堂',409);
      const draft=sessionService.createDraft({teacherId,classId,config:JSON.parse(row.config_json)});
      const session=sessionService.start({teacherId,sessionId:draft.id});
      db.prepare('INSERT INTO task_library_publications(task_id,teacher_id,revision,class_id,session_id,client_submission_id) VALUES(?,?,?,?,?,?)').run(id,teacherId,row.revision,classId,session.id,key);
      return {session,duplicate:false};
    })();},
  };
}
