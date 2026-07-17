import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { LEARNING_ITEMS, buildInitialLearningProgress, recordAttempt, summarizeLearning } from "../src/platformLogic.js";
import { HARDWARE_GAME_CASES, summarizeHardwareGameAttempts } from "../src/hardwareGame.js";

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
}

export function sanitizeUser(row) {
  if (!row) return null;
  const profile = safeJson(row.profile_json, {});
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
  `).run(String(username).trim(), displayName, role, passwordHash, JSON.stringify(profile));
  return getUserById(db, result.lastInsertRowid);
}

export function updateUserProfile(db, userId, { displayName, profile }) {
  const current = getUserById(db, userId);
  const nextProfile = { ...safeJson(current.profile_json, {}), ...(profile ?? {}) };
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

export function recordStudentAttempt(db, studentId, challengeId, result) {
  const before = getStudentProgress(db, studentId);
  const next = recordAttempt(before, challengeId, result);
  const errors = (result.errors ?? []).map((error) => error.type ?? String(error));
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO challenge_attempts (student_id, challenge_id, score, passed, errors_json, result_json, elapsed_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      studentId,
      challengeId,
      Number(result.score ?? 0),
      result.passed ? 1 : 0,
      JSON.stringify(errors),
      JSON.stringify(result),
      Number(result.elapsedMinutes ?? 0),
    );
    saveStudentProgress(db, studentId, next);
  });
  tx();
  return next;
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
  return {
    ...membership,
    progress,
    notes: listNotes(db, studentId),
    attempts: db.prepare(`
      SELECT id, challenge_id AS challengeId, score, passed, errors_json AS errorsJson, result_json AS resultJson, created_at AS createdAt
      FROM challenge_attempts WHERE student_id = ? ORDER BY id DESC LIMIT 100
    `).all(studentId).map((row) => ({ ...row, passed: Boolean(row.passed), errors: safeJson(row.errorsJson, []), result: safeJson(row.resultJson, {}) })),
    timeDistribution: buildTimeDistribution(progress),
    scoreTrends: buildScoreTrends(db, studentId),
    hardwareSummary: buildStudentHardwareSummary(db, studentId),
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


