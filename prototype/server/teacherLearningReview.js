import { Router } from 'express';
import { getStudentProgress, listClassStudents, teacherOwnsClass, summarizeDemoAttempts, recordStudentAttempt } from './db.js';
import { normalizeStudentAttemptPayload } from './submissionValidation.js';
import { buildUnifiedMistakeBook, practiceState } from './learningPractice.js';
import { serviceRecords } from './shopServiceRoutes.js';
import { LEARNING_ITEMS, summarizeLearning } from '../src/platformLogic.js';
import { demoTitleOf } from './demoValidation.js';
import { analyzeTeachingRecords } from '../src/teacherLearningAnalysis.js';

function homeworkSummary(db, studentId, classId) {
  if (!classId) return { assigned: 0, submitted: 0, graded: 0, pendingGrading: 0, averageScore: null };
  const rows = db.prepare(`SELECT ss.status, ss.total_score AS score, a.total_score AS maximum FROM assignments a LEFT JOIN student_submissions ss ON ss.assignment_id=a.id AND ss.student_id=? WHERE a.class_id=? AND a.status='published'`).all(studentId, classId);
  const submitted = rows.filter(row => ['submitted','graded'].includes(row.status));
  const graded = rows.filter(row => row.status === 'graded' && row.score != null);
  return { assigned: rows.length, submitted: submitted.length, graded: graded.length, pendingGrading: submitted.length - graded.length, averageScore: graded.length ? Math.round(graded.reduce((sum,row) => sum + (row.maximum > 0 ? row.score / row.maximum * 100 : 0), 0) / graded.length) : null };
}
export function learningReviewData(db, user, classId = null) {
  const progress = getStudentProgress(db, user.id);
  const mistakes = buildUnifiedMistakeBook(db, user.id);
  if (classId) {
    const allowed = new Set(db.prepare('SELECT id FROM assignments WHERE class_id=?').all(classId).map(row => row.id));
    mistakes.items = mistakes.items.filter(item => item.source !== 'assignment' || allowed.has(item.assignmentId));
    mistakes.overview = { totalMistakes: mistakes.items.reduce((sum,item) => sum + item.count, 0), pendingCount: mistakes.items.filter(item => !item.resolved).length, resolvedCount: mistakes.items.filter(item => item.resolved).length, sourceCounts: Object.fromEntries(['lab','practice','assignment','service'].map(source => [source, mistakes.items.filter(item => item.source === source).length])) };
  }
  const practice = practiceState(db, user.id), graded = Object.values(practice.graded);
  return { id: user.id, username: user.username, displayName: user.displayName, progress, summary: summarizeLearning(LEARNING_ITEMS, progress), mistakes,
    practice: { answered: graded.length, correct: graded.filter(item => item.correct).length }, homework: homeworkSummary(db, user.id, classId) };
}
export function createTeacherLearningReviewRouter({ db, requireRole }) {
  const router = Router();
  router.get('/teacher/progress', requireRole('teacher'), (req,res) => {
    const progress = getStudentProgress(db, req.user.id);
    res.json({ progress, summary: summarizeLearning(LEARNING_ITEMS, progress), allowSkipLocked: true });
  });
  router.post('/teacher/attempts', requireRole('teacher'), (req,res,next) => {
    try {
      const normalized = normalizeStudentAttemptPayload(req.body ?? {}, LEARNING_ITEMS, getStudentProgress(db, req.user.id), true);
      if (!normalized.ok) return res.status(normalized.status).json({ error: normalized.error });
      const progress = recordStudentAttempt(db, req.user.id, normalized.challengeId, normalized.result);
      res.status(201).json({ progress, summary: summarizeLearning(LEARNING_ITEMS, progress) });
    } catch (error) { next(error); }
  });
  router.get('/teacher/mistakes', requireRole('teacher'), (req,res) => res.json(buildUnifiedMistakeBook(db, req.user.id)));
  router.get('/teacher/demo-attempts', requireRole('teacher'), (req,res) => res.json({ demos: summarizeDemoAttempts(db, req.user.id).map(item => ({ ...item, title: demoTitleOf(item.demoId) })) }));
  function detail(user, classId) {
    const data = learningReviewData(db, user, classId);
    const demos = summarizeDemoAttempts(db, user.id).map(item => ({ ...item, title: demoTitleOf(item.demoId) }));
    return { ...data, demos, serviceRecords: serviceRecords(db, user.id), analysis: analyzeTeachingRecords([data]) };
  }
  router.get('/teacher/learning-review', requireRole('teacher'), (req,res) => {
    res.set('Cache-Control','no-store'); res.json(detail({ id: req.user.id, username: req.user.username, displayName: req.user.display_name }, null));
  });
  const base = '/teacher/classes/:classId/learning-review';
  router.use(base, requireRole('teacher'), (req,res,next) => {
    const id = Number(req.params.classId);
    if (!Number.isSafeInteger(id) || id < 1 || !teacherOwnsClass(db, req.user.id, id)) return res.status(404).json({ error: '班级不存在或无权访问' });
    res.set('Cache-Control','no-store'); next();
  });
  router.get(base, (req,res) => {
    const students = listClassStudents(db, Number(req.params.classId)).map(user => learningReviewData(db, user, Number(req.params.classId)));
    res.json({ students: students.map(({ mistakes, progress, ...student }) => ({ ...student, mistakeOverview: mistakes.overview })), analysis: analyzeTeachingRecords(students) });
  });
  router.get(base+'/:studentId', (req,res) => {
    const id = Number(req.params.studentId), classId = Number(req.params.classId);
    const user = Number.isSafeInteger(id) && listClassStudents(db, classId).find(student => student.id === id);
    if (!user) return res.status(404).json({ error: '学生不在当前班级' });
    res.json(detail(user, classId));
  });
  return router;
}
