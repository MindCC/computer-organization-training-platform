import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { LEARNING_ITEMS, buildInitialLearningProgress, recordAttempt, summarizeLearning } from "../src/platformLogic.js";
import { HARDWARE_GAME_CASES, summarizeHardwareGameAttempts } from "../src/hardwareGame.js";
import { sanitizeProfile } from "./security.js";

const DEFAULT_DATABASE_PATH = path.resolve("data/classroom.sqlite");

export function resolveDatabasePath(input = process.env.DATABASE_PATH) {
  if (!input || input === ":memory:") return input ?? DEFAULT_DATABASE_PATH;
  return path.resolve(input);
}

export function openDatabase(databasePath = process.env.DATABASE_PATH) {
  const resolvedPath = resolveDatabasePath(databasePath);
  if (resolvedPath && resolvedPath !== ":memory:") {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }
  const db = new Database(resolvedPath ?? DEFAULT_DATABASE_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}

export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      profile_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS class_members (
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (class_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS student_progress (
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_id TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      errors_json TEXT NOT NULL DEFAULT '[]',
      completed_at TEXT,
      best_score INTEGER NOT NULL DEFAULT 0,
      time_spent_minutes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (student_id, challenge_id)
    );

    CREATE TABLE IF NOT EXISTS challenge_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_id TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      passed INTEGER NOT NULL DEFAULT 0,
      errors_json TEXT NOT NULL DEFAULT '[]',
      result_json TEXT NOT NULL DEFAULT '{}',
      elapsed_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_class_members_student_id ON class_members(student_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_student_id ON challenge_attempts(student_id);

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      actor_role TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      metadata_json TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

    CREATE TABLE IF NOT EXISTS classroom_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES users(id),
      template_key TEXT NOT NULL,
      template_version INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'live', 'paused', 'ended')),
      duration_minutes INTEGER NOT NULL,
      pass_score INTEGER NOT NULL,
      allow_makeup INTEGER NOT NULL DEFAULT 0,
      config_json TEXT NOT NULL,
      report_json TEXT,
      started_at TEXT,
      active_started_at TEXT,
      accumulated_active_seconds INTEGER NOT NULL DEFAULT 0,
      paused_at TEXT,
      ended_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_session_states (
      session_id INTEGER NOT NULL REFERENCES classroom_sessions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')),
      current_stage_index INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      stars INTEGER NOT NULL DEFAULT 0,
      streak INTEGER NOT NULL DEFAULT 0,
      result_json TEXT,
      entered_at TEXT,
      last_activity_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      question_count INTEGER NOT NULL DEFAULT 0,
      total_score INTEGER NOT NULL DEFAULT 100,
      due_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assignment_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL CHECK (type IN ('choice', 'truefalse', 'fill', 'short_answer')),
      stem TEXT NOT NULL,
      options_json TEXT NOT NULL DEFAULT '[]',
      answer_json TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 10,
      explanation TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS student_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'graded')),
      total_score INTEGER,
      feedback TEXT,
      submitted_at TEXT,
      graded_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(assignment_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS submission_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL REFERENCES student_submissions(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES assignment_questions(id) ON DELETE CASCADE,
      answer_json TEXT NOT NULL,
      score INTEGER,
      is_correct INTEGER,
      UNIQUE(submission_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_student ON student_submissions(student_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON student_submissions(assignment_id);
  `);
  ensureColumn(db, "notes", "challenge_id", "TEXT");
  ensureColumn(db, "notes", "updated_at", "TEXT");
  ensureColumn(db, "classes", "status", "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(db, "classes", "archived_at", "TEXT");
  ensureColumn(db, "challenge_attempts", "session_id", "INTEGER REFERENCES classroom_sessions(id)");
  ensureColumn(db, "challenge_attempts", "client_submission_id", "TEXT");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_active_session_per_class
    ON classroom_sessions(class_id)
    WHERE status IN ('live', 'paused');

    CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_student_submission
    ON challenge_attempts(student_id, client_submission_id)
    WHERE client_submission_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_student_session_student
    ON student_session_states(student_id, session_id);
  `);
  sanitizeStoredUserProfiles(db);
}

function sanitizeStoredUserProfiles(db) {
  const rows = db.prepare(`
    SELECT id, profile_json FROM users
    WHERE instr(profile_json, '"initialPassword"') > 0
  `).all();
  if (rows.length === 0) return;
  const update = db.prepare(`
    UPDATE users SET profile_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  db.transaction(() => {
    for (const row of rows) {
      update.run(JSON.stringify(sanitizeProfile(safeJson(row.profile_json, {}))), row.id);
    }
  })();
}

export function sanitizeUser(row) {
  if (!row) return null;
  const profile = sanitizeProfile(safeJson(row.profile_json, {}));
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    profile,
  };
}

export function getUserByUsername(db, username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(String(username).trim());
}

export function getUserById(db, id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function createUser(db, { username, displayName, role, passwordHash, profile = {} }) {
  const result = db.prepare(`
    INSERT INTO users (username, display_name, role, password_hash, profile_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(String(username).trim(), displayName, role, passwordHash, JSON.stringify(sanitizeProfile(profile)));
  return getUserById(db, result.lastInsertRowid);
}

export function updateUserProfile(db, userId, { displayName, profile }) {
  const current = getUserById(db, userId);
  const nextProfile = sanitizeProfile({ ...safeJson(current.profile_json, {}), ...(profile ?? {}) });
  db.prepare(`
    UPDATE users SET display_name = COALESCE(?, display_name), profile_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(displayName ?? null, JSON.stringify(nextProfile), userId);
  return getUserById(db, userId);
}

export function updateUserPassword(db, userId, passwordHash) {
  db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(passwordHash, userId);
}

export function createClass(db, teacherId, name) {
  const result = db.prepare("INSERT INTO classes (name, teacher_id) VALUES (?, ?)").run(name.trim(), teacherId);
  return db.prepare("SELECT * FROM classes WHERE id = ?").get(result.lastInsertRowid);
}

export function teacherOwnsClass(db, teacherId, classId) {
  const row = db.prepare("SELECT id FROM classes WHERE id = ? AND teacher_id = ?").get(classId, teacherId);
  return Boolean(row);
}

export function listTeacherClasses(db, teacherId, includeArchived = false) {
  const statusFilter = includeArchived ? "" : "AND c.status = 'active'";
  return db.prepare(`
    SELECT c.id, c.name, c.status, c.archived_at AS archivedAt, c.created_at AS createdAt, COUNT(cm.student_id) AS studentCount
    FROM classes c
    LEFT JOIN class_members cm ON cm.class_id = c.id
    WHERE c.teacher_id = ? ${statusFilter}
    GROUP BY c.id
    ORDER BY c.id DESC
  `).all(teacherId);
}

export function addStudentToClass(db, classId, studentId) {
  db.prepare("INSERT OR IGNORE INTO class_members (class_id, student_id) VALUES (?, ?)").run(classId, studentId);
  ensureStudentProgress(db, studentId);
}

export function listClassStudents(db, classId) {
  return db.prepare(`
    SELECT u.id, u.username, u.display_name AS displayName, u.status
    FROM class_members cm
    JOIN users u ON u.id = cm.student_id
    WHERE cm.class_id = ?
    ORDER BY u.username ASC
  `).all(classId);
}

export function ensureStudentProgress(db, studentId) {
  const initial = buildInitialLearningProgress();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO student_progress
      (student_id, challenge_id, status, attempts, errors_json, completed_at, best_score, time_spent_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const [challengeId, record] of Object.entries(initial)) {
      insert.run(
        studentId,
        challengeId,
        record.status,
        record.attempts,
        JSON.stringify(record.errors ?? []),
        record.completedAt,
        record.bestScore,
        record.timeSpentMinutes ?? 0,
      );
    }
  });
  tx();
}

export function getStudentProgress(db, studentId) {
  ensureStudentProgress(db, studentId);
  const rows = db.prepare("SELECT * FROM student_progress WHERE student_id = ?").all(studentId);
  const progress = buildInitialLearningProgress();
  for (const row of rows) {
    progress[row.challenge_id] = {
      status: row.status,
      attempts: row.attempts,
      errors: safeJson(row.errors_json, []),
      completedAt: row.completed_at,
      bestScore: row.best_score,
      timeSpentMinutes: row.time_spent_minutes,
    };
  }
  return progress;
}

export function saveStudentProgress(db, studentId, progress) {
  const upsert = db.prepare(`
    INSERT INTO student_progress
      (student_id, challenge_id, status, attempts, errors_json, completed_at, best_score, time_spent_minutes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, challenge_id) DO UPDATE SET
      status = excluded.status,
      attempts = excluded.attempts,
      errors_json = excluded.errors_json,
      completed_at = excluded.completed_at,
      best_score = excluded.best_score,
      time_spent_minutes = excluded.time_spent_minutes,
      updated_at = CURRENT_TIMESTAMP
  `);
  const tx = db.transaction(() => {
    for (const [challengeId, record] of Object.entries(progress)) {
      upsert.run(
        studentId,
        challengeId,
        record.status,
        record.attempts,
        JSON.stringify(record.errors ?? []),
        record.completedAt,
        record.bestScore,
        record.timeSpentMinutes ?? 0,
      );
    }
  });
  tx();
}

export function recordStudentAttempt(db, studentId, challengeId, result, options = {}) {
  const run = () => {
    const before = getStudentProgress(db, studentId);
    const next = recordAttempt(before, challengeId, result);
    const errors = (result.errors ?? []).map((error) => error.type ?? String(error));
    db.prepare(`
      INSERT INTO challenge_attempts
        (student_id, challenge_id, score, passed, errors_json, result_json,
         elapsed_minutes, session_id, client_submission_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      studentId,
      challengeId,
      Number(result.score ?? 0),
      result.passed ? 1 : 0,
      JSON.stringify(errors),
      JSON.stringify(result),
      Number(result.elapsedMinutes ?? 0),
      options.sessionId ?? null,
      options.clientSubmissionId ?? null,
    );
    saveStudentProgress(db, studentId, next);
    return next;
  };
  return options.inTransaction ? run() : db.transaction(run)();
}

export function listNotes(db, studentId, filters = {}) {
  const where = ["student_id = ?"];
  const params = [studentId];
  if (filters.query) {
    where.push("(title LIKE ? OR content LIKE ? OR tag LIKE ?)");
    const query = `%${String(filters.query).trim()}%`;
    params.push(query, query, query);
  }
  if (filters.tag) {
    where.push("tag = ?");
    params.push(String(filters.tag).trim());
  }
  if (filters.challengeId) {
    where.push("challenge_id = ?");
    params.push(String(filters.challengeId).trim());
  }
  return db.prepare(`
    SELECT id, title, content, tag, challenge_id AS challengeId, created_at AS createdAt, COALESCE(updated_at, created_at) AS updatedAt
    FROM notes
    WHERE ${where.join(" AND ")}
    ORDER BY id DESC
  `).all(...params);
}

export function createNote(db, studentId, { title, content, tag, challengeId = null }) {
  const result = db.prepare(`
    INSERT INTO notes (student_id, title, content, tag, challenge_id, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(studentId, title, content, tag, normalizeNullableText(challengeId));
  return getOwnedNote(db, studentId, result.lastInsertRowid);
}

export function updateNote(db, studentId, noteId, fields = {}) {
  const current = getOwnedNote(db, studentId, noteId);
  if (!current) return null;
  const next = {
    title: fields.title === undefined ? current.title : String(fields.title).trim(),
    content: fields.content === undefined ? current.content : String(fields.content).trim(),
    tag: fields.tag === undefined ? current.tag : String(fields.tag).trim(),
    challengeId: fields.challengeId === undefined ? current.challengeId : normalizeNullableText(fields.challengeId),
  };
  db.prepare(`
    UPDATE notes
    SET title = ?, content = ?, tag = ?, challenge_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND student_id = ?
  `).run(next.title || "实验复盘", next.content, next.tag || "课堂笔记", next.challengeId, noteId, studentId);
  return getOwnedNote(db, studentId, noteId);
}

export function deleteNote(db, studentId, noteId) {
  const result = db.prepare("DELETE FROM notes WHERE id = ? AND student_id = ?").run(noteId, studentId);
  return result.changes > 0;
}

function getOwnedNote(db, studentId, noteId) {
  return db.prepare(`
    SELECT id, title, content, tag, challenge_id AS challengeId, created_at AS createdAt, COALESCE(updated_at, created_at) AS updatedAt
    FROM notes WHERE id = ? AND student_id = ?
  `).get(noteId, studentId) ?? null;
}

export function getClassOverview(db, classId) {
  const students = listClassStudents(db, classId).map((student) => {
    const progress = getStudentProgress(db, student.id);
    const summary = summarizeLearning(LEARNING_ITEMS, progress);
    return { ...student, progress, summary };
  });
  const classSummary = summarizeClass(students);
  const gameAttempts = db.prepare(`
    SELECT ca.challenge_id AS challengeId, ca.score, ca.result_json AS resultJson
    FROM challenge_attempts ca
    JOIN class_members cm ON cm.student_id = ca.student_id
    WHERE cm.class_id = ? AND ca.challenge_id LIKE 'game-%'
    ORDER BY ca.id DESC
  `).all(classId).map((row) => ({
    challengeId: row.challengeId,
    score: row.score,
    result: safeJson(row.resultJson, {}),
  }));
  return { students, summary: classSummary, hardwareGameSummary: summarizeHardwareGameAttempts(gameAttempts) };
}

export function getTeacherStudentDetail(db, teacherId, studentId, classId = null) {
  const membership = db.prepare(`
    SELECT u.id, u.username, u.display_name AS displayName, c.id AS classId, c.name AS className
    FROM class_members cm
    JOIN classes c ON c.id = cm.class_id
    JOIN users u ON u.id = cm.student_id
    WHERE cm.student_id = ? AND c.teacher_id = ? AND (? IS NULL OR c.id = ?)
    LIMIT 1
  `).get(studentId, teacherId, classId, classId);
  if (!membership) return null;
  const progress = getStudentProgress(db, studentId);
  const attempts = db.prepare(`
    SELECT id, challenge_id AS challengeId, score, passed, errors_json AS errorsJson, result_json AS resultJson, created_at AS createdAt
    FROM challenge_attempts WHERE student_id = ? ORDER BY id DESC LIMIT 100
  `).all(studentId).map((row) => ({ ...row, passed: Boolean(row.passed), errors: safeJson(row.errorsJson, []), result: safeJson(row.resultJson, {}) }));
  const notes = listNotes(db, studentId);
  return {
    ...membership,
    progress,
    notes,
    attempts,
    timeDistribution: buildTimeDistribution(progress),
    scoreTrends: buildScoreTrends(db, studentId),
    hardwareSummary: buildStudentHardwareSummary(db, studentId),
    errorProfile: buildErrorProfile(db, studentId),
    noteLinks: buildNoteLinks(notes),
    learningOverview: buildLearningOverview(progress),
  };
}

export function createSession(db, userId, tokenHash, expiresAt) {
  db.prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(userId, tokenHash, expiresAt.toISOString());
}

export function getSessionUser(db, tokenHash) {
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.status = 'active'
  `).get(tokenHash);
  return row ?? null;
}

export function deleteSession(db, tokenHash) {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function deleteExpiredSessions(db) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();
}

/**
 * 写入一条审计日志（P2-A）。metadata 自动序列化为 JSON。
 */
export function writeAuditLog(db, { actorUserId = null, actorRole = null, action, targetType = null, targetId = null, metadata = {}, ipAddress = null }) {
  const insert = db.prepare(`
    INSERT INTO audit_logs (actor_user_id, actor_role, action, target_type, target_id, metadata_json, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(
    actorUserId,
    actorRole,
    action,
    targetType,
    targetId != null ? String(targetId) : null,
    JSON.stringify(metadata ?? {}),
    ipAddress,
  );
}

/**
 * 查询审计日志（P2-A），支持按 action 和时间过滤 + 分页。
 * 仅返回非敏感字段（无密码、session、cookie）。
 */
export function listAuditLogs(db, { action = null, from = null, to = null, page = 1, pageSize = 20 } = {}) {
  const where = [];
  const params = [];
  if (action) { where.push("action = ?"); params.push(String(action)); }
  if (from) { where.push("created_at >= ?"); params.push(String(from)); }
  if (to) { where.push("created_at <= ?"); params.push(String(to)); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const rows = db.prepare(`
    SELECT id, actor_user_id AS actorUserId, actor_role AS actorRole, action,
           target_type AS targetType, target_id AS targetId, metadata_json AS metadataJson,
           ip_address AS ipAddress, created_at AS createdAt
    FROM audit_logs
    ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS count FROM audit_logs ${whereSql}`).get(...params).count;
  return {
    items: rows.map((row) => ({
      ...row,
      metadata: safeJson(row.metadataJson, {}),
    })),
    total,
    page: Math.max(Number(page) || 1, 1),
    pageSize: limit,
  };
}

export function summarizeClass(students) {
  const count = students.length;
  if (count === 0) return { studentCount: 0, completionRate: 0, averageScore: 0, totalAttempts: 0, weakSpot: "暂无数据" };
  const completionRate = Math.round(students.reduce((sum, student) => sum + student.summary.completionRate, 0) / count);
  const averageScore = Math.round(students.reduce((sum, student) => sum + student.summary.averageScore, 0) / count);
  const totalAttempts = students.reduce((sum, student) => sum + student.summary.totalAttempts, 0);
  const weakCounts = students.reduce((counts, student) => {
    const weak = student.summary.weakSpot;
    if (weak && weak !== "暂无高频错误") counts[weak] = (counts[weak] ?? 0) + 1;
    return counts;
  }, {});
  const weakSpot = Object.entries(weakCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "暂无数据";
  return { studentCount: count, completionRate, averageScore, totalAttempts, weakSpot };
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
}

function normalizeNullableText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

function buildTimeDistribution(progress) {
  return Object.entries(progress ?? {})
    .filter(([, record]) => (record.timeSpentMinutes ?? 0) > 0)
    .map(([challengeId, record]) => ({ challengeId, timeSpentMinutes: record.timeSpentMinutes ?? 0, attempts: record.attempts ?? 0, bestScore: record.bestScore ?? 0 }))
    .sort((a, b) => b.timeSpentMinutes - a.timeSpentMinutes || b.attempts - a.attempts);
}

function buildScoreTrends(db, studentId) {
  const rows = db.prepare(`
    SELECT challenge_id AS challengeId, score, passed, created_at AS createdAt
    FROM challenge_attempts WHERE student_id = ? ORDER BY id DESC LIMIT 60
  `).all(studentId);
  const byChallenge = new Map();
  for (const row of rows) {
    if (!byChallenge.has(row.challengeId)) byChallenge.set(row.challengeId, []);
    byChallenge.get(row.challengeId).unshift({ score: row.score, passed: Boolean(row.passed), at: row.createdAt });
  }
  return [...byChallenge.entries()]
    .map(([challengeId, scores]) => ({ challengeId, scores: scores.slice(-8), attempts: scores.length, best: Math.max(...scores.map((s) => s.score)) }))
    .sort((a, b) => b.attempts - a.attempts);
}

const HARDWARE_CASE_IDS = new Set(HARDWARE_GAME_CASES.map((gameCase) => gameCase.id));

function buildStudentHardwareSummary(db, studentId) {
  const rows = db.prepare(`
    SELECT challenge_id AS challengeId, score, result_json AS resultJson
    FROM challenge_attempts WHERE student_id = ? AND challenge_id IN (${[...HARDWARE_CASE_IDS].map(() => "?").join(",")})
    ORDER BY id DESC
  `).all(studentId, ...HARDWARE_CASE_IDS);
  if (rows.length === 0) return null;
  let totalProfit = 0, totalSatisfaction = 0, bestScore = 0;
  let bestCaseId = "";
  for (const row of rows) {
    const result = safeJson(row.resultJson, {});
    totalProfit += result.profit ?? 0;
    totalSatisfaction += result.satisfaction ?? 0;
    if (row.score > bestScore) { bestScore = row.score; bestCaseId = row.challengeId; }
  }
  return {
    totalProfit: Math.round(totalProfit),
    avgSatisfaction: Math.round(totalSatisfaction / rows.length),
    bestScore,
    bestCaseId,
    completedCases: rows.length,
  };
}

const CHALLENGE_TITLES = new Map(LEARNING_ITEMS.map((item) => [item.id, item.title]));

/** 学习概览聚合卡:完成率、平均分、累计耗时、总尝试、完成 x/y。 */
export function buildLearningOverview(progress) {
  const records = LEARNING_ITEMS.map((item) => progress[item.id]).filter(Boolean);
  const completedCount = records.filter((record) => record.status === "completed").length;
  const totalCount = LEARNING_ITEMS.length;
  const scored = records.filter((record) => (record.bestScore ?? 0) > 0);
  return {
    completedCount,
    totalCount,
    completionRate: Math.round((completedCount / totalCount) * 100),
    averageScore: scored.length
      ? Math.round(scored.reduce((sum, record) => sum + (record.bestScore ?? 0), 0) / scored.length)
      : 0,
    totalAttempts: records.reduce((sum, record) => sum + (record.attempts ?? 0), 0),
    totalTimeMinutes: records.reduce((sum, record) => sum + (record.timeSpentMinutes ?? 0), 0),
  };
}

/** 笔记按关卡分组:输出 { challengeId, challengeTitle, notes }。未关联关卡的笔记归入"未关联关卡"。 */
export function buildNoteLinks(notes) {
  const groups = new Map();
  for (const note of notes) {
    const key = note.challengeId ?? "__unlinked__";
    if (!groups.has(key)) {
      groups.set(key, {
        challengeId: note.challengeId ?? null,
        challengeTitle: note.challengeId ? (CHALLENGE_TITLES.get(note.challengeId) ?? "未知关卡") : "未关联关卡",
        notes: [],
      });
    }
    groups.get(key).notes.push({
      id: note.id,
      title: note.title,
      content: note.content,
      tag: note.tag,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    });
  }
  return [...groups.values()].sort((a, b) => {
    if (a.challengeId === null) return 1;
    if (b.challengeId === null) return -1;
    return String(a.challengeId).localeCompare(String(b.challengeId), "zh");
  });
}

/** 高频错误画像:按 errors_json 聚合错误类型频次,识别"连续重复错误"(最新提交起连续 ≥2 次出现)。 */
export function buildErrorProfile(db, studentId) {
  const rows = db.prepare(`
    SELECT challenge_id AS challengeId, errors_json AS errorsJson, created_at AS createdAt
    FROM challenge_attempts WHERE student_id = ? ORDER BY id DESC LIMIT 100
  `).all(studentId);

  const entries = new Map();
  for (const row of rows) {
    const errors = safeJson(row.errorsJson, []);
    for (const raw of errors) {
      const errorType = String(raw);
      if (!entries.has(errorType)) {
        entries.set(errorType, { errorType, count: 0, lastSeen: null, relatedChallengeIds: new Set() });
      }
      const entry = entries.get(errorType);
      entry.count += 1;
      entry.relatedChallengeIds.add(row.challengeId);
      if (entry.lastSeen === null || row.createdAt > entry.lastSeen) entry.lastSeen = row.createdAt;
    }
  }

  const streaks = new Map();
  for (const row of rows) {
    const errorSet = new Set(safeJson(row.errorsJson, []).map(String));
    for (const [errorType, entry] of entries) {
      const streak = errorSet.has(errorType) ? (streaks.get(errorType) ?? 0) + 1 : 0;
      streaks.set(errorType, streak);
      if (streak >= 2) entry.repeated = true;
    }
  }

  return [...entries.values()]
    .map((entry) => ({
      errorType: entry.errorType,
      count: entry.count,
      lastSeen: entry.lastSeen,
      relatedChallengeIds: [...entry.relatedChallengeIds],
      repeated: entry.repeated === true,
    }))
    .sort((a, b) => b.count - a.count || String(a.errorType).localeCompare(String(b.errorType), "zh"));
}

export function archiveClass(db, classId) {
  db.prepare("UPDATE classes SET status = 'archived', archived_at = CURRENT_TIMESTAMP WHERE id = ?").run(classId);
}

export function unarchiveClass(db, classId) {
  db.prepare("UPDATE classes SET status = 'active', archived_at = NULL WHERE id = ?").run(classId);
}

export function disableStudent(db, studentId) {
  db.prepare("UPDATE users SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = 'student'").run(studentId);
}

export function enableStudent(db, studentId) {
  db.prepare("UPDATE users SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(studentId);
}

export function transferStudent(db, studentId, fromClassId, toClassId) {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM class_members WHERE class_id = ? AND student_id = ?").run(fromClassId, studentId);
    addStudentToClass(db, toClassId, studentId);
  });
  tx();
}


