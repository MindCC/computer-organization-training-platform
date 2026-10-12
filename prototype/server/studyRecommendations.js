import { KNOWLEDGE_POINTS, knowledgePointOf, knowledgePointsForChallenge } from '../src/knowledgePoints.js';
import { ASSIGNMENT_QUESTIONS, questionOf, gradeQuestion } from '../src/assignmentQuestions.js';
import { COURSE_CHAPTERS } from '../src/courseChapters.js';
import { HOSTED_DEMOS } from '../src/shared/demoNavigation.js';
import { buildUnifiedMistakeBook } from './learningPractice.js';
import { matchStudyConcepts } from './studyRecommendationTopics.js';
import { normalizeQuestionObservation } from './questionObservation.js';

const DAY = 86400000;
const parse = (value, fallback = {}) => { try { return JSON.parse(value); } catch { return fallback; } };
const timestamp = value => new Date(/^\d{4}-\d{2}-\d{2} /.test(value ?? '') ? value.replace(' ','T')+'Z' : value).getTime();
const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
const bank = id => ASSIGNMENT_QUESTIONS.filter(q => q.kpId === id && ['choice','truefalse','fill'].includes(q.type));
const chapterTitle = id => COURSE_CHAPTERS.find(c => c.id === id)?.title ?? id;
const accepted = row => !/^COURSE_(SCOPE|ANSWER)_/.test(parse(row.answer_json).reason ?? '');
const conversations = (db,id) => db.prepare('SELECT * FROM ai_conversations WHERE student_id=? ORDER BY id').all(id).filter(accepted);
const ownedSessions = (db,id) => db.prepare('SELECT * FROM study_remediation_sessions WHERE student_id=? ORDER BY id').all(id);
const practiceRows = (db,id) => db.prepare('SELECT * FROM chapter_practice_attempts WHERE student_id=? ORDER BY id').all(id);

