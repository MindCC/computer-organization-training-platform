import { Router } from 'express';
import { askStudyAssistant } from './studyAssistant.js';

export function createStudyAssistantRouter({ requireRole, options = {} }) {
  const router = Router(), requests = new Map(), pending = new Set();
  router.post('/student/study-assistant', requireRole('student'), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const now = Date.now(), id = req.user.id;
    for (const [key, times] of requests) if (times.every(time => now - time >= 60000)) requests.delete(key);
    const times = (requests.get(id) ?? []).filter(time => now - time < 60000);
    if (pending.has(id) || times.length >= 10) return res.status(429).json({ error: { code: 'AI_BUSY', message: '小芯正在思考，请稍后再问。每分钟最多提问十次。' } });
    // Reconstruct an allowlist. Even a modified client cannot auto-forward private learning data.
    const body = req.body ?? {}, context = body.context ?? {};
    const payload = { question: body.question, consent: body.consent, context: { questionId: context.questionId, conceptId: context.conceptId, chapterId: context.chapterId } };
    pending.add(id); requests.set(id, [...times, now]);
    try { res.json(await askStudyAssistant(payload, options)); }
    catch (error) { res.status(error.status ?? 500).json({ error: { code: 'STUDY_QUESTION_INVALID', message: error.status ? error.message : '提问暂时失败，请重试。' } }); }
    finally { pending.delete(id); }
  });
  return router;
}
