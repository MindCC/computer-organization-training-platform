import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { LEARNING_ITEMS, buildInitialLearningProgress, recordAttempt, summarizeLearning } from "../src/platformLogic.js";
import { summarizeHardwareGameAttempts } from "../src/hardwareGame.js";

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

export function listTeacherClasses(db, teacherId) {
  return db.prepare(`
    SELECT c.id, c.name, c.created_at AS createdAt, COUNT(cm.student_id) AS studentCount
    FROM classes c
    LEFT JOIN class_members cm ON cm.class_id = c.id
    WHERE c.teacher_id = ?
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

export function listNotes(db, studentId) {
  return db.prepare(`
    SELECT id, title, content, tag, created_at AS createdAt FROM notes WHERE student_id = ? ORDER BY id DESC
  `).all(studentId);
}

export function createNote(db, studentId, { title, content, tag }) {
  const result = db.prepare("INSERT INTO notes (student_id, title, content, tag) VALUES (?, ?, ?, ?)").run(studentId, title, content, tag);
  return db.prepare("SELECT id, title, content, tag, created_at AS createdAt FROM notes WHERE id = ?").get(result.lastInsertRowid);
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
  return {
    ...membership,
    progress: getStudentProgress(db, studentId),
    notes: listNotes(db, studentId),
    attempts: db.prepare(`
      SELECT id, challenge_id AS challengeId, score, passed, errors_json AS errorsJson, result_json AS resultJson, created_at AS createdAt
      FROM challenge_attempts WHERE student_id = ? ORDER BY id DESC LIMIT 100
    `).all(studentId).map((row) => ({ ...row, passed: Boolean(row.passed), errors: safeJson(row.errorsJson, []), result: safeJson(row.resultJson, {}) })),
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

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}