export function recommendations(db, studentId, now = new Date()) {
  const end=now.getTime(), cutoff=end-30*DAY, points=new Map(), latestCorrect=new Map();
  function point(id) {
    const kp=knowledgePointOf(id); if(!kp)return null;
    if(!points.has(kp.id))points.set(kp.id,{kp,questions:0,mistakes:0,labs:0,lastHelp:0,lastError:0,latest:0});
    return points.get(kp.id);
  }
  for(const row of conversations(db,studentId)) {
    const at=timestamp(row.created_at); if(at<cutoff||at>end)continue;
    const ids=parse(row.concept_ids_json,[]);
    for(const id of ids.length?ids:matchStudyConcepts(row.question)) {
      const p=point(id); if(!p)continue;
      p.questions++;p.lastHelp=Math.max(p.lastHelp,at);p.latest=Math.max(p.latest,at);
    }
  }
  // Each question's latest result prevents a later mistake being hidden by an older success.
  for(const row of practiceRows(db,studentId)) {
    const at=timestamp(row.created_at);if(at>end)continue;
    for(const [id,result] of Object.entries(parse(row.results_json))) {
      const q=questionOf(id);if(!q)continue;
      latestCorrect.set(id,{conceptId:q.kpId,correct:result.correct===true,at});
    }
  }
  const correctByConcept=new Map();
  for(const q of latestCorrect.values())if(q.correct&&q.at>=cutoff) {
    if(!correctByConcept.has(q.conceptId))correctByConcept.set(q.conceptId,[]);
    correctByConcept.get(q.conceptId).push(q.at);
  }
  for(const [id,times] of correctByConcept)if(times.length>=2) {
    const p=point(id);p.latest=Math.max(p.latest,...times);
  }
  for(const item of buildUnifiedMistakeBook(db,studentId).items) {
    if(item.resolved)continue;
    const at=timestamp(item.updatedAt??item.lastSeen??item.firstSeen);if(at<cutoff||at>end)continue;
    const ids=item.source==='lab'?knowledgePointsForChallenge(item.challengeId).map(p=>p.id):
      item.kpId?[item.kpId]:item.source==='practice'?[questionOf(item.questionId)?.kpId]:matchStudyConcepts(item.knowledgeLabel??item.stem??'');
    for(const id of ids) {
      const p=point(id);if(!p)continue;
      if(item.source==='lab')p.labs++;else p.mistakes++;
      p.lastError=Math.max(p.lastError,at);p.latest=Math.max(p.latest,at);
    }
  }
  const sessions=ownedSessions(db,studentId).map(row=>({...row,state:parse(row.state_json)}));
  for(const row of sessions) {
    const at=timestamp(row.updated_at);if(at<cutoff||at>end)continue;
    if(row.state.verified){const p=point(row.concept_id);p.latest=Math.max(p.latest,at);}
    const failed=(row.state.checks??[]).filter(c=>!c.correct&&timestamp(c.createdAt)>=cutoff&&timestamp(c.createdAt)<=end);
    if(failed.length){const p=point(row.concept_id),last=Math.max(...failed.map(c=>timestamp(c.createdAt)));p.mistakes++;p.lastError=Math.max(p.lastError,last);p.latest=Math.max(p.latest,last);}
  }
  const feedback=new Map(db.prepare('SELECT * FROM study_recommendation_feedback WHERE student_id=?').all(studentId).map(row=>[row.concept_id,row]));
  const hidden = p => {
    const f=feedback.get(p.kp.id),at=timestamp(f?.created_at);
    return f && end-at < (f.choice==='later'?DAY:7*DAY) && p.lastError<=at;
  };
  const verifiedAt = id => Math.max(0,...sessions.filter(r=>r.concept_id===id&&r.state.verified).map(r=>timestamp(r.updated_at)));
  const passedLaterAt = p => {
    const times=[...latestCorrect.values()].filter(q=>q.conceptId===p.kp.id&&q.correct&&q.at>=Math.max(p.lastHelp,p.lastError)).map(q=>q.at);
    return times.length>=2?Math.max(...times):0;
  };
  const candidates=[];
  for(const p of points.values()) {
    if(hidden(p))continue;
    const verified=verifiedAt(p.kp.id),confirmed=Math.max(verified,passedLaterAt(p));
    if(confirmed>=p.latest&&end-confirmed<7*DAY)continue;
    const review=confirmed>=p.latest&&end-confirmed>=7*DAY;
    const reason=[p.questions?`近30天有 ${p.questions} 条相关提问或求助`:null,!review&&p.mistakes?`${p.mistakes} 项相关错题或检查未通过`:null,!review&&p.labs?`${p.labs} 项关联实验未通过（尚不能定位具体概念）`:null,review?'上次相关检查已通过，适合间隔自测':null].filter(Boolean).join('；');
    candidates.push({conceptId:p.kp.id,title:p.kp.title,chapterId:p.kp.chapterId,chapterTitle:chapterTitle(p.kp.chapterId),
      kind:review?'review':p.mistakes?'remediation':'diagnosis',reason,evidenceLabel:review?'检查通过后的复习安排，不代表遗忘':p.mistakes?'有答题错误证据，先检查具体困惑':'学习线索，尚不能判断未掌握',
      questionCount:bank(p.kp.id).length,prerequisites:p.kp.deps.map(knowledgePointOf).filter(Boolean).map(k=>({id:k.id,title:k.title})),
      score:(p.mistakes?50:0)+Math.min(15,p.questions*5)+(p.labs?10:0)+Math.max(0,10-(end-p.latest)/DAY),latest:p.latest});
  }
  // Evidence-backed prerequisite targets outrank the concepts that depend on them.
  for(const item of candidates)if(candidates.some(other=>other.prerequisites.some(p=>p.id===item.conceptId))) {item.score+=20;item.reason+='；它也是其他推荐知识点的前置基础';}
  candidates.sort((a,b)=>b.score-a.score||b.latest-a.latest||a.conceptId.localeCompare(b.conceptId));
  const chosen=[],chapters=new Set();
  for(const item of candidates)if(!chapters.has(item.chapterId)&&chosen.length<3){chosen.push(item);chapters.add(item.chapterId);}
  for(const item of candidates)if(chosen.length<3&&!chosen.includes(item))chosen.push(item);
  if(!chosen.length) {
    const chapterClue=conversations(db,studentId).filter(r=>timestamp(r.created_at)>=cutoff&&timestamp(r.created_at)<=end).at(-1)?.chapter_id;
    const starters=KNOWLEDGE_POINTS.filter(kp=>bank(kp.id).length&&!points.has(kp.id)&&!hidden({kp,lastError:0}));
    const starter=starters.find(kp=>kp.chapterId===chapterClue)??starters[0];
    if(starter)chosen.push({conceptId:starter.id,title:starter.title,chapterId:starter.chapterId,chapterTitle:chapterTitle(starter.chapterId),kind:'diagnosis',
      reason:'暂无需要补学的充分证据，可以从一道课程诊断题开始。',evidenceLabel:'自测起点，不代表你的薄弱点',questionCount:bank(starter.id).length,prerequisites:[]});
  }
  const active=sessions.filter(row=>row.state.stage!=='complete').at(-1);
  return {source:'local-evidence',items:chosen.map(({score,latest,...item})=>item),activeSession:active?{id:active.id,title:knowledgePointOf(active.concept_id)?.title}:null,spark:sparkSummary(db,studentId,now)};
}

