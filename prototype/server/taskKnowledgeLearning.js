import { questionOf } from '../src/assignmentQuestions.js';
import { knowledgePointOf,knowledgePointsForChallenge } from '../src/knowledgePoints.js';
import { missionForSession } from '../src/shared/classroomMissionRuntime.js';

const parse=value=>{try{return JSON.parse(value??'{}');}catch{return {};}};
export function taskKnowledgeLearning(db,session){
  const mission=missionForSession(session),points=new Map();
  const students=db.prepare('SELECT u.id AS studentId,u.display_name AS displayName,s.result_json FROM student_session_states s JOIN users u ON u.id=s.student_id WHERE s.session_id=? ORDER BY u.id').all(session.id);
  function point(id){const kp=knowledgePointOf(id);if(!kp)return null;if(!points.has(kp.id))points.set(kp.id,{knowledgePointId:kp.id,title:kp.title,chapterId:kp.chapterId,records:new Map()});return points.get(kp.id);}
  for(const id of mission.knowledgePointIds??[])point(id);
  const stages=new Map(mission.stages.map(s=>[s.id,s]));
  // 同一节点只取最新服务端提交；答案、姓名和成绩从不送往生成模型。
  const latest=new Map();
  for(const event of db.prepare('SELECT student_id,stage_id,result_json FROM classroom_stage_events WHERE session_id=? ORDER BY id').all(session.id))latest.set(`${event.student_id}:${event.stage_id}`,event);
  for(const stage of mission.stages){
    for(const id of stage.knowledgePointIds??[])point(id);
    if(stage.type==='practice')for(const id of stage.questionIds)point(questionOf(id)?.kpId);
    if(stage.type==='lab')for(const kp of knowledgePointsForChallenge(stage.challengeId))point(kp.id);
  }
  for(const event of latest.values()){
    const stage=stages.get(event.stage_id);if(stage?.type!=='practice')continue;
    const result=parse(event.result_json);
    for(const id of stage.questionIds){
      const grade=result.results?.[id],q=questionOf(id),p=point(q?.kpId);if(!grade||!p)continue;
      if(!p.records.has(event.student_id))p.records.set(event.student_id,new Map());
      p.records.get(event.student_id).set(`${stage.purpose??'practice'}:${id}`,{questionId:id,stem:q.stem,stageId:stage.id,correct:grade.correct===true,purpose:stage.purpose??'practice'});
    }
  }
  const output=[...points.values()].map(p=>{
    const entries=students.map(student=>{
      const questions=[...(p.records.get(student.studentId)?.values()??[])];
      const latestQuestions=new Map(questions.map(q=>[q.questionId,q]));
      const unique=[...latestQuestions.values()],correct=unique.filter(q=>q.correct).length;
      const rate=unique.length?Math.round(correct/unique.length*100):null;
      const labs=mission.stages.filter(s=>s.type==='lab'&&(s.knowledgePointIds?.includes(p.knowledgePointId)||knowledgePointsForChallenge(s.challengeId).some(k=>k.id===p.knowledgePointId))).map(s=>{
        const r=parse(student.result_json).stageResults?.find(r=>r?.stageId===s.id);
        return r?{stageId:s.id,title:s.title,score:Number.isFinite(r.score)?r.score:null,passed:r.passed}:null;
      }).filter(Boolean);
      const status=!unique.length?'unverified':unique.length<2?'limited':rate>=80?'met':'needs_learning';
      return {studentId:student.studentId,displayName:student.displayName,total:unique.length,correct,rate,status,questions,labs};
    });
    const answered=entries.filter(s=>s.total>0),total=answered.reduce((n,s)=>n+s.total,0),correct=answered.reduce((n,s)=>n+s.correct,0);
    return {knowledgePointId:p.knowledgePointId,title:p.title,chapterId:p.chapterId,total,correct,rate:total?Math.round(correct/total*100):null,students:entries};
  });
  const recommendations=output.flatMap(p=>{
    const weak=p.students.filter(s=>s.total&&s.rate<80),strong=p.students.filter(s=>s.total>=2&&s.rate>=80),unverified=p.students.filter(s=>!s.total||(s.total<2&&s.rate>=80));
    return [
      ...(weak.length?[{knowledgePointId:p.knowledgePointId,title:p.title,chapterId:p.chapterId,kind:'remediation',studentIds:weak.map(s=>s.studentId),reason:`${weak.length}人答题中出现错误；${weak.filter(s=>s.total<2).length}人仅有单题线索，建议补充验证。`,action:'先观察讲解，再做引导练习，最后用不同题号复测。'}]:[]),
      ...(strong.length?[{knowledgePointId:p.knowledgePointId,title:p.title,chapterId:p.chapterId,kind:'transfer',studentIds:strong.map(s=>s.studentId),reason:`${strong.length}人至少完成两道不同题，本轮正确率达到80%。`,action:'安排综合实验和迁移检验，验证能否应用。'}]:[]),
      ...(unverified.length?[{knowledgePointId:p.knowledgePointId,title:p.title,chapterId:p.chapterId,kind:'diagnostic-lab',studentIds:unverified.map(s=>s.studentId),reason:`${unverified.length}人尚无足够的本知识点答题证据（未作答或仅有单题）。`,action:'先安排诊断题，教师结合实验或解释补充证据。'}]:[]),
    ];
  });
  const roster=db.prepare('SELECT u.id AS studentId,u.display_name AS displayName FROM class_members cm JOIN users u ON u.id=cm.student_id WHERE cm.class_id=? ORDER BY u.id').all(session.class_id);
  return {source:'local-evidence',sessionId:session.id,points:output,recommendations,roster};
}

export function compareKnowledge(before,after,strictDiagnosis=false){
  const score=qs=>{const unique=[...new Map(qs.map(q=>[q.questionId,q])).values()];return {rate:unique.length?Math.round(unique.filter(q=>q.correct).length/unique.length*100):null,questionIds:unique.map(q=>q.questionId)};};
  const points=after.points.map(point=>{
    const previous=before.points.find(p=>p.knowledgePointId===point.knowledgePointId);
    const students=point.students.map(student=>{
      const old=previous?.students.find(s=>s.studentId===student.studentId);
      const diagnostic=old?.questions.filter(q=>q.purpose==='diagnosis')??[];
      const priorRetest=old?.questions.filter(q=>q.purpose==='retest')??[];
      const initial=score(diagnostic.length?diagnostic:strictDiagnosis?[]:priorRetest.length?priorRetest:old?.questions??[]),final=score(student.questions.filter(q=>q.purpose==='retest'));
      const repeatedQuestionIds=final.questionIds.filter(id=>initial.questionIds.includes(id));
      return {studentId:student.studentId,displayName:student.displayName,before:initial.rate,after:final.rate,delta:initial.rate===null||final.rate===null?null:final.rate-initial.rate,beforeQuestionIds:initial.questionIds,afterQuestionIds:final.questionIds,repeatedQuestionIds};
    });
    return {knowledgePointId:point.knowledgePointId,title:point.title,students};
  });
  return {sourceSessionId:before.sessionId,points};
}
