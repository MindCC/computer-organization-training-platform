import { Router } from 'express';
import { askStudyAssistant } from './studyAssistant.js';
import { conversationPage, saveAiConversation } from './aiConversationRepository.js';
import { taskChainQuestionContext } from './classroomTaskChain.js';
import { selectedStudyMemory } from './studyEngagement.js';

export function createStudyAssistantRouter({ db, requireRole, options = {} }) {
  const router = Router(), requests = new Map(), pending = new Set();
  for(const role of ['student','teacher']) {
  router.get(`/${role}/study-assistant/history`, requireRole(role), (req,res) => {
    res.set('Cache-Control', 'no-store');
    try {res.json(role==='student' ? conversationPage(db, req.user.id, req.query.before) : {conversations:[],hasMore:false});}
    catch(error){res.status(error.status??500).json({error:{message:error.message}});}
  });
  router.post(`/${role}/study-assistant`, requireRole(role), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const now = Date.now(), id = req.user.id;
    for (const [key, times] of requests) if (times.every(time => now - time >= 60000)) requests.delete(key);
    const times = (requests.get(id) ?? []).filter(time => now - time < 60000);
    if (pending.has(id) || times.length >= 10) return res.status(429).json({ error: { code: 'AI_BUSY', message: '小芯正在思考，请稍后再问。每分钟最多提问十次。' } });
    // Reconstruct an allowlist. Even a modified client cannot auto-forward private learning data.
    const body = req.body ?? {}, context = body.context ?? {};
    const payload = { question: body.question, consent: body.consent, stateConsent:body.stateConsent,
      lectureExcerpt: body.lectureExcerpt, materialConsent: body.materialConsent,
      context: { questionId: context.questionId, conceptId: context.conceptId, chapterId: context.chapterId, lectureIndex: context.lectureIndex, assembly:body.stateConsent==='current-task-state'?context.assembly:undefined,circuit:body.stateConsent==='current-task-state'?context.circuit:undefined } };
    pending.add(id); requests.set(id, [...times, now]);
    try {
      const classroom=role==='student'?taskChainQuestionContext(db,id,body.classroom):null;
      const selectedMemory=selectedStudyMemory(db,id,body.memoryIds,body.memoryConsent);
      const answer = await askStudyAssistant(payload, {...options,selectedMemory});
      let classroomAnswer;
      if (role === 'student') {
        const conversationId=saveAiConversation(db, { studentId:id, kind:'question', question:body.question, answer, context:payload.context });
        if(classroom&&!['COURSE_SCOPE_REJECTED','COURSE_SCOPE_UNVERIFIED','COURSE_ANSWER_REJECTED'].includes(answer.reason)) {
          // Recheck after the asynchronous reply: an ended/changed stage cannot unlock another one.
          const current=taskChainQuestionContext(db,id,classroom);
          db.prepare('INSERT INTO classroom_stage_ai_answers (session_id,student_id,stage_id,conversation_id) VALUES (?,?,?,?)').run(current.sessionId,id,current.stageId,conversationId);
          classroomAnswer={...current,conversationId};
        }
      }
      res.json({...answer,...(classroomAnswer?{classroomAnswer}:{})});
    }
    catch (error) { res.status(error.status ?? 500).json({ error: { code: 'STUDY_QUESTION_INVALID', message: error.status ? error.message : '提问暂时失败，请重试。' } }); }
    finally { pending.delete(id); }
  });
  }
  return router;
}