export function feedbackRecommendation(db,id,conceptId,choice,now=new Date()) {
  if(!knowledgePointOf(conceptId)||!['not-difficulty','later'].includes(choice))fail('推荐反馈无效');
  db.prepare(`INSERT INTO study_recommendation_feedback (student_id,concept_id,choice,created_at) VALUES (?,?,?,?)
    ON CONFLICT(student_id,concept_id) DO UPDATE SET choice=excluded.choice,created_at=excluded.created_at`).run(id,conceptId,choice,now.toISOString());
  return {saved:true};
}

function sessionRow(db,id,sessionId) {
  if(!Number.isSafeInteger(Number(sessionId))||Number(sessionId)<1)fail('补学记录不存在',404);
  const row=db.prepare('SELECT * FROM study_remediation_sessions WHERE student_id=? AND id=?').get(id,sessionId);
  if(!row)fail('补学记录不存在',404);return row;
}
function publicSession(row) {
  const state=parse(row.state_json),kp=knowledgePointOf(row.concept_id);
  const q=state.pendingResult?null:questionOf(state.questionId);
  return {id:row.id,conceptId:kp.id,title:kp.title,chapterId:kp.chapterId,stage:state.stage,verified:Boolean(state.verified),
    summary:kp.summary,prerequisites:kp.deps.map(knowledgePointOf).filter(Boolean).map(k=>({id:k.id,title:k.title,summary:k.summary})),
    resources:{demoId:HOSTED_DEMOS.find(d=>d.chapterId===kp.chapterId)?.id,challengeIds:kp.challengeIds,chapterId:kp.chapterId},
    question:q?{id:q.id,stem:q.stem,type:q.type,options:q.options??[]}:null,
    lastResult:state.lastResult??null,pendingResult:Boolean(state.pendingResult),limitation:state.limitation??'',
    coverage:bank(kp.id).length,updatedAt:row.updated_at};
}
export function remediationSession(db,id,sessionId) {return publicSession(sessionRow(db,id,sessionId));}
export function startRemediation(db,id,conceptId,now=new Date()) {
  const kp=knowledgePointOf(conceptId);if(!kp)fail('知识点不存在',404);
  return db.transaction(()=>{
    const previous=ownedSessions(db,id).filter(row=>row.concept_id===kp.id).at(-1);
    if(previous&&(parse(previous.state_json).stage!=='complete'||beijingDay(previous.created_at)===beijingDay(now)))return publicSession(previous);
    const questions=bank(kp.id),state={stage:questions.length?'diagnosis':'learning',questionId:questions[0]?.id??null,
      diagnosisId:questions[0]?.id??null,practiceId:questions[Math.min(1,Math.max(0,questions.length-2))]?.id??null,
      retestId:questions.length>=2?questions.at(-1).id:null,failedRetests:[],checks:[],verified:false};
    const at=now.toISOString();
    const result=db.prepare('INSERT INTO study_remediation_sessions (student_id,concept_id,state_json,created_at,updated_at) VALUES (?,?,?,?,?)').run(id,kp.id,JSON.stringify(state),at,at);
    return remediationSession(db,id,Number(result.lastInsertRowid));
  })();
}
export function submitRemediation(db,id,sessionId,payload={},now=new Date()) {
  return db.transaction(()=>{
    const row=sessionRow(db,id,sessionId),state=parse(row.state_json);
    const observation=normalizeQuestionObservation(payload.observation);
    const normalized={action:payload.action,questionId:payload.questionId,value:payload.value,...(observation?{observation}:{})};
    if(JSON.stringify(state.lastSubmission)===JSON.stringify(normalized))return publicSession(row);
    if(state.stage==='complete')fail('本轮补学已结束',409);
    if(payload.action==='continue'&&state.stage==='learning') {
      state.lastResult=null;
      state.stage=state.practiceId?'practice':'complete';state.questionId=state.practiceId;
      if(!state.practiceId)state.limitation='题量不足：已阅读公开知识讲解，尚无答题或复测证据。';
    } else if(payload.action==='retry'&&state.pendingResult) {
      state.pendingResult=false;
      if(state.stage==='retest') {
        const next=bank(row.concept_id).find(q=>![state.diagnosisId,state.practiceId,...state.failedRetests].includes(q.id));
        if(next)state.questionId=next.id;
      }
      state.lastResult=null;
    } else if(payload.action==='answer') {
      if(state.pendingResult||!['diagnosis','practice','retest'].includes(state.stage)||payload.questionId!==state.questionId)fail('请提交当前题目',409);
      if(typeof payload.value!=='string'||!payload.value.trim()||payload.value.length>2000)fail('请输入不超过2000字的答案');
      const q=questionOf(state.questionId),result=gradeQuestion(q,payload.value),stage=state.stage;
      const check={questionId:q.id,stage,correct:result.correct,createdAt:now.toISOString(),...(observation?{observation}:{})};state.checks.push(check);
      state.lastResult={...check,explanation:q.analysis,referenceAnswer:q.answer??q.keywords?.map(g=>Array.isArray(g)?g[0]:g).join('、')};
      if(stage==='diagnosis'){state.stage='learning';state.questionId=null;}
      else if(!result.correct){state.pendingResult=true;if(stage==='retest')state.failedRetests.push(q.id);}
      else if(stage==='practice') {
        if(state.retestId){state.stage='retest';state.questionId=state.retestId;}
        else {state.stage='complete';state.questionId=null;state.limitation='题量不足：练习已完成，缺少不同题号的复测证据。';}
      } else {
        state.stage='complete';state.questionId=null;
        state.verified=q.id!==state.practiceId&&q.id!==state.diagnosisId&&!state.failedRetests.includes(q.id);
        if(!state.verified)state.limitation='本题曾展示过答案，本轮仅记录订正完成，需新的题目验证。';
      }
    } else fail('当前补学阶段不支持此操作',409);
    state.lastSubmission=normalized;
    db.prepare('UPDATE study_remediation_sessions SET state_json=?,updated_at=? WHERE student_id=? AND id=?').run(JSON.stringify(state),now.toISOString(),id,row.id);
    return remediationSession(db,id,row.id);
  })();
}

