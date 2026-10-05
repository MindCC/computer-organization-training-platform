import { questionOf, gradeQuestion } from '../src/assignmentQuestions.js';
import { validateClassroomSessionConfig, missionForSession } from '../src/shared/classroomMissionDefinitions.js';
import { classroomError } from './classroomMissionGrading.js';

const parse=(value,fallback={})=>{try{return JSON.parse(value)??fallback;}catch{return fallback;}};
const fail=(message,code='INVALID_STAGE_EVIDENCE',status=400)=>{throw classroomError(code,message,status,false);};

export function ensureTaskChainTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS classroom_stage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES classroom_sessions(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage_id TEXT NOT NULL, client_submission_id TEXT NOT NULL,
    evidence_json TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(session_id,student_id,client_submission_id)
  ); CREATE INDEX IF NOT EXISTS idx_classroom_stage_student ON classroom_stage_events(session_id,student_id,id);`);
}

export function validateChainAssignments(db,config,classId) {
  for(const stage of config.taskChain?.stages??[])if(stage.type==='assignment') {
    const assignment=db.prepare("SELECT id FROM assignments WHERE id=? AND class_id=? AND status='published' AND question_count>0").get(stage.assignmentId,classId);
    if(!assignment)fail('关联作业须为当前班级已发布的作业');
  }
}

// This function runs in the caller's transaction together with the underlying evidence record.
export function advanceTaskChain({repository,session,studentState,mission,stageIndex,result,evidence,now}) {
  const previous=parse(studentState.result_json);
  const stageResults=[...(previous.stageResults??[])];
  const stage=mission.stages[stageIndex];
  const stageAttempts=[...(previous.stageAttempts??mission.stages.map(()=>0))];
  stageAttempts[stageIndex]=(stageAttempts[stageIndex]??0)+1;
  stageResults[stageIndex]={stageId:stage.id,title:stage.title,type:stage.type,score:result.score,passed:result.passed,errors:result.errors??[],
    evidence,attempts:stageAttempts[stageIndex],completedAt:result.passed?new Date(now()).toISOString():null};
  const nextIndex=result.passed?stageIndex+1:stageIndex;
  const completed=nextIndex>=mission.stages.length;
  const grades=stageResults.filter(item=>Number.isFinite(item?.score)).map(item=>item.score);
  const average=grades.length?Math.round(grades.reduce((sum,score)=>sum+score,0)/grades.length):null;
  const passedStages=stageResults.filter(item=>item.passed);
  const xp=passedStages.reduce((sum,item)=>sum+(item.score??20),0);
  const stars=completed?(average===null?1:average>=95?3:average>=90?2:average>=session.pass_score?1:0):0;
  const outcome={stageResults,stageAttempts,stageScores:stageResults.map(item=>item?.score??null),
    passedStageIds:passedStages.map(item=>item.stageId),averageScore:average,gradedStageCount:grades.length,badges:completed?['任务链完成者']:[]};
  const updated=repository.updateStudentAfterAttempt({sessionId:session.id,studentId:studentState.student_id,
    status:completed?'completed':'in_progress',currentStageIndex:nextIndex,xp,stars,
    streak:result.passed?studentState.streak+1:0,result:outcome,completedAt:completed?new Date(now()).toISOString():null});
  return {...updated,result:outcome};
}

export function createTaskChainActions({db,repository,now,expireIfNeeded,assertTeacherOwns}) {
  ensureTaskChainTables(db);
  return {
    updateDraft({teacherId,sessionId,config}) {
      const session=repository.getById(sessionId);
      if(!session)fail('课堂场次不存在','SESSION_NOT_FOUND',404);
      assertTeacherOwns(session,teacherId);
      if(session.status!=='draft')fail('仅草稿可以修改任务链','SESSION_ALREADY_STARTED',409);
      const normalized=validateClassroomSessionConfig(config);
      validateChainAssignments(db,normalized,session.class_id);
      const mission=normalized.taskChain??missionForSession(session);
      db.prepare(`UPDATE classroom_sessions SET template_key=?,template_version=?,title=?,duration_minutes=?,pass_score=?,allow_makeup=?,config_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='draft'`)
        .run(normalized.templateKey,normalized.templateVersion,mission.title,normalized.durationMinutes,normalized.passScore,normalized.allowMakeup?1:0,JSON.stringify(normalized),sessionId);
      return repository.getById(sessionId);
    },
    completeStage({studentId,sessionId,payload}) {
      const session=repository.getById(sessionId);
      if(!session)fail('课堂场次不存在','SESSION_NOT_FOUND',404);
      if(!db.prepare('SELECT 1 FROM class_members WHERE class_id=? AND student_id=?').get(session.class_id,studentId))fail('你不在该班级中','NOT_CLASS_MEMBER',403);
      const state=repository.getStudentState(sessionId,studentId);
      if(!state||state.status==='not_started')fail('请先接受课堂任务','NOT_ENTERED',409);
      const id=payload?.clientSubmissionId;
      if(typeof id!=='string'||!/^[\w-]{8,100}$/.test(id))fail('提交标识无效');
      const evidence=payload?.evidence??{};
      if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))fail('提交证据格式无效');
      if(Buffer.byteLength(JSON.stringify(evidence),'utf8')>16000)fail('提交内容过长');
      const duplicate=db.prepare('SELECT * FROM classroom_stage_events WHERE session_id=? AND student_id=? AND client_submission_id=?').get(sessionId,studentId,id);
      if(duplicate) {
        if(duplicate.stage_id!==payload.stageId||duplicate.evidence_json!==JSON.stringify(evidence))fail('同一次提交的内容不能更改','SUBMISSION_CONFLICT',409);
        return {studentState:{...state,result:parse(state.result_json)},result:parse(duplicate.result_json),duplicate:true};
      }
      const fresh=expireIfNeeded(session);
      if(fresh.status==='ended')fail('课堂已结束','SESSION_ENDED',409);
      if(fresh.status==='paused')throw classroomError('SESSION_PAUSED','课堂任务已暂停，请等待教师恢复。',409,true);
      if(fresh.status!=='live')fail('课堂尚未开始','SESSION_NOT_STARTED',409);
      const mission=missionForSession(fresh),index=state.current_stage_index,stage=mission.stages[index];
      if(!stage||stage.id!==payload.stageId)fail('提交与当前任务环节不匹配','STAGE_MISMATCH',409);
      if(!stage.type||stage.type==='lab')fail('请在实验工作台提交实际操作','STAGE_MISMATCH',409);
      let result={score:null,passed:true,errors:[]},practice=null;
      if(stage.type==='practice') {
        const answers=evidence.answers;
        if(!answers||typeof answers!=='object'||Array.isArray(answers)||Object.keys(answers).length!==stage.questionIds.length)fail('请完成本环节的全部题目');
        const results={};let earned=0,total=0;
        for(const id of stage.questionIds) {
          if(typeof answers[id]!=='string'||!answers[id].trim()||answers[id].length>2000)fail('请完成本环节的全部题目');
          const grade=gradeQuestion(questionOf(id),answers[id]);results[id]=grade;earned+=grade.earned;total+=grade.max;
        }
        const score=Math.round(earned/total*100);
        result={score,passed:stage.completion==='submitted'||score>=fresh.pass_score,results,errors:Object.entries(results).filter(([,r])=>!r.correct).map(([id])=>questionOf(id).stem)};
        practice={answers,results};
      } else if(stage.type==='assignment') {
        const submission=db.prepare(`SELECT ss.* FROM student_submissions ss JOIN assignments a ON a.id=ss.assignment_id WHERE ss.student_id=? AND a.id=? AND a.class_id=? AND ss.status IN ('submitted','graded')`).get(studentId,stage.assignmentId,fresh.class_id);
        if(!submission)fail('请先完成并提交本环节的教师作业');
        // Completion is submission; pending teacher marking is not a zero grade.
        result={...result,submissionId:submission.id,gradingStatus:submission.status};
      } else if(['ai','reflection'].includes(stage.type)||(stage.type==='custom'&&stage.submissionMode==='text')) {
        if(typeof evidence.text!=='string'||evidence.text.trim().length<10||evidence.text.length>2000)fail('请用10到2000字写下自己的理解');
      } else if(evidence.completed!==true)fail('请确认已完成本环节的学习');
      return db.transaction(()=>{
        if(practice)db.prepare('INSERT INTO chapter_practice_attempts (student_id,chapter_id,client_submission_id,answers_json,results_json,created_at) VALUES (?,?,?,?,?,?)')
          .run(studentId,stage.chapterId,`chain-${sessionId}-${id}`,JSON.stringify(practice.answers),JSON.stringify(practice.results),new Date(now()).toISOString());
        db.prepare('INSERT INTO classroom_stage_events (session_id,student_id,stage_id,client_submission_id,evidence_json,result_json,created_at) VALUES (?,?,?,?,?,?,?)')
          .run(sessionId,studentId,stage.id,id,JSON.stringify(evidence),JSON.stringify(result),new Date(now()).toISOString());
        const studentState=advanceTaskChain({repository,session:fresh,studentState:state,mission,stageIndex:index,result,evidence,now});
        return {studentState,result};
      })();
    },
  };
}
