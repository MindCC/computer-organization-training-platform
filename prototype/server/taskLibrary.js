import { validateClassroomSessionConfig, missionForSession } from '../src/shared/classroomMissionDefinitions.js';
import { classroomError } from './classroomMissionGrading.js';
import { teacherOwnsClass } from './db.js';

const fail=(code,message,status=400)=>{throw classroomError(code,message,status,false);};
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
  function dto(row){return {id:row.id,title:row.title,revision:row.revision,config:JSON.parse(row.config_json),createdAt:row.created_at,updatedAt:row.updated_at,imported:row.imported_session_id!==null,
    publishedCount:db.prepare('SELECT count(*) n FROM task_library_publications WHERE task_id=?').get(row.id).n};}
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
    list(teacherId){importExisting(teacherId);return db.prepare('SELECT * FROM teacher_task_library WHERE teacher_id=? AND deleted_at IS NULL ORDER BY id DESC').all(teacherId).map(dto);},
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