export function beijingDay(value) {
  const at=value instanceof Date?value.getTime():timestamp(value);
  return Number.isFinite(at)?new Date(at+8*3600000).toISOString().slice(0,10):null;
}
export function sparkSummary(db,id,now=new Date()) {
  const end=now.getTime(),days=new Map(),breakthroughs=new Set();
  function day(at){const key=beijingDay(at);if(!key||timestamp(at)>end)return null;if(!days.has(key))days.set(key,{effective:false,supplement:false,breakthrough:false});return days.get(key);}
  for(const row of practiceRows(db,id))if(Object.entries(parse(row.results_json)).some(([qid,r])=>questionOf(qid)&&r.correct===true)){const d=day(row.created_at);if(d)d.effective=true;}
  for(const row of db.prepare('SELECT created_at FROM challenge_attempts WHERE student_id=? AND passed=1').all(id)){const d=day(row.created_at);if(d)d.effective=true;}
  for(const row of db.prepare('SELECT created_at,questions_json FROM demo_attempts WHERE student_id=?').all(id))if(parse(row.questions_json,[]).some(q=>q.correct===true)){const d=day(row.created_at);if(d)d.effective=true;}
  for(const row of ownedSessions(db,id)) {
    const state=parse(row.state_json);
    for(const check of state.checks??[])if(check.correct){const d=day(check.createdAt);if(d)d.effective=true;}
    const d=day(row.updated_at);if(!d)continue;
    if(state.stage==='complete'&&(state.checks??[]).some(q=>q.stage==='practice'&&q.correct))d.supplement=true;
    if(state.verified&&!breakthroughs.has(row.concept_id)){d.breakthrough=true;breakthroughs.add(row.concept_id);}
  }
  const entries=[...days].map(([date,d])=>({date,points:(d.effective?2:0)+(d.supplement?3:0)+(d.breakthrough?5:0)})).filter(d=>d.points>0).sort((a,b)=>a.date.localeCompare(b.date));
  const today=beijingDay(now),effectiveDays=new Set(entries.map(d=>d.date));
  let cursor=new Date(today+'T00:00:00Z'),streak=0;
  if(!effectiveDays.has(today))cursor=new Date(cursor.getTime()-DAY);
  while(effectiveDays.has(cursor.toISOString().slice(0,10))){streak++;cursor=new Date(cursor.getTime()-DAY);}
  const totalPoints=entries.reduce((sum,d)=>sum+d.points,0),level=totalPoints>=100?'并肩探索':totalPoints>=30?'默契成长':'初见火花';
  return {today,todayPoints:entries.find(d=>d.date===today)?.points??0,totalPoints,streak,level,breakthroughs:breakthroughs.size,
    nextLevelAt:totalPoints>=100?null:totalPoints>=30?100:30,days:entries.slice(-14),rules:'有效答题或实验通过 +2／日；完成有正确练习证据的补学 +3／日；首次通过知识点复测 +5，同日最多一次。每日上限10。提问、浏览和自报完成不加分。'};
}
