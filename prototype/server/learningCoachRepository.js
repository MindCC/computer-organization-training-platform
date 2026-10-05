import { COACH_SOURCES, buildCoachHints, coachError } from './learningCoach.js';

export function migrateLearningCoach(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS learning_coach_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL, task_id INTEGER REFERENCES learning_coach_tasks(id) ON DELETE SET NULL,
      initial_passed INTEGER NOT NULL, diagnosis_json TEXT NOT NULL, initial_json TEXT NOT NULL,
      plan_json TEXT NOT NULL, hint_level INTEGER NOT NULL DEFAULT 0, repaired INTEGER NOT NULL DEFAULT 0,
      retest_json TEXT, status TEXT NOT NULL DEFAULT 'diagnosed', revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_coach_owner ON learning_coach_runs(owner_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_coach_class ON learning_coach_runs(class_id, owner_id);
    CREATE TABLE IF NOT EXISTS learning_coach_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL REFERENCES learning_coach_runs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_coach_events_run ON learning_coach_events(run_id, id);
    CREATE TABLE IF NOT EXISTS learning_coach_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL,
      completed_run_id INTEGER REFERENCES learning_coach_runs(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_active_task ON learning_coach_tasks(class_id, student_id) WHERE completed_run_id IS NULL;
    CREATE TABLE IF NOT EXISTS learning_coach_sources (
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL, teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, content TEXT NOT NULL, origin TEXT NOT NULL, concept_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(class_id, source_id));
  `);
}

export function createLearningCoachRepository(db) {
  function event(runId, kind, payload = {}) { db.prepare('INSERT INTO learning_coach_events(run_id,kind,payload_json) VALUES(?,?,?)').run(runId, kind, JSON.stringify(payload)); }
  function sources(classId) {
    const published = classId ? db.prepare('SELECT * FROM learning_coach_sources WHERE class_id=?').all(classId).map(row => ({ id: row.source_id, title: row.title, content: row.content, origin: row.origin, conceptId: row.concept_id, review: 'teacher', reviewedAt: row.created_at, version: 1 })) : [];
    return COACH_SOURCES.map(source => published.find(item => item.id === source.id) ?? source).concat(published.filter(item => !COACH_SOURCES.some(source => source.id === item.id)));
  }
  function ownedRun(ownerId, id) {
    const row = db.prepare('SELECT * FROM learning_coach_runs WHERE id=? AND owner_id=?').get(id, ownerId);
    if (!row) throw coachError('诊断记录不存在或无权访问', 404);
    return row;
  }
  function view(row) {
    if (!row) return null;
    const diagnosis = JSON.parse(row.diagnosis_json), plan = JSON.parse(row.plan_json), retest = row.retest_json ? JSON.parse(row.retest_json) : null;
    const refs = sources(row.class_id);
    const events = db.prepare('SELECT kind,payload_json AS payload,created_at AS createdAt FROM learning_coach_events WHERE run_id=? ORDER BY id').all(row.id).map(e => ({ ...e, payload: JSON.parse(e.payload) }));
    return { id: row.id, taskId: row.task_id, classId: row.class_id, createdAt: row.created_at, updatedAt: row.updated_at,
      initialPassed: Boolean(row.initial_passed), initialDiagnosis: JSON.parse(row.initial_json), diagnosis, plan: { ...plan, references: plan.references.map(ref => refs.find(source => source.id === ref.id) ?? ref) },
      hintLevel: row.hint_level, hints: events.filter(e => e.kind === 'hint').map(e => e.payload.hint ?? buildCoachHints(diagnosis)[e.payload.level - 1]), repaired: Boolean(row.repaired),
      status: row.status, revision: row.revision,
      retest: retest ? { ...retest, canSubmit: !retest.result } : null,
      events };
  }
  function update(row, values, kind, payload = {}) {
    const next = { ...row, ...values };
    db.prepare(`UPDATE learning_coach_runs SET diagnosis_json=?,hint_level=?,repaired=?,retest_json=?,status=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(next.diagnosis_json, next.hint_level, next.repaired, next.retest_json, next.status, row.id);
    event(row.id, kind, payload);
    return view(ownedRun(row.owner_id, row.id));
  }
  return {
    event, sources, ownedRun, view, update,
    classes(ownerId) { return db.prepare(`SELECT c.id,c.name FROM classes c JOIN class_members m ON m.class_id=c.id WHERE m.student_id=? AND c.status='active' ORDER BY c.id`).all(ownerId); },
    create({ ownerId, classId, taskId, diagnosis, plan }) {
      return db.transaction(() => {
        const json = JSON.stringify(diagnosis);
        const result = db.prepare(`INSERT INTO learning_coach_runs(owner_id,class_id,task_id,initial_passed,diagnosis_json,initial_json,plan_json,repaired,status) VALUES(?,?,?,?,?,?,?,?,?)`).run(ownerId, classId, taskId, Number(diagnosis.passed), json, json, JSON.stringify(plan), Number(diagnosis.passed), diagnosis.passed ? 'repaired' : 'diagnosed');
        const id = Number(result.lastInsertRowid); event(id, 'diagnosed', { passed: diagnosis.passed, focus: diagnosis.focus, source: plan.source });
        return view(ownedRun(ownerId, id));
      })();
    },
    latest(ownerId) { return view(db.prepare('SELECT * FROM learning_coach_runs WHERE owner_id=? ORDER BY id DESC LIMIT 1').get(ownerId)); },
    tasks(ownerId) { return db.prepare(`SELECT t.id,t.class_id AS classId,t.title,t.created_at AS createdAt,t.completed_run_id AS completedRunId,c.name AS className FROM learning_coach_tasks t JOIN classes c ON c.id=t.class_id JOIN class_members m ON m.class_id=t.class_id AND m.student_id=t.student_id WHERE t.student_id=? AND c.status='active' ORDER BY t.id DESC LIMIT 30`).all(ownerId); },
    ownedTask(ownerId, id) { const task = this.tasks(ownerId).find(t => t.id === id && !t.completedRunId); if (!task) throw coachError('补练任务不存在或已结束', 404); return task; },
    completeTask(row) { if (row.task_id) db.prepare('UPDATE learning_coach_tasks SET completed_run_id=? WHERE id=? AND student_id=? AND class_id=? AND completed_run_id IS NULL').run(row.id, row.task_id, row.owner_id, row.class_id); },
    publishTasks(teacherId, classId, studentIds, title) {
      return db.transaction(() => {
        const insert = db.prepare('INSERT OR IGNORE INTO learning_coach_tasks(teacher_id,class_id,student_id,title) VALUES(?,?,?,?)');
        let created = 0; for (const id of studentIds) created += insert.run(teacherId, classId, id, title).changes;
        return { created, existing: studentIds.length - created };
      })();
    },
    publishSource(teacherId, classId, source) {
      db.prepare(`INSERT INTO learning_coach_sources(class_id,source_id,teacher_id,title,content,origin,concept_id) VALUES(?,?,?,?,?,?,?) ON CONFLICT(class_id,source_id) DO UPDATE SET title=excluded.title,content=excluded.content,origin=excluded.origin,concept_id=excluded.concept_id,teacher_id=excluded.teacher_id,created_at=CURRENT_TIMESTAMP`).run(classId, source.id, teacherId, source.title, source.content, source.origin, source.conceptId);
    },
    summary(classId, studentId = null) {
      const members = db.prepare(`SELECT u.id,u.display_name AS displayName,u.username FROM users u JOIN class_members m ON m.student_id=u.id WHERE m.class_id=? AND u.role='student'${studentId ? ' AND u.id=?' : ''}`).all(...(studentId ? [classId, studentId] : [classId]));
      const runs = db.prepare('SELECT * FROM learning_coach_runs WHERE class_id=? ORDER BY id DESC').all(classId);
      const allEvents = db.prepare('SELECT e.run_id,e.kind,e.payload_json,e.created_at FROM learning_coach_events e JOIN learning_coach_runs r ON r.id=e.run_id WHERE r.class_id=? ORDER BY e.id').all(classId);
      const byRun = new Map();
      for (const e of allEvents) { if (!byRun.has(e.run_id)) byRun.set(e.run_id, []); byRun.get(e.run_id).push(e); }
      const tasks = db.prepare('SELECT student_id,completed_run_id FROM learning_coach_tasks WHERE class_id=?').all(classId);
      const students = members.map(student => {
        const own = runs.filter(row => row.owner_id === student.id), latest = own[0];
        const retests = own.map(row => row.retest_json ? JSON.parse(row.retest_json) : null).filter(test => test?.result);
        const events = own.flatMap(row => byRun.get(row.id) ?? []), failed = own.find(row => !row.initial_passed);
        return { ...student, runs: own.length, initialFailures: own.filter(row => !row.initial_passed).length,
          initialFocus: failed ? JSON.parse(failed.initial_json).focus : null,
          focus: latest ? JSON.parse(latest.diagnosis_json).focus : null, status: latest?.status ?? 'none', hintLevel: Math.max(0, ...own.map(row => row.hint_level)),
          repairChecks: events.filter(e => e.kind === 'verified').length,
          retests: events.filter(e => e.kind === 'retest_submitted').length,
          retestPasses: events.filter(e => e.kind === 'retest_submitted' && JSON.parse(e.payload_json).passed).length,
          withoutRetestHints: events.filter(e => e.kind === 'retest_submitted' && JSON.parse(e.payload_json).passed && !JSON.parse(e.payload_json).usedHint).length,
          retestSeconds: events.filter(e => e.kind === 'retest_submitted').reduce((total,e) => total + (JSON.parse(e.payload_json).elapsedSeconds ?? 0), 0),
          latestRetest: retests[0]?.result ?? null,
          activeTasks: tasks.filter(t => t.student_id === student.id && t.completed_run_id == null).length,
          completedTasks: tasks.filter(t => t.student_id === student.id && t.completed_run_id != null).length };
      });
      return { students, totalStudents: students.length, diagnosedStudents: students.filter(s => s.runs).length,
        initialFailureStudents: students.filter(s => s.initialFailures).length, testedStudents: students.filter(s => s.retests).length,
        passedStudents: students.filter(s => s.retestPasses).length, pendingTasks: students.reduce((n, s) => n + s.activeTasks, 0),
        disclaimer: '统计仅来自已保存的诊断与复测；复测期间未查看提示不等于已经掌握。演示账号不作为真实课堂效果证据。' };
    },
  };
}
