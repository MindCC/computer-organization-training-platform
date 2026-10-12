import { COURSE_CHAPTERS } from '../src/courseChapters.js';
import { knowledgePointOf } from '../src/knowledgePoints.js';
import { matchStudyConcepts } from './studyRecommendationTopics.js';

const chapterNames = new Map(COURSE_CHAPTERS.map(chapter => [chapter.id, chapter.title]));
const patterns = [
  ['ch1', /计算机组成|冯诺依曼|硬件组成|软件组成/i],
  ['ch2', /补码|原码|反码|机器数|浮点|定点|移位|溢出/i],
  ['ch3', /加法器|运算器|ALU|进位|乘法|除法|逻辑门/i],
  ['ch4', /存储|内存|缓存|Cache|RAM|ROM|地址译码/i],
  ['ch5', /指令|寻址|操作码|汇编/i],
  ['ch6', /CPU|寄存器|控制器|流水线|取指/i],
  ['ch7', /总线|仲裁|数据线|地址线/i],
  ['ch8', /输入输出|I\/O|中断|DMA|外设/i],
];

export function conversationTopic(question, context = {}) {
  const concept = knowledgePointOf(context.conceptId);
  const detected = patterns.find(([, pattern]) => pattern.test(question))?.[0] ?? null;
  const chapterId = detected ?? concept?.chapterId ?? (chapterNames.has(context.chapterId) ? context.chapterId : null);
  return { chapterId, topic: concept && (!detected || detected === concept.chapterId) ? concept.title : (chapterId ? chapterNames.get(chapterId) : '待归类课程问题') };
}

export function saveAiConversation(db, { studentId, kind, question, answer, context = {} }) {
  const { chapterId, topic } = conversationTopic(question, context);
  const result = db.prepare(`INSERT INTO ai_conversations
    (student_id, kind, question, answer_json, answer_source, chapter_id, topic, concept_ids_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(studentId, kind, question.trim(), JSON.stringify(answer), answer.source ?? 'local', chapterId, topic, JSON.stringify(matchStudyConcepts(question,context)));
  return Number(result.lastInsertRowid);
}

export function listAiConversations(db, studentId, limit = 100, beforeId = null) {
  return db.prepare(`SELECT id,kind,question,answer_json AS answerJson,answer_source AS answerSource,
    chapter_id AS chapterId,topic,created_at AS createdAt FROM ai_conversations
    WHERE student_id=? ${beforeId ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`)
    .all(...(beforeId ? [studentId,beforeId,limit] : [studentId,limit])).map(({ answerJson, ...row }) => ({ ...row, answer: JSON.parse(answerJson) }));
}

export function conversationPage(db, studentId, beforeId) {
  const before = Number(beforeId);
  if (beforeId !== undefined && (!Number.isSafeInteger(before) || before < 1)) throw Object.assign(new Error('记录位置无效'),{status:400});
  const rows = listAiConversations(db, studentId, 51, beforeId === undefined ? null : before);
  return { conversations:rows.slice(0,50), hasMore:rows.length>50 };
}

export function aiConversationSummary(db, studentId) {
  const rows = db.prepare(`SELECT chapter_id AS chapterId,topic,kind,answer_source AS answerSource,COUNT(*) AS count
    FROM ai_conversations WHERE student_id=? GROUP BY chapter_id,topic,kind,answer_source`).all(studentId);
  const topics = new Map();
  for (const row of rows) {
    const key = `${row.chapterId ?? ''}:${row.topic}`;
    const item = topics.get(key) ?? { chapterId: row.chapterId, topic: row.topic, count: 0 };
    item.count+=row.count; topics.set(key, item);
  }
  return { total: rows.reduce((sum,row)=>sum+row.count,0), questions: rows.filter(row => row.kind === 'question').reduce((sum,row)=>sum+row.count,0),
    labHints: rows.filter(row => row.kind === 'lab_hint').reduce((sum,row)=>sum+row.count,0),
    aiResponses:rows.filter(row=>row.answerSource==='ai').reduce((sum,row)=>sum+row.count,0),
    topics: [...topics.values()].sort((a,b) => b.count - a.count || a.topic.localeCompare(b.topic)) };
}

export function classAiConversationSummary(students) {
  const topics = new Map();
  for (const student of students) for (const item of student.aiConversations?.topics ?? []) {
    const key = `${item.chapterId ?? ''}:${item.topic}`;
    const entry = topics.get(key) ?? { chapterId: item.chapterId, topic: item.topic, count: 0, studentIds: new Set() };
    entry.count += item.count; entry.studentIds.add(student.id); topics.set(key, entry);
  }
  return { total: students.reduce((sum, student) => sum + (student.aiConversations?.total ?? 0), 0),
    students: students.filter(student => student.aiConversations?.total).length,
    aiResponses:students.reduce((sum,student)=>sum+(student.aiConversations?.aiResponses??0),0),
    topics: [...topics.values()].map(({studentIds,...item}) => ({...item, students: studentIds.size}))
      .sort((a,b) => b.count - a.count || a.topic.localeCompare(b.topic)) };
}
