import { Router } from "express";
import { questionsForChapter, questionOf, gradeQuestion } from "../src/assignmentQuestions.js";
import { COURSE_CHAPTERS } from "../src/courseChapters.js";
import { LEARNING_ITEMS } from "../src/platformLogic.js";
import { buildMistakeBook } from "../src/mistakeBook.js";
import { gradeObjectiveAnswer } from "./objectiveGrading.js";
import { serviceMistakes } from './shopServiceRoutes.js';

const parse = (value, fallback = {}) => { try { return JSON.parse(value); } catch { return fallback; } };
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const hasAnswer = value => ["string","boolean","number"].includes(typeof value) && String(value).trim().length > 0;
const utcTime = value => /^\d{4}-\d{2}-\d{2} /.test(value ?? "") ? value.replace(" ","T")+"Z" : value;
function requestId(value) {
  if (typeof value !== "string" || !/^[\w-]{8,100}$/.test(value)) fail("提交标识无效，请重新提交");
  return value;
}
function answerText(value) {
  if (typeof value !== "string" || value.length > 2000) fail("答案需为不超过 2000 字的文本");
  return value;
}
const chapterTitle = id => COURSE_CHAPTERS.find(chapter => chapter.id === id)?.title ?? id;
function reference(type, answer, keywords) {
  if (type === "truefalse") return String(answer).toLowerCase() === "true" ? "正确" : "错误";
  if (keywords) return keywords.map(group => Array.isArray(group) ? group[0] : group).join("、");
  return String(answer ?? "");
}
function practiceRows(db, studentId) {
  return db.prepare("SELECT * FROM chapter_practice_attempts WHERE student_id = ? ORDER BY id ASC").all(studentId);
}
export function practiceState(db, studentId) {
  const answers = {}, graded = {};
  for (const row of practiceRows(db, studentId)) {
    Object.assign(answers, parse(row.answers_json));
    Object.assign(graded, parse(row.results_json));
  }
  return {answers, graded};
}

const assignmentMistakeSql = `
  SELECT q.*, a.title AS assignment_title, ss.feedback, ss.submitted_at, ss.graded_at,
    sa.answer_json AS student_answer_json, sa.score AS earned
  FROM submission_answers sa
  JOIN student_submissions ss ON ss.id = sa.submission_id
  JOIN assignment_questions q ON q.id = sa.question_id AND q.assignment_id = ss.assignment_id
  JOIN assignments a ON a.id = q.assignment_id
  JOIN class_members cm ON cm.class_id = a.class_id AND cm.student_id = ss.student_id
  WHERE ss.student_id = ? AND ss.status IN ('submitted','graded')
    AND sa.score IS NOT NULL AND sa.score < q.score`;

export function createLearningPracticeRouter({db, requireRole, role = 'student'}) {
  const router = Router();
  router.get(`/${role}/chapter-practice`, requireRole(role), (req, res) => res.json(practiceState(db, req.user.id)));
  router.post(`/${role}/chapter-practice`, requireRole(role), (req, res, next) => {
    try {
      const {chapterId, answers, clientSubmissionId} = req.body ?? {};
      const id = requestId(clientSubmissionId), questions = questionsForChapter(chapterId);
      if (!questions.length || !answers || typeof answers !== "object" || Array.isArray(answers)) fail("章节或答案无效");
      const keys = Object.keys(answers).sort();
      if (!keys.length || keys.length > questions.length) fail("请选择要提交的题目");
      const normalized = {}, results = {};
      for (const key of keys) {
        const question = questions.find(q => q.id === key);
        if (!question) fail("题目不属于当前章节");
        normalized[key] = answerText(answers[key]);
        results[key] = gradeQuestion(question, normalized[key]);
      }
      const json = JSON.stringify(normalized);
      const previous = db.prepare("SELECT * FROM chapter_practice_attempts WHERE student_id = ? AND client_submission_id = ?").get(req.user.id, id);
      if (previous) {
        if (previous.chapter_id !== chapterId || previous.answers_json !== json) fail("同一次提交的答案不能更改", 409);
        return res.json({answers:normalized,results:parse(previous.results_json),createdAt:previous.created_at});
      }
      const createdAt = new Date().toISOString();
      db.prepare("INSERT INTO chapter_practice_attempts (student_id,chapter_id,client_submission_id,answers_json,results_json,created_at) VALUES (?,?,?,?,?,?)")
        .run(req.user.id, chapterId, id, json, JSON.stringify(results), createdAt);
      res.status(201).json({answers:normalized,results,createdAt});
    } catch (error) { next(error); }
  });
  if (role === 'student') router.post("/student/mistakes/review", requireRole("student"), (req, res, next) => {
    try {
      const {questionId, value, clientSubmissionId} = req.body ?? {};
      const id = requestId(clientSubmissionId), answer = answerText(value);
      if (!Number.isInteger(questionId) || !hasAnswer(answer)) fail("请填写订正答案");
      const question = db.prepare(assignmentMistakeSql + " AND q.id = ?").get(req.user.id, questionId);
      if (!question || !hasAnswer(parse(question.student_answer_json, ""))) fail("错题不存在",404);
      if (question.type === "short_answer") fail("简答题请结合教师反馈回看原作业");
      const previous = db.prepare("SELECT * FROM assignment_reviews WHERE student_id = ? AND client_submission_id = ?").get(req.user.id,id);
      if (previous) {
        if (previous.question_id !== questionId || parse(previous.answer_json) !== answer) fail("同一次订正的答案不能更改",409);
        return res.json({correct:Boolean(previous.is_correct)});
      }
      const correct = gradeObjectiveAnswer(question.type, answer, parse(question.answer_json, ""));
      db.prepare("INSERT INTO assignment_reviews (student_id,question_id,client_submission_id,answer_json,is_correct,created_at) VALUES (?,?,?,?,?,?)")
        .run(req.user.id,questionId,id,JSON.stringify(answer),Number(correct),new Date().toISOString());
      res.status(201).json({correct});
    } catch (error) { next(error); }
  });
  return router;
}

