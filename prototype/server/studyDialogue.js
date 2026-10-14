function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

// Reconstruct only explicitly chosen, account-owned course turns; never accept client-supplied answers.
export function selectedStudyDialogue(db, userId, ids, consent) {
  if (ids === undefined) return [];
  if (!Array.isArray(ids) || ids.length > 3 || ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) invalid('本次最多关联最近三轮课程对话');
  if (!ids.length) return [];
  if (consent !== 'current-course-dialogue') invalid('请确认本次答疑关联前文的问题和回复');
  return ids.map(id => {
    const row = db.prepare('SELECT question,answer_json,chapter_id FROM ai_conversations WHERE id=? AND student_id=?').get(id, userId);
    if (!row) invalid('关联的课程对话不存在或不属于当前账号', 404);
    const answer = JSON.parse(row.answer_json);
    if (/^COURSE_(SCOPE|ANSWER)_/.test(answer.reason ?? '')) invalid('未通过课程范围确认的对话不能作为答疑前文');
    return { question: row.question.slice(0, 1600), chapterId: row.chapter_id, answer: {
      explanation: String(answer.explanation ?? answer.hint?.conceptReview ?? '').slice(0, 2000),
      steps: (Array.isArray(answer.steps) ? answer.steps : []).filter(step => typeof step === 'string').slice(0, 4).map(step => step.slice(0, 300)),
      check: String(answer.check ?? '').slice(0, 400),
    } };
  });
}
