import { Router } from 'express';
import { teacherOwnsClass } from './db.js';
import { createLearningCoachRepository } from './learningCoachRepository.js';
import { COACH_SOURCES, inspectAdder, makeTransferQuestions, gradeTransferAnswers, planCoachIntervention, buildCoachHints, coachError } from './learningCoach.js';

export function createLearningCoachRouter({ db, requireRole, options = {} }) {
  const router = Router(), repo = createLearningCoachRepository(db), pending = new Set(), recent = new Map();
  function recordFor(req) {
    const id = Number(req.params.runId);
    if (!Number.isSafeInteger(id) || id < 1) throw coachError('诊断记录不存在', 404);
    const row = repo.ownedRun(req.user.id, id);
    if (req.body?.revision !== row.revision) throw coachError('记录已更新，请刷新后重试', 409);
    if (row.class_id && !repo.classes(req.user.id).some(c => c.id === row.class_id)) throw coachError('当前已不在该班级，请开始新的个人诊断', 403);
    return row;
  }
  const action = fn => async (req, res, next) => { res.set('Cache-Control', 'no-store'); try { await fn(req, res); } catch (error) { if (error.status) res.status(error.status).json({ error: error.message }); else next(error); } };
  for (const role of ['student', 'teacher']) {
    const base = `/${role}/learning-coach`;
    router.use(base, requireRole(role));
    router.get(base, action((req, res) => res.json({ latest: repo.latest(req.user.id), tasks: role === 'student' ? repo.tasks(req.user.id) : [], classes: role === 'student' ? repo.classes(req.user.id) : [], aiEnabled: Boolean((options.env ?? process.env).DEEPSEEK_API_KEY) })));
    router.post(base + '/diagnose', action(async (req, res) => {
      if (req.body?.challengeId !== 'full-adder') throw coachError('首期诊断支持全加器实验');
      const now = Date.now(), ownerId = req.user.id;
      for (const [id, times] of recent) if (times.every(time => now - time >= 60000)) recent.delete(id);
      const times = (recent.get(ownerId) ?? []).filter(time => now - time < 60000);
      if (pending.has(ownerId) || times.length >= 8) throw coachError('诊断正在进行或请求较多，请稍后重试', 429);
      const taskId = req.body.taskId ?? null;
      if (taskId !== null && (!Number.isSafeInteger(taskId) || taskId < 1 || role !== 'student')) throw coachError('补练任务无效');
      const task = taskId ? repo.ownedTask(ownerId, taskId) : null;
      const classId = role === 'student' ? task?.classId ?? req.body.classId ?? null : null;
      if (classId !== null && !repo.classes(ownerId).some(c => c.id === classId)) throw coachError('当前未加入该班级', 403);
      const report = inspectAdder(req.body.evidence);
      pending.add(ownerId); recent.set(ownerId, [...times, now]);
      try {
        const plan = await planCoachIntervention(report, repo.sources(classId), req.body.consent, options);
        // Recheck class membership after the external wait.
        if (classId !== null && !repo.classes(ownerId).some(c => c.id === classId)) throw coachError('班级已变更，请重新诊断', 409);
        res.status(201).json({ run: repo.create({ ownerId, classId, taskId, diagnosis: report, plan }) });
      } finally { pending.delete(ownerId); }
    }));
    router.get(base + '/runs/:runId', action((req, res) => res.json({ run: repo.view(repo.ownedRun(req.user.id, Number(req.params.runId))) })));
    router.post(base + '/runs/:runId/hint', action((req, res) => {
      const row = recordFor(req), level = req.body.level;
      if (row.status === 'retest_passed') throw coachError('本次复测已结束，请开始新的诊断', 409);
      if (!Number.isInteger(level) || level !== row.hint_level + 1 || level > 4) throw coachError('请按顺序展开下一层提示');
      db.transaction(() => {
        const test = row.retest_json ? JSON.parse(row.retest_json) : null;
        if (test && !test.result) test.usedHint = true;
        res.json({ run: repo.update(row, { hint_level: level, retest_json: test ? JSON.stringify(test) : null }, 'hint', { level, hint: buildCoachHints(JSON.parse(row.diagnosis_json))[level - 1], duringRetest: Boolean(test && !test.result) }) });
      })();
    }));
    router.post(base + '/runs/:runId/verify', action((req, res) => {
      const row = recordFor(req), report = inspectAdder(req.body.evidence);
      if (row.status === 'retest_passed') throw coachError('本次复测已结束，请开始新的诊断', 409);
      if (row.retest_json && !JSON.parse(row.retest_json).result) throw coachError('请先完成当前复测', 409);
      const plan = JSON.parse(row.plan_json);
      plan.explanation = report.hypothesis; plan.source = 'local'; plan.reason = 'RECHECKED';
      plan.references = repo.sources(row.class_id).filter(source => report.sourceIds.includes(source.id));
      plan.trace.push({ tool: 'inspect_circuit', status: 'ok', summary: '修正验证：' + report.summary });
      db.transaction(() => {
        db.prepare('UPDATE learning_coach_runs SET plan_json=? WHERE id=?').run(JSON.stringify(plan), row.id);
        res.json({ run: repo.update(row, { diagnosis_json: JSON.stringify(report), repaired: Number(report.passed), status: report.passed ? 'repaired' : 'diagnosed' }, 'verified', { passed: report.passed, focus: report.focus }) });
      })();
    }));
    router.post(base + '/runs/:runId/retest', action((req, res) => {
      const row = recordFor(req);
      if (!row.repaired) throw coachError('先修正电路并通过服务器验证，再开始变式复测');
      if (row.status === 'retest_passed') throw coachError('本次复测已通过，请开始新的诊断', 409);
      const previous = row.retest_json ? JSON.parse(row.retest_json) : null;
      if (previous && !previous.result) throw coachError('当前复测尚未提交，请继续完成', 409);
      const retest = { questions: makeTransferQuestions(), attempt: (previous?.attempt ?? 0) + 1, startedAt: new Date().toISOString(), usedHint: false };
      res.json({ run: db.transaction(() => repo.update(row, { retest_json: JSON.stringify(retest), status: 'retesting' }, 'retest_started', { attempt: retest.attempt }))() });
    }));
    router.post(base + '/runs/:runId/retest/submit', action((req, res) => {
      const row = recordFor(req), retest = row.retest_json ? JSON.parse(row.retest_json) : null;
      if (!retest || retest.result) throw coachError('复测不存在或已经提交', 409);
      const result = gradeTransferAnswers(retest.questions, req.body.answers);
      const submittedAt = new Date().toISOString(), elapsedSeconds = Math.max(0, Math.round((Date.now() - Date.parse(retest.startedAt)) / 1000));
      res.json({ run: db.transaction(() => {
        const run = repo.update(row, { retest_json: JSON.stringify({ ...retest, result, submittedAt, elapsedSeconds }), status: result.passed ? 'retest_passed' : 'retest_failed' }, 'retest_submitted', { ...result, attempt: retest.attempt, usedHint: retest.usedHint, elapsedSeconds });
        if (result.passed) repo.completeTask(row);
        return run;
      })() });
    }));
  }
  const teacherBase = '/teacher/classes/:classId/learning-coach';
  router.use(teacherBase, requireRole('teacher'), (req, res, next) => {
    const id = Number(req.params.classId);
    if (!Number.isSafeInteger(id) || id < 1 || !teacherOwnsClass(db, req.user.id, id)) return res.status(404).json({ error: '班级不存在或无权访问' });
    req.coachClassId = id; next();
  });
  router.get(teacherBase, action((req, res) => res.json({ ...repo.summary(req.coachClassId), sources: repo.sources(req.coachClassId) })));
  router.get(teacherBase + '/students/:studentId', action((req, res) => {
    const studentId = Number(req.params.studentId);
    const student = repo.summary(req.coachClassId, studentId).students.find(s => s.id === studentId);
    if (!student) throw coachError('学生不在当前班级', 404);
    const rows = db.prepare('SELECT * FROM learning_coach_runs WHERE class_id=? AND owner_id=? ORDER BY id DESC LIMIT 10').all(req.coachClassId, studentId);
    res.json({ student, runs: rows.map(repo.view) });
  }));
  router.post(teacherBase + '/tasks', action((req, res) => {
    const ids = req.body?.studentIds, title = req.body?.title;
    if (!Array.isArray(ids) || !ids.length || ids.length > 150 || new Set(ids).size !== ids.length || !ids.every(Number.isSafeInteger)) throw coachError('请选择1至150名本班学生');
    if (typeof title !== 'string' || !title.trim() || title.length > 120) throw coachError('补练标题需要1至120字');
    const allowed = new Set(repo.summary(req.coachClassId).students.map(s => s.id));
    if (ids.some(id => !allowed.has(id))) throw coachError('学生不在当前班级', 404);
    res.status(201).json(repo.publishTasks(req.user.id, req.coachClassId, ids, title.trim()));
  }));
  router.post(teacherBase + '/sources', action((req, res) => {
    let source = COACH_SOURCES.find(item => item.id === req.body?.sourceId);
    if (!source) {
      if (!Number.isSafeInteger(req.body?.documentId) || req.body.documentId < 1 || !Number.isSafeInteger(req.body?.chunkId) || req.body.chunkId < 1) throw coachError('请选择有效的知识库文档和课程段落');
      const row = db.prepare(`SELECT d.title,d.original_name,c.id,c.chunk_index,c.page_no,c.content FROM kb_documents d JOIN kb_chunks c ON c.document_id=d.id WHERE d.student_id=? AND d.id=? AND c.id=?`).get(req.user.id, req.body?.documentId ?? -1, req.body?.chunkId ?? -1);
      if (!row) throw coachError('知识库段落不存在或不属于你的账号', 404);
      if (row.content.length > 1800) throw coachError('请选择1800字以内的课程段落');
      source = { id: `kb-${row.id}`, title: row.title, content: row.content, conceptId: 'concept-full-adder', origin: `${row.original_name} · ${row.page_no ? `第${row.page_no}页` : `第${row.chunk_index + 1}段`}` };
    }
    if (req.body?.confirmed !== true) throw coachError('请确认该段内容适合全加器教学并可用于本班讲解');
    if (repo.sources(req.coachClassId).length >= 12 && !repo.sources(req.coachClassId).some(s => s.id === source.id)) throw coachError('首期案例最多发布12条课程依据');
    repo.publishSource(req.user.id, req.coachClassId, source);
    res.json({ sources: repo.sources(req.coachClassId) });
  }));
  router.get(teacherBase + '/export.csv', action((req, res) => {
    const data = repo.summary(req.coachClassId);
    const columns = ['学生账号', '姓名', '诊断次数', '初次失败次数', '最高提示层级', '修正验证次数', '复测次数', '复测通过次数', '复测期间未请求提示的通过次数', '待完成补练', '已完成补练', '复测总耗时秒（包含停留与中断）'];
    const cell = value => '"' + String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
    const rows = data.students.map(s => [s.username, s.displayName, s.runs, s.initialFailures, s.hintLevel, s.repairChecks, s.retests, s.retestPasses, s.withoutRetestHints, s.activeTasks, s.completedTasks, s.retestSeconds]);
    res.set('Content-Disposition', 'attachment; filename="learning-coach-pilot.csv"').type('text/csv').send('\uFEFF' + [columns, ...rows].map(row => row.map(cell).join(',')).join('\r\n'));
  }));
  return router;
}