export function buildUnifiedMistakeBook(db, studentId) {
  const attempts = db.prepare("SELECT challenge_id AS challengeId, score, passed, errors_json, created_at AS createdAt FROM challenge_attempts WHERE student_id = ? ORDER BY id ASC").all(studentId)
    .map(row => ({...row,createdAt:utcTime(row.createdAt),passed:Boolean(row.passed),errors:parse(row.errors_json,[])}));
  const lab = buildMistakeBook(attempts, Object.fromEntries(LEARNING_ITEMS.map(item => [item.id,item.title])));
  const latestLab = new Map(attempts.map(row => [row.challengeId,row]));
  const items = lab.items.map(item => ({...item,id:`lab:${item.challengeId}:${item.errorType}`,source:"lab",title:item.challengeTitle,resolved:latestLab.get(item.challengeId)?.passed === true,navigation:{source:"lab",challengeId:item.challengeId}}));
  const practice = new Map();
  for (const row of practiceRows(db,studentId)) {
    const answers = parse(row.answers_json), results = parse(row.results_json);
    for (const [questionId,result] of Object.entries(results)) {
      const value = answers[questionId], question = questionOf(questionId);
      if (!question || !hasAnswer(value)) continue;
      let item = practice.get(questionId);
      if (!item && !result.correct) {
        item = {id:`practice:${questionId}`,source:"practice",title:chapterTitle(question.chapterId),questionId,chapterId:question.chapterId,
          stem:question.stem,type:question.type,options:question.options ?? [],referenceAnswer:reference(question.type,question.answer,question.keywords),
          explanation:question.analysis,errorType:"题库练习",count:0,firstSeen:row.created_at,snapshots:[],navigation:{source:"practice",chapterId:question.chapterId,questionId}};
        practice.set(questionId,item);
      }
      if (!item) continue;
      item.resolved = result.correct; item.latestAnswer = value; item.updatedAt = row.created_at;
      if (!result.correct) {
        item.count++; item.studentAnswer = value; item.lastSeen = row.created_at;
        item.snapshots.unshift({score:result.earned,createdAt:row.created_at});
        item.snapshots = item.snapshots.slice(0,3);
      }
    }
  }
  items.push(...practice.values());
  const reviews = db.prepare("SELECT * FROM assignment_reviews WHERE student_id = ? ORDER BY id ASC").all(studentId);
  for (const q of db.prepare(assignmentMistakeSql).all(studentId)) {
    const studentAnswer = parse(q.student_answer_json, "");
    if (!hasAnswer(studentAnswer)) continue;
    const history = reviews.filter(row => row.question_id === q.id);
    const wrongReviews = history.filter(row => !row.is_correct);
    const last = history.at(-1), seen = utcTime(q.graded_at ?? q.submitted_at);
    items.push({id:`assignment:${q.id}`,source:"assignment",title:q.assignment_title,assignmentId:q.assignment_id,questionId:q.id,
      stem:q.stem,type:q.type,options:parse(q.options_json,[]),studentAnswer,referenceAnswer:reference(q.type,parse(q.answer_json,"")),explanation:q.explanation,feedback:q.feedback,
      errorType:q.type === "short_answer" ? "简答题复习" : "作业订正",count:1+wrongReviews.length,firstSeen:seen,lastSeen:wrongReviews.at(-1)?.created_at ?? seen,
      resolved:Boolean(last?.is_correct),latestAnswer:last ? parse(last.answer_json,"") : studentAnswer,
      snapshots:[...wrongReviews.map(row => ({score:0,createdAt:row.created_at})).reverse(),{score:q.earned,createdAt:seen}].slice(0,3),
      navigation:{source:"assignment",assignmentId:q.assignment_id,questionId:q.id}});
  }
  items.push(...serviceMistakes(db,studentId));
  items.sort((a,b) => String(b.updatedAt ?? b.lastSeen).localeCompare(String(a.updatedAt ?? a.lastSeen)));
  return {overview:{...lab.overview,totalMistakes:lab.overview.totalMistakes+[...practice.values()].reduce((sum,item)=>sum+item.count,0)+items.filter(item=>['assignment','service'].includes(item.source)).reduce((sum,item)=>sum+item.count,0),
    pendingCount:items.filter(item=>!item.resolved).length,resolvedCount:items.filter(item=>item.resolved).length,
    sourceCounts:Object.fromEntries(["lab","practice","assignment","service"].map(source=>[source,items.filter(item=>item.source===source).length]))},items};
}
