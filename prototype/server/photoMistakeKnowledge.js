import { ASSIGNMENT_QUESTIONS } from '../src/assignmentQuestions.js';
import { buildFtsMatchQuery, createKnowledgeRepository } from './knowledgeRepository.js';

// Preserve signs, decimal points, operators and blanks: a numerically different
// exercise must never inherit an answer merely because it has the same topic.
const normalized = value => String(value ?? '').normalize('NFC').replace(/\s+/gu, '').replace(/[？?。]+$/u, '');
const optionsMatch = (left, right) => left.length === right.length && left.every((option, index) => normalized(option) === normalized(right[index]));

function bankMatch(question, mistake) {
  return question.type === mistake.qtype && (!mistake.chapterId || question.chapterId === mistake.chapterId)
    && normalized(question.stem) === normalized(mistake.stem)
    && (mistake.qtype !== 'choice' || optionsMatch(question.options ?? [], mistake.options ?? []));
}

function bankAnswer(question) {
  const answer = question.answer || question.keywords?.map(group => group.join(' / ')).join('；');
  if (!answer) return null;
  return question.type === 'truefalse' ? answer === 'true' ? '正确' : '错误' : String(answer);
}

// Documents remain source quotations, never claimed to be model-generated or
// individualized error diagnosis. Only an explicit question + answer is reusable.
function documentAnswer(content, mistake) {
  const blocks = String(content).split(/^\s*(?:#{1,6}\s*)?(?:题目|题干|问题|例题)\s*[:：]\s*/gm);
  for (const block of blocks) {
    const answerMarker = /^\s*(?:参考答案|正确答案|答案|解答)\s*[:：]\s*/m.exec(block);
    if (!answerMarker) continue;
    const rawQuestion = block.slice(0, answerMarker.index).trim();
    const lines = rawQuestion.split('\n');
    const options = [];
    const stem = [];
    for (const line of lines) {
      const option = /^\s*([A-H])[.、．)）:：]\s*(.+)$/.exec(line);
      if (option) {
        if (option[1] !== String.fromCharCode(65 + options.length)) { options.push('INVALID_OPTION_ORDER'); break; }
        options.push(option[2]);
      } else stem.push(line);
    }
    if (normalized(stem.join('\n')) !== normalized(mistake.stem)) continue;
    if (mistake.qtype === 'choice' ? !optionsMatch(options, mistake.options ?? []) : options.length) continue;
    const tail = block.slice(answerMarker.index + answerMarker[0].length).trim();
    const analysisMarker = /^\s*(?:解析|分析|解题思路)\s*[:：]\s*/m.exec(tail);
    let answer = (analysisMarker ? tail.slice(0, analysisMarker.index) : tail).trim();
    const analysis = analysisMarker ? tail.slice(analysisMarker.index + analysisMarker[0].length).trim() : '';
    if (mistake.qtype === 'choice') {
      if (/^[A-H]$/.test(answer)) answer = options[answer.charCodeAt(0) - 65] ?? '';
      if (!options.some(option => normalized(option) === normalized(answer))) continue;
    }
    if (answer && answer.length <= 2000 && analysis.length <= 3000) return { answer, analysis };
  }
  return null;
}

export function findPhotoKnowledgeAnswer(db, ownerId, mistake) {
  const repository = createKnowledgeRepository(db);
  for (const hit of repository.searchAnswerChunks(ownerId, buildFtsMatchQuery(mistake.stem))) {
    const answer = documentAnswer(hit.content, mistake);
    if (answer) return { ...answer, references: [{ kind: 'knowledge-document', documentId: hit.documentId,
      chunkId: hit.chunkId, title: hit.documentTitle, pageNo: hit.pageNo }] };
  }
  for (const question of ASSIGNMENT_QUESTIONS) {
    if (!bankMatch(question, mistake)) continue;
    const answer = bankAnswer(question);
    if (answer) return { answer, analysis: question.analysis ?? '', references: [{ kind: 'course-question', questionId: question.id, title: '课程题库' }] };
  }
  // Teacher question banks are private. The account ID is always supplied by
  // the authenticated route, never by a client-provided teacher/class ID.
  const rows = db.prepare('SELECT * FROM question_bank WHERE teacher_id = ? AND type = ?').all(ownerId, mistake.qtype);
  for (const row of rows) {
    const question = { type: row.type, chapterId: row.chapter_id, stem: row.stem, options: JSON.parse(row.options_json), answer: JSON.parse(row.answer_json) };
    if (!bankMatch(question, mistake)) continue;
    const answer = bankAnswer(question);
    if (answer) return { answer, analysis: row.analysis ?? '', references: [{ kind: 'teacher-question', questionId: row.id, title: '我的教师题库' }] };
  }
  return null;
}
