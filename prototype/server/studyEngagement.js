import { createHash } from 'node:crypto';
import { questionOf } from '../src/assignmentQuestions.js';
import { knowledgePointOf } from '../src/knowledgePoints.js';
import { LEARNING_ITEMS } from '../src/platformLogic.js';
import { HOSTED_DEMOS } from '../src/shared/demoNavigation.js';
import { teacherOwnsClass, teacherOwnsClassDirectly, listClassStudents, getUserById } from './db.js';

const DAY=86400000,parse=(v,f={})=>{try{return JSON.parse(v);}catch{return f;}};
const timestamp=v=>Date.parse(/^\d{4}-\d{2}-\d{2} /.test(v??'')?v.replace(' ','T')+'Z':v);
const day=v=>new Date(timestamp(v)+8*3600000).toISOString().slice(0,10);
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const defaults={bonusCap:0,dayTarget:8,questionTarget:20,labTarget:3,followThroughTarget:4};
export function defaultEngagementPolicy(now=new Date()) {
  return {...defaults,startDate:day(new Date(now.getTime()-29*DAY).toISOString()),endDate:day(now.toISOString()),version:0};
}
function validatedPolicy(input) {
  const policy={};
  for(const key of ['startDate','endDate']) {
    const value=input?.[key];if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('请选择有效的统计日期');policy[key]=value;
  }
  const length=Date.parse(policy.endDate)-Date.parse(policy.startDate);
  if(length<0||length>365*DAY)fail('统计区间应为1至366天');
  for(const [key,max] of [['dayTarget',366],['questionTarget',1000],['labTarget',100],['followThroughTarget',100]]) {
    if(!Number.isInteger(input[key])||input[key]<1||input[key]>max)fail('学习目标无效');policy[key]=input[key];
  }
  if(typeof input.bonusCap!=='number'||!Number.isFinite(input.bonusCap)||input.bonusCap<0||input.bonusCap>100||Math.abs(Math.round(input.bonusCap*100)-input.bonusCap*100)>0.00001)fail('加分上限应为0至100，最多两位小数');
  policy.bonusCap=input.bonusCap;return policy;
}
function classPolicy(db,classId,now) {
  const row=db.prepare('SELECT * FROM study_engagement_policies WHERE class_id=?').get(classId);
  return row?{...parse(row.policy_json),version:row.version}:defaultEngagementPolicy(now);
}
export function recordStudyVisit(db,id,now=new Date()) {
  const date=day(now.toISOString());db.prepare('INSERT OR IGNORE INTO study_visits(student_id,day,created_at) VALUES (?,?,?)').run(id,date,now.toISOString());return {day:date};
}
export function selectedStudyMemory(db,id,ids,consent) {
  if(ids===undefined)return [];
  if(!Array.isArray(ids)||ids.length>3||ids.some(v=>!Number.isSafeInteger(v)||v<1)||new Set(ids).size!==ids.length)fail('每次最多选择三条课程提问');
  if(!ids.length)return [];
  if(consent!=='selected-course-questions')fail('请明确选择将这些课程提问用于本次答疑');
  return ids.map(conversationId=>{
    const row=db.prepare('SELECT question,topic,answer_json FROM ai_conversations WHERE id=? AND student_id=?').get(conversationId,id);
    if(!row||/^COURSE_(SCOPE|ANSWER)_/.test(parse(row.answer_json).reason??''))fail('选取的课程提问不存在',404);
    return {question:row.question.slice(0,1600),topic:row.topic};
  });
}
export function engagementSummary(db,id,policy,now=new Date(),{includePrivate=true}={}) {
  policy={...defaultEngagementPolicy(now),...policy};
  const start=Date.parse(policy.startDate+'T00:00:00+08:00'),end=Math.min(now.getTime(),Date.parse(policy.endDate+'T23:59:59.999+08:00'));
  const inWindow=at=>timestamp(at)>=start&&timestamp(at)<=end;
  const active=new Set(),questions=new Map(),labs=new Map(),follow=new Set(),wrong=new Set(),evidence=[],timings=[],checks=[];
  const rows=(table)=>db.prepare(`SELECT * FROM ${table} WHERE student_id=? ORDER BY id`).all(id);
  const allConversations=rows('ai_conversations').filter(r=>timestamp(r.created_at)<=now.getTime()&&!/^COURSE_(SCOPE|ANSWER)_/.test(parse(r.answer_json).reason??''));
  const conversations=allConversations.filter(r=>inWindow(r.created_at));
  const help=new Map();
  for(const r of conversations)for(const kp of parse(r.concept_ids_json,[]))if(knowledgePointOf(kp))help.set(kp,Math.min(help.get(kp)??Infinity,timestamp(r.created_at)));
  function check(key,kp,correct,at) {
    checks.push({key,kp,correct,at});
  }
  for(const r of rows('chapter_practice_attempts')) {
    if(!inWindow(r.created_at))continue;
    const answers=parse(r.answers_json),observations=parse(r.observations_json);
    let used=false;
    for(const [qid,result] of Object.entries(parse(r.results_json))) {
      const q=questionOf(qid);if(!q||!String(answers[qid]??'').trim())continue;
      check('practice:'+qid,q.kpId,result.correct,r.created_at);used=true;
      if(observations[qid])timings.push({questionId:qid,stem:q.stem,createdAt:r.created_at,correct:result.correct,...observations[qid]});
    }
    if(used)evidence.push(['practice',r.id,r.created_at,r.answers_json,r.results_json,r.observations_json]);
  }
  for(const r of rows('study_remediation_sessions'))for(const c of parse(r.state_json).checks??[]) {
    if(!inWindow(c.createdAt)||!questionOf(c.questionId))continue;
    const q=questionOf(c.questionId);check('practice:'+q.id,q.kpId,c.correct,c.createdAt);
    if(c.stage==='retest'&&c.correct&&parse(r.state_json).verified)follow.add(q.kpId);
    evidence.push(['remediation',r.id,c]);if(c.observation)timings.push({questionId:q.id,stem:q.stem,createdAt:c.createdAt,correct:c.correct,...c.observation});
  }
  for(const r of rows('demo_attempts')) {
    if(!inWindow(r.created_at)||!HOSTED_DEMOS.some(d=>d.id===r.demo_id))continue;
    const snapshots=parse(r.questions_json,[]);
    for(const q of snapshots)if(q.stem&&String(q.studentAnswer??'').trim()) {
      check('demo:'+digest([r.demo_id,q.stem,q.referenceAnswer]),null,q.correct,r.created_at);
      if(q.observation)timings.push({questionId:'demo:'+r.demo_id,stem:q.stem,createdAt:r.created_at,correct:q.correct,...q.observation});
    }
    // Time-only heartbeats are observations, never task days or completed experiments.
    evidence.push(['demo',r.id,r.created_at,r.elapsed_minutes,r.questions_json]);
  }
  for(const r of rows('challenge_attempts')) {
    if(!inWindow(r.created_at)||!LEARNING_ITEMS.some(l=>l.id===r.challenge_id))continue;
    const prior=labs.get(r.challenge_id);
    labs.set(r.challenge_id,{challengeId:r.challenge_id,title:LEARNING_ITEMS.find(l=>l.id===r.challenge_id).title,submittedAt:r.created_at,passed:Boolean(r.passed),completed:Boolean(r.passed)||prior?.completed===true,submissions:(prior?.submissions??0)+1,elapsedMinutes:(prior?.elapsedMinutes??0)+Math.max(0,Math.min(1440,Number(r.elapsed_minutes)||0))});
    active.add(day(r.created_at));evidence.push(['lab',r.id,r.created_at,r.passed,r.elapsed_minutes]);
  }
  for(const r of db.prepare(`SELECT sa.question_id,sa.answer_json,sa.score,q.score AS possible,ss.submitted_at
    FROM submission_answers sa JOIN student_submissions ss ON ss.id=sa.submission_id
    JOIN assignment_questions q ON q.id=sa.question_id AND q.assignment_id=ss.assignment_id
    WHERE ss.student_id=? AND ss.status IN ('submitted','graded') ORDER BY ss.submitted_at,sa.question_id`).all(id)) {
    if(!inWindow(r.submitted_at)||!String(parse(r.answer_json,'')??'').trim())continue;
    check('assignment:'+r.question_id,null,r.score===null?null:r.score>=r.possible,r.submitted_at);
    evidence.push(['assignment',r.question_id,r.answer_json,r.score,r.submitted_at]);
  }
  for(const r of rows('assignment_reviews'))if(inWindow(r.created_at)) {check('assignment:'+r.question_id,null,r.is_correct,r.created_at);evidence.push(['assignment-review',r.id,r.is_correct,r.created_at]);}
  // Different evidence tables must share one timeline: older remediation cannot overwrite a later practice error.
  for(const {key,kp,correct,at} of checks.sort((a,b)=>timestamp(a.at)-timestamp(b.at))) {
    questions.set(key,{correct:correct===null?null:Boolean(correct),createdAt:at});active.add(day(at));
    if(correct&&(wrong.has(key)||(kp&&timestamp(at)>(help.get(kp)??Infinity))))follow.add(kp??key);
    if(correct!==null&&!correct)wrong.add(key);
  }
  const visits=db.prepare('SELECT * FROM study_visits WHERE student_id=?').all(id).filter(r=>inWindow(r.created_at)).length;
  const loginDays=new Set(db.prepare("SELECT created_at FROM audit_logs WHERE actor_user_id=? AND action='login_success'").all(id).filter(r=>inWindow(r.created_at)).map(r=>day(r.created_at))).size;
  const values={activeDays:active.size,questions:questions.size,labs:labs.size,followThrough:follow.size};
  const dimensions=[['持续任务',values.activeDays,policy.dayTarget,20],['题目参与',values.questions,policy.questionTarget,30],['实验参与',values.labs,policy.labTarget,30],['后续行动',values.followThrough,policy.followThroughTarget,20]].map(([label,count,target,maximum])=>({label,count,target,maximum,points:Math.round(Math.min(1,count/target)*maximum*100)/100}));
  const score=Math.min(100,Math.round(dimensions.reduce((s,d)=>s+d.points,0)*100)/100);
  const memory=allConversations.slice(-3).reverse().map(r=>({id:r.id,question:r.question,topic:r.topic,concepts:parse(r.concept_ids_json,[]).map(knowledgePointOf).filter(Boolean).map(k=>({id:k.id,title:k.title})),createdAt:r.created_at}));
  const confirmedBonuses=includePrivate?db.prepare(`SELECT r.id,r.bonus,r.reason,r.created_at AS createdAt,c.name AS className,r.snapshot_json AS snapshotJson,r.policy_version AS reviewedVersion,p.version AS currentVersion
    FROM study_bonus_reviews r JOIN classes c ON c.id=r.class_id JOIN class_members cm ON cm.class_id=c.id AND cm.student_id=r.student_id
    JOIN study_engagement_policies p ON p.class_id=c.id
    WHERE r.student_id=? AND r.id=(SELECT MAX(r2.id) FROM study_bonus_reviews r2 WHERE r2.class_id=r.class_id AND r2.student_id=r.student_id)`)
    .all(id).map(({snapshotJson,reviewedVersion,currentVersion,...r})=>({...r,startDate:parse(snapshotJson).policy?.startDate,endDate:parse(snapshotJson).policy?.endDate,needsReview:reviewedVersion!==currentVersion})):[];
  return {...values,score,level:score>=80?'并肩探索':score>=40?'默契成长':'初见小芯',dimensions,loginDays,visits,correctQuestions:[...questions.values()].filter(q=>q.correct).length,
    completedLabs:[...labs.values()].filter(l=>l.completed).length,labDetails:[...labs.values()],timings:timings.sort((a,b)=>timestamp(b.createdAt)-timestamp(a.createdAt)).slice(0,100),timingCount:timings.length,
    memory:includePrivate?memory:[],questionHistoryCount:conversations.length,confirmedBonuses,policy,
    evidenceToken:digest(evidence),rules:'持续任务20、不同题目30、不同实验30、订正或求助后练习20。登录、聊天次数、答题快慢不加分。',
    observationNote:'停留和实验时长为客户端观测；旧题目未采集时间。不能由时长判断犹豫、认真程度或独立完成。'};
}
function authorize(db,teacherId,classId,write=false) {
  if(!(write?teacherOwnsClassDirectly:teacherOwnsClass)(db,teacherId,classId))fail('无权操作此班级',403);
  if(write&&!canManage(db,teacherId,classId))fail('当前教师账号或班级只读',403);
  if(write&&db.prepare('SELECT status FROM classes WHERE id=?').get(classId)?.status!=='active')fail('班级已归档',409);
}
function canManage(db,teacherId,classId) {
  const profile=parse(getUserById(db,teacherId)?.profile_json);
  return teacherOwnsClassDirectly(db,teacherId,classId)&&!profile.demoAccount&&!profile.readOnly&&db.prepare('SELECT status FROM classes WHERE id=?').get(classId)?.status==='active';
}
export function saveEngagementPolicy(db,teacherId,classId,input,now=new Date()) {
  const policy=validatedPolicy(input);
  return db.transaction(()=>{
    authorize(db,teacherId,classId,true);const old=classPolicy(db,classId,now),version=old.version+1;
    if(old.version&&digest({...old,version:undefined})===digest({...policy,version:undefined}))return old;
    db.prepare(`INSERT INTO study_engagement_policies(class_id,version,policy_json,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(class_id) DO UPDATE SET version=excluded.version,policy_json=excluded.policy_json,updated_at=excluded.updated_at`).run(classId,version,JSON.stringify(policy),now.toISOString());
    audit(db,teacherId,classId,'study_bonus_policy',{version,policy});return {...policy,version};
  }).immediate();
}
function studentPreview(db,student,policy,now) {
  const summary=engagementSummary(db,student.id,policy,now,{includePrivate:false});
  const suggestedBonus=Math.round(policy.bonusCap*summary.score)/100;
  const reviewToken=digest([student.id,policy,summary.evidenceToken,summary.score]);
  return {...student,...summary,suggestedBonus,reviewToken};
}
const publicReview=r=>r?{id:r.id,bonus:r.bonus,reason:r.reason,createdAt:r.created_at,snapshot:parse(r.snapshot_json)}:null;
export function classEngagement(db,teacherId,classId,now=new Date()) {
  authorize(db,teacherId,classId);const policy=classPolicy(db,classId,now);
  const students=listClassStudents(db,classId).map(student=>({...studentPreview(db,student,policy,now),confirmation:publicReview(db.prepare('SELECT * FROM study_bonus_reviews WHERE class_id=? AND student_id=? AND policy_version=? ORDER BY id DESC LIMIT 1').get(classId,student.id,policy.version)),
    previousConfirmation:publicReview(db.prepare('SELECT * FROM study_bonus_reviews WHERE class_id=? AND student_id=? ORDER BY id DESC LIMIT 1').get(classId,student.id))}));
  return {policy,canManage:canManage(db,teacherId,classId),students};
}
function audit(db,teacherId,classId,action,metadata) {
  db.prepare("INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata_json) VALUES (?,'teacher',?,'class',?,?)").run(teacherId,action,String(classId),JSON.stringify(metadata));
}
export function confirmEngagementBonus(db,teacherId,classId,input,now=new Date()) {
  return db.transaction(()=>{
    authorize(db,teacherId,classId,true);
    const student=listClassStudents(db,classId).find(s=>s.id===input.studentId);if(!student)fail('学生不属于此班级',404);
    if(typeof input.clientSubmissionId!=='string'||!/^[-\w]{8,100}$/.test(input.clientSubmissionId))fail('审核提交标识无效');
    const previous=db.prepare('SELECT * FROM study_bonus_reviews WHERE class_id=? AND student_id=? AND client_submission_id=?').get(classId,student.id,input.clientSubmissionId);
    if(previous) {
      if(previous.review_token!==input.reviewToken||previous.bonus!==input.bonus||previous.reason!==String(input.reason??'').trim())fail('同一次审核不能更改',409);
      return publicReview(previous);
    }
    const policy=classPolicy(db,classId,now);if(!policy.version||policy.bonusCap<=0)fail('请先设置班级加分上限');
    const preview=studentPreview(db,student,policy,now);
    if(input.reviewToken!==preview.reviewToken)fail('审核依据已变化，请刷新并重新查看',409);
    const bonus=input.bonus,reason=String(input.reason??'').trim();
    if(typeof bonus!=='number'||!Number.isFinite(bonus)||bonus<0||bonus>policy.bonusCap||Math.abs(Math.round(bonus*100)-bonus*100)>0.00001)fail('审核加分超出班级上限或精度无效');
    if(reason.length>500||(bonus!==preview.suggestedBonus&&!reason))fail('调整建议加分时请填写审核理由（最多500字）');
    const result=db.prepare(`INSERT INTO study_bonus_reviews(class_id,student_id,teacher_id,policy_version,bonus,reason,snapshot_json,review_token,client_submission_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(classId,student.id,teacherId,policy.version,bonus,reason,JSON.stringify(preview),preview.reviewToken,input.clientSubmissionId,now.toISOString());
    audit(db,teacherId,classId,'study_bonus_confirmed',{reviewId:Number(result.lastInsertRowid),studentId:student.id,bonus,policyVersion:policy.version});
    return publicReview(db.prepare('SELECT * FROM study_bonus_reviews WHERE id=?').get(result.lastInsertRowid));
  }).immediate();
}
