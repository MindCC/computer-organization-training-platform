import { CHALLENGES } from '../src/platformLogic.js';
import { COURSE_CHAPTERS } from '../src/courseChapters.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const text = (value, max, required = false) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw fail(`文字需要${required ? '1' : '0'}至${max}字`);
  return value.trim();
};
const minutesOf = (value, max = 90) => { if (!Number.isInteger(value) || value < 1 || value > max) throw fail(`时长须为1至${max}分钟`); return value; };
function dateOf(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw fail('请选择有效的计划日期');
  return value;
}
export function migrateStudyWorkspace(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS study_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, planned_date TEXT NOT NULL, minutes INTEGER NOT NULL, target_json TEXT NOT NULL,
      baseline_attempt INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', completion_kind TEXT,
      completion_note TEXT, completed_at INTEGER, revision INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_study_plans_owner ON study_plans(owner_id,status,planned_date);
    CREATE TABLE IF NOT EXISTS study_focus_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL, plan_id INTEGER REFERENCES study_plans(id) ON DELETE SET NULL,
      title TEXT NOT NULL, target_json TEXT NOT NULL, kind TEXT NOT NULL, target_ms INTEGER NOT NULL,
      elapsed_ms INTEGER NOT NULL DEFAULT 0, running_since INTEGER, status TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT '', question TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, completed_at INTEGER,
      UNIQUE(owner_id,client_id));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_focus_active ON study_focus_sessions(owner_id) WHERE status IN ('running','paused','review');
    CREATE INDEX IF NOT EXISTS idx_focus_history ON study_focus_sessions(owner_id,id DESC);
  `);
}
export function createStudyWorkspace(db, { now = Date.now } = {}) {
  const planView = row => ({ id: row.id, title: row.title, date: row.planned_date, minutes: row.minutes, target: JSON.parse(row.target_json), status: row.status, completionKind: row.completion_kind, completionNote: row.completion_note, completedAt: row.completed_at, revision: row.revision });
  const ownerRow = (table, user, id) => {
    if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw fail('记录不存在', 404);
    const row = db.prepare(`SELECT * FROM ${table} WHERE owner_id=? AND id=?`).get(user.id, Number(id));
    if (!row) throw fail('记录不存在或无权访问', 404); return row;
  };
  const checkRevision = (row, input) => { if (row.revision !== input?.revision) throw fail('记录已更新，请刷新后重试', 409); };
  function resolveTarget(user, target = { kind: 'custom' }) {
    if (!target || typeof target !== 'object') throw fail('学习内容无效');
    if (target.kind === 'custom') return { kind: 'custom', label: '自主学习' };
    if (target.kind === 'lab') {
      const challenge = CHALLENGES.find(c => c.id === target.id); if (!challenge) throw fail('实验不存在');
      return { kind: 'lab', id: challenge.id, chapterId: challenge.chapterId, label: challenge.title };
    }
    if (target.kind === 'chapter') {
      const chapter = COURSE_CHAPTERS.find(c => c.id === target.id); if (!chapter) throw fail('章节不存在');
      return { kind: 'chapter', id: chapter.id, label: chapter.title + '练习' };
    }
    if (!Number.isSafeInteger(target.id) || target.id < 1 || user.role !== 'student') throw fail('教师任务不存在或无权访问', 404);
    if (target.kind === 'coach') {
      const task = db.prepare(`SELECT t.id,t.title,t.completed_run_id FROM learning_coach_tasks t JOIN classes c ON c.id=t.class_id JOIN class_members m ON m.class_id=t.class_id AND m.student_id=t.student_id WHERE t.id=? AND t.student_id=? AND c.status='active'`).get(target.id, user.id);
      if (!task) throw fail('教师补练不存在或已不在该班级', 404);
      return { kind: 'coach', id: task.id, label: task.title, challengeId: 'full-adder' };
    }
    if (target.kind === 'assignment') {
      const task = db.prepare(`SELECT a.id,a.title FROM assignments a JOIN classes c ON c.id=a.class_id JOIN class_members m ON m.class_id=a.class_id WHERE a.id=? AND m.student_id=? AND a.status IN ('published','closed') AND c.status='active'`).get(target.id, user.id);
      if (!task) throw fail('作业不存在或无权访问', 404);
      return { kind: 'assignment', id: task.id, label: task.title };
    }
    throw fail('学习内容无效');
  }
  const baseline = user => db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM challenge_attempts WHERE student_id=?').get(user.id).id;
  function syncPlans(user) {
    const rows = db.prepare("SELECT * FROM study_plans WHERE owner_id=? AND status='pending'").all(user.id);
    for (const row of rows) {
      const target = JSON.parse(row.target_json); let note = null;
      if (target.kind === 'lab' && db.prepare('SELECT id FROM challenge_attempts WHERE student_id=? AND challenge_id=? AND id>? AND passed=1 LIMIT 1').get(user.id, target.id, row.baseline_attempt)) note = '关联实验的新检测通过记录';
      if (['coach', 'assignment'].includes(target.kind)) {
        try {
          resolveTarget(user, target);
          if (target.kind === 'coach' && db.prepare('SELECT completed_run_id FROM learning_coach_tasks WHERE id=? AND student_id=?').get(target.id, user.id)?.completed_run_id) note = '关联教师补练的复测通过记录';
          if (target.kind === 'assignment' && db.prepare("SELECT id FROM student_submissions WHERE assignment_id=? AND student_id=? AND status IN ('submitted','graded')").get(target.id, user.id)) note = '关联作业已提交；提交不代表全部答对';
        } catch { /* Previous class tasks remain private history, without new access. */ }
      }
      if (note) db.prepare("UPDATE study_plans SET status='completed',completion_kind='evidence',completion_note=?,completed_at=?,updated_at=?,revision=revision+1 WHERE id=?").run(note, now(), now(), row.id);
    }
  }
  function timerView(row) {
    const elapsedMs = Math.min(row.target_ms, row.elapsed_ms + (row.running_since !== null ? Math.max(0, now() - row.running_since) : 0));
    return { id: row.id, clientId: row.client_id, planId: row.plan_id, title: row.title, target: JSON.parse(row.target_json), kind: row.kind, targetMs: row.target_ms, elapsedMs, remainingMs: row.target_ms - elapsedMs, status: row.status, outcome: row.outcome, question: row.question, revision: row.revision, createdAt: row.created_at, completedAt: row.completed_at };
  }
  function settle(user) {
    const row = db.prepare("SELECT * FROM study_focus_sessions WHERE owner_id=? AND status IN ('running','paused','review')").get(user.id);
    if (row?.status === 'running' && timerView(row).remainingMs === 0) {
      db.prepare('UPDATE study_focus_sessions SET elapsed_ms=target_ms,running_since=NULL,status=?,completed_at=?,revision=revision+1 WHERE id=?').run(row.kind === 'break' ? 'completed' : 'review', row.kind === 'break' ? now() : null, row.id);
      return row.kind === 'break' ? null : ownerRow('study_focus_sessions', user, row.id);
    }
    return row ?? null;
  }
  function suggestions(user, plans) {
    const list = [];
    if (user.role === 'student') {
      for (const task of db.prepare(`SELECT t.id,t.title FROM learning_coach_tasks t JOIN classes c ON c.id=t.class_id JOIN class_members m ON m.class_id=t.class_id AND m.student_id=t.student_id WHERE t.student_id=? AND t.completed_run_id IS NULL AND c.status='active' ORDER BY t.id DESC LIMIT 4`).all(user.id)) list.push({ title: task.title, reason: '教师安排的待完成补练', minutes: 25, target: resolveTarget(user, { kind: 'coach', id: task.id }) });
      for (const task of db.prepare(`SELECT a.id,a.title FROM assignments a JOIN classes c ON c.id=a.class_id JOIN class_members m ON m.class_id=a.class_id LEFT JOIN student_submissions s ON s.assignment_id=a.id AND s.student_id=m.student_id WHERE m.student_id=? AND c.status='active' AND a.status='published' AND (s.id IS NULL OR s.status='draft') ORDER BY a.id DESC LIMIT 3`).all(user.id)) list.push({ title: task.title, reason: '尚未提交的课程作业', minutes: 25, target: resolveTarget(user, { kind: 'assignment', id: task.id }) });
    }
    const records = db.prepare("SELECT challenge_id,status FROM student_progress WHERE student_id=?").all(user.id);
    const unfinished = CHALLENGES.filter(c => ['in-progress','unlocked'].includes(records.find(r => r.challenge_id === c.id)?.status)).slice(0, 2);
    for (const c of unfinished) list.push({ title: `继续${c.title}`, reason: '依据当前实验进度，需你确认加入计划', minutes: 25, target: resolveTarget(user, { kind: 'lab', id: c.id }) });
    return list.filter(s => !plans.some(p => p.status === 'pending' && p.target.kind === s.target.kind && p.target.id === s.target.id)).slice(0, 6);
  }
  return {
    snapshot(user) {
      syncPlans(user); const active = settle(user);
      const plans = db.prepare("SELECT * FROM study_plans WHERE owner_id=? AND status!='archived' ORDER BY planned_date,id LIMIT 100").all(user.id).map(planView);
      const history = db.prepare("SELECT * FROM study_focus_sessions WHERE owner_id=? AND status IN ('completed','cancelled') ORDER BY id DESC LIMIT 30").all(user.id).map(timerView);
      const china = new Date(now() + 8 * 3600000), day = (china.getUTCDay() + 6) % 7;
      const monday = Date.UTC(china.getUTCFullYear(), china.getUTCMonth(), china.getUTCDate() - day) - 8 * 3600000;
      const week = db.prepare("SELECT COUNT(*) AS sessions,COALESCE(SUM(elapsed_ms),0) AS focusMs FROM study_focus_sessions WHERE owner_id=? AND kind='focus' AND status='completed' AND completed_at BETWEEN ? AND ?").get(user.id, monday, now());
      week.completedPlans = db.prepare("SELECT COUNT(*) AS n FROM study_plans WHERE owner_id=? AND completion_kind IS NOT NULL AND completed_at BETWEEN ? AND ?").get(user.id, monday, now()).n;
      return { plans, active: active ? timerView(active) : null, history, week, suggestions: suggestions(user, plans), serverNow: now() };
    },
    createPlan(user, input) {
      const title = text(input.title, 120, true), date = dateOf(input.date), minutes = minutesOf(input.minutes, 180), target = resolveTarget(user, input.target);
      if (db.prepare("SELECT COUNT(*) AS n FROM study_plans WHERE owner_id=? AND status!='archived'").get(user.id).n >= 100) throw fail('最多保留100项计划，请先归档已完成内容');
      if (target.kind !== 'custom' && db.prepare("SELECT target_json FROM study_plans WHERE owner_id=? AND status='pending'").all(user.id).some(r => { const t = JSON.parse(r.target_json); return t.kind === target.kind && t.id === target.id; })) throw fail('这项学习内容已有待完成计划', 409);
      const result = db.prepare('INSERT INTO study_plans(owner_id,title,planned_date,minutes,target_json,baseline_attempt,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(user.id, title, date, minutes, JSON.stringify(target), baseline(user), now(), now());
      return planView(ownerRow('study_plans', user, Number(result.lastInsertRowid)));
    },
    updatePlan(user, id, input) {
      const row = ownerRow('study_plans', user, id); checkRevision(row, input);
      if (row.status !== 'pending') throw fail('已完成或归档的计划不能修改', 409);
      db.prepare('UPDATE study_plans SET title=?,planned_date=?,minutes=?,updated_at=?,revision=revision+1 WHERE id=?').run(text(input.title, 120, true), dateOf(input.date), minutesOf(input.minutes, 180), now(), row.id);
      return planView(ownerRow('study_plans', user, id));
    },
    completePlan(user, id, input) {
      const row = ownerRow('study_plans', user, id); checkRevision(row, input);
      if (row.status !== 'pending') throw fail('计划已完成或已归档', 409);
      db.prepare("UPDATE study_plans SET status='completed',completion_kind='self',completion_note='个人确认完成',completed_at=?,updated_at=?,revision=revision+1 WHERE id=?").run(now(), now(), row.id);
      return planView(ownerRow('study_plans', user, id));
    },
    archivePlan(user, id, input) {
      const row = ownerRow('study_plans', user, id); checkRevision(row, input);
      if (db.prepare("SELECT id FROM study_focus_sessions WHERE owner_id=? AND plan_id=? AND status IN ('running','paused','review')").get(user.id, row.id)) throw fail('请先结束关联的计时，再归档计划', 409);
      db.prepare("UPDATE study_plans SET status='archived',updated_at=?,revision=revision+1 WHERE id=?").run(now(), row.id);
      return planView(ownerRow('study_plans', user, id));
    },
    start(user, input) {
      if (typeof input.clientId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(input.clientId)) throw fail('计时请求标识无效');
      const previous = db.prepare('SELECT * FROM study_focus_sessions WHERE owner_id=? AND client_id=?').get(user.id, input.clientId); if (previous) return timerView(previous);
      if (settle(user)) throw fail('已有活动计时，请先结束或放弃当前这轮', 409);
      const kind = input.kind ?? 'focus'; if (!['focus','break'].includes(kind)) throw fail('计时类型无效');
      const minutes = minutesOf(input.minutes);
      let plan = null; if (input.planId != null) { plan = ownerRow('study_plans', user, input.planId); if (plan.status !== 'pending') throw fail('请选择待完成的计划', 409); }
      const target = kind === 'break' ? { kind: 'custom', label: '休息' } : resolveTarget(user, plan ? JSON.parse(plan.target_json) : input.target);
      const title = kind === 'break' ? '休息' : plan?.title ?? (input.title ? text(input.title, 120, true) : target.label);
      const result = db.prepare('INSERT INTO study_focus_sessions(owner_id,client_id,plan_id,title,target_json,kind,target_ms,running_since,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(user.id, input.clientId, kind === 'focus' ? plan?.id ?? null : null, title, JSON.stringify(target), kind, minutes * 60000, now(), 'running', now());
      return timerView(ownerRow('study_focus_sessions', user, Number(result.lastInsertRowid)));
    },
    timerAction(user, id, action, input) {
      let row = ownerRow('study_focus_sessions', user, id);
      if (action === 'finish' && row.status === 'completed') return timerView(row);
      checkRevision(row, input);
      if (!['running','paused','review'].includes(row.status)) throw fail('这轮计时已经结束', 409);
      const elapsed = timerView(row).elapsedMs;
      if (action === 'pause' && row.status !== 'running') throw fail('当前计时不能暂停', 409);
      if (action === 'resume' && row.status !== 'paused') throw fail('当前计时不能继续', 409);
      if (!['pause','resume','finish','cancel'].includes(action)) throw fail('计时操作无效');
      const outcome = action === 'finish' ? text(input.outcome ?? '', 500) : row.outcome;
      const question = action === 'finish' ? text(input.question ?? '', 500) : row.question;
      const status = { pause: 'paused', resume: 'running', finish: 'completed', cancel: 'cancelled' }[action];
      db.prepare('UPDATE study_focus_sessions SET elapsed_ms=?,running_since=?,status=?,outcome=?,question=?,completed_at=?,revision=revision+1 WHERE id=?').run(elapsed, action === 'resume' ? now() : null, status, outcome, question, ['finish','cancel'].includes(action) ? now() : null, row.id);
      return timerView(ownerRow('study_focus_sessions', user, id));
    },
  };
}
