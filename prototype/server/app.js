import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createToken, hashPassword, hashToken, verifyPassword } from "./auth.js";
import { generateTeacherAssistantReport } from "./teacherAssistant.js";
import { normalizeStudentAttemptPayload } from "./submissionValidation.js";
import { buildStudentMarkdownReport } from "./studentReport.js";
import {
  addStudentToClass,
  createClass,
  createNote,
  createSession,
  createUser,
  deleteExpiredSessions,
  deleteNote,
  deleteSession,
  getClassOverview,
  getSessionUser,
  getStudentProgress,
  getTeacherStudentDetail,
  getUserById,
  getUserByUsername,
  listNotes,
  listTeacherClasses,
  migrate,
  openDatabase,
  recordStudentAttempt,
  sanitizeUser,
  teacherOwnsClass,
  updateNote,
  updateUserPassword,
  updateUserProfile,
} from "./db.js";
import { CHALLENGES, LEARNING_ITEMS, summarizeLearning } from "../src/platformLogic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIE_NAME = "zcyl_session";
const SESSION_DAYS = 7;

export function createApp(options = {}) {
  const db = options.db ?? openDatabase(options.databasePath);
  migrate(db);
  const app = express();
  app.locals.db = db;

  app.use(express.json({ limit: "1mb" }));
  app.use(express.text({ type: ["text/csv", "text/plain"], limit: "1mb" }));
  app.use(loadSession(db));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const { username, password } = req.body ?? {};
      const user = getUserByUsername(db, username ?? "");
      if (!user || user.status !== "active" || !(await verifyPassword(password ?? "", user.password_hash))) {
        return res.status(401).json({ error: "用户名或密码错误" });
      }
      deleteExpiredSessions(db);
      const token = createToken();
      const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
      createSession(db, user.id, hashToken(token), expiresAt);
      res.setHeader("Set-Cookie", serializeCookie(COOKIE_NAME, token, { expires: expiresAt }));
      res.json({ user: sanitizeUser(user) });
    } catch (error) { next(error); }
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    if (req.sessionTokenHash) deleteSession(db, req.sessionTokenHash);
    res.setHeader("Set-Cookie", serializeCookie(COOKIE_NAME, "", { maxAge: 0 }));
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ user: sanitizeUser(req.user) });
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res, next) => {
    try {
      const { currentPassword, nextPassword } = req.body ?? {};
      if (!nextPassword || String(nextPassword).length < 6) return res.status(400).json({ error: "新密码至少 6 位" });
      const user = getUserById(db, req.user.id);
      if (!(await verifyPassword(currentPassword ?? "", user.password_hash))) return res.status(400).json({ error: "当前密码不正确" });
      updateUserPassword(db, req.user.id, await hashPassword(nextPassword));
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  app.post("/api/classes", requireRole("teacher"), (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "班级名称不能为空" });
    res.status(201).json({ class: createClass(db, req.user.id, name) });
  });

  app.get("/api/teacher/classes", requireRole("teacher"), (req, res) => {
    res.json({ classes: listTeacherClasses(db, req.user.id) });
  });

  app.post("/api/teacher/classes/:id/import-students", requireRole("teacher"), async (req, res, next) => {
    try {
      const classId = Number(req.params.id);
      if (!teacherOwnsClass(db, req.user.id, classId)) return res.status(404).json({ error: "班级不存在" });
      const csvText = typeof req.body === "string" ? req.body : String(req.body?.csv ?? "");
      const rows = parseStudentCsv(csvText);
      const passwordHashCache = new Map();
      const report = { imported: 0, updated: 0, skipped: 0, errors: [] };
      for (const row of rows) {
        if (row.username && row.displayName && !getUserByUsername(db, row.username)) {
          const password = row.password || "ChangeMe123!";
          passwordHashCache.set(row.username, await hashPassword(password));
        }
      }

      const importTx = db.transaction(() => {
        for (const row of rows) {
          if (!row.username || !row.displayName) {
            report.skipped += 1;
            report.errors.push({ line: row.line, message: "缺少学号或姓名" });
            continue;
          }
          const initialPassword = row.password || "ChangeMe123!";
          let user = getUserByUsername(db, row.username);
          if (user && user.role !== "student") {
            report.skipped += 1;
            report.errors.push({ line: row.line, message: "账号已被教师占用" });
            continue;
          }
          if (!user) {
            user = createUser(db, {
              username: row.username,
              displayName: row.displayName,
              role: "student",
              passwordHash: passwordHashCache.get(row.username),
              profile: { goal: "完成计算机概述到运算器关卡", mode: "强引导模式", initialPassword },
            });
            report.imported += 1;
          } else {
            db.prepare("UPDATE users SET display_name = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.displayName, user.id);
            report.updated += 1;
          }
          addStudentToClass(db, classId, user.id);
        }
      });
      importTx();
      res.json(report);
    } catch (error) { next(error); }
  });

  app.get("/api/teacher/classes/:id/overview", requireRole("teacher"), (req, res) => {
    const classId = Number(req.params.id);
    if (!teacherOwnsClass(db, req.user.id, classId)) return res.status(404).json({ error: "班级不存在" });
    res.json(getClassOverview(db, classId));
  });

  app.post("/api/teacher/classes/:id/assistant-report", requireRole("teacher"), async (req, res, next) => {
    try {
      const classId = Number(req.params.id);
      const report = await generateTeacherAssistantReport(db, req.user.id, classId);
      res.json(report);
    } catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
      next(error);
    }
  });

  app.get("/api/teacher/classes/:id/students/:studentId", requireRole("teacher"), (req, res) => {
    const classId = Number(req.params.id);
    if (!teacherOwnsClass(db, req.user.id, classId)) return res.status(404).json({ error: "班级不存在" });
    const detail = getTeacherStudentDetail(db, req.user.id, Number(req.params.studentId), classId);
    if (!detail || Number(detail.classId) !== classId) return res.status(404).json({ error: "学生不存在" });
    res.json({ student: detail });
  });

  app.get("/api/teacher/classes/:id/export.csv", requireRole("teacher"), (req, res) => {
    const classId = Number(req.params.id);
    if (!teacherOwnsClass(db, req.user.id, classId)) return res.status(404).json({ error: "班级不存在" });
    const overview = getClassOverview(db, classId);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=class-${classId}-scores.csv`);
    res.send(renderScoresCsv(overview.students));
  });

  app.post("/api/teacher/students/:studentId/reset-password", requireRole("teacher"), async (req, res, next) => {
    try {
      const detail = getTeacherStudentDetail(db, req.user.id, Number(req.params.studentId));
      if (!detail) return res.status(404).json({ error: "学生不存在" });
      const nextPassword = String(req.body?.password ?? "ChangeMe123!");
      updateUserPassword(db, Number(req.params.studentId), await hashPassword(nextPassword));
      res.json({ ok: true, password: nextPassword });
    } catch (error) { next(error); }
  });

  app.get("/api/student/progress", requireRole("student"), (req, res) => {
    const progress = getStudentProgress(db, req.user.id);
    res.json({ progress, summary: summarizeLearning(LEARNING_ITEMS, progress), user: sanitizeUser(req.user) });
  });

  app.post("/api/student/attempts", requireRole("student"), (req, res) => {
    const normalized = normalizeStudentAttemptPayload(req.body ?? {}, LEARNING_ITEMS);
    if (!normalized.ok) return res.status(normalized.status).json({ error: normalized.error });
    const progress = recordStudentAttempt(db, req.user.id, normalized.challengeId, normalized.result);
    res.status(201).json({ progress, summary: summarizeLearning(LEARNING_ITEMS, progress) });
  });

  app.get("/api/student/notes", requireRole("student"), (req, res) => {
    res.json({
      notes: listNotes(db, req.user.id, {
        query: req.query.query,
        tag: req.query.tag,
        challengeId: req.query.challengeId,
      }),
    });
  });

  app.get("/api/student/report.md", requireRole("student"), (req, res) => {
    const progress = getStudentProgress(db, req.user.id);
    const markdown = buildStudentMarkdownReport({
      user: sanitizeUser(req.user),
      progress,
      summary: summarizeLearning(LEARNING_ITEMS, progress),
      notes: listNotes(db, req.user.id),
    });
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${req.user.username}-experiment-report.md`);
    res.send(markdown);
  });

  app.post("/api/student/notes", requireRole("student"), (req, res) => {
    const content = String(req.body?.content ?? "").trim();
    if (!content) return res.status(400).json({ error: "笔记内容不能为空" });
    const note = createNote(db, req.user.id, {
      title: String(req.body?.title ?? "实验复盘"),
      content,
      tag: String(req.body?.tag ?? "课堂笔记"),
      challengeId: req.body?.challengeId,
    });
    res.status(201).json({ note });
  });

  app.put("/api/student/notes/:noteId", requireRole("student"), (req, res) => {
    if (req.body?.content !== undefined && !String(req.body.content).trim()) return res.status(400).json({ error: "笔记内容不能为空" });
    const note = updateNote(db, req.user.id, Number(req.params.noteId), {
      title: req.body?.title,
      content: req.body?.content,
      tag: req.body?.tag,
      challengeId: req.body?.challengeId,
    });
    if (!note) return res.status(404).json({ error: "笔记不存在" });
    res.json({ note });
  });

  app.delete("/api/student/notes/:noteId", requireRole("student"), (req, res) => {
    if (!deleteNote(db, req.user.id, Number(req.params.noteId))) return res.status(404).json({ error: "笔记不存在" });
    res.json({ ok: true });
  });

  app.put("/api/student/profile", requireRole("student"), (req, res) => {
    const { displayName, goal, mode } = req.body ?? {};
    const user = updateUserProfile(db, req.user.id, { displayName, profile: { goal, mode } });
    res.json({ user: sanitizeUser(user) });
  });

  if (options.serveStatic !== false) {
    const distDir = options.distDir ?? path.resolve(__dirname, "../dist");
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(distDir, "index.html")));
  }

  app.use((error, _req, res, _next) => {
    if (process.env.NODE_ENV !== "test") console.error(error);
    res.status(500).json({ error: "服务器内部错误" });
  });

  return app;
}

function loadSession(db) {
  return (req, _res, next) => {
    const cookies = parseCookies(req.headers.cookie ?? "");
    const token = cookies[COOKIE_NAME];
    if (token) {
      const tokenHash = hashToken(token);
      const user = getSessionUser(db, tokenHash);
      if (user) {
        req.user = user;
        req.sessionTokenHash = tokenHash;
      }
    }
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "请先登录" });
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "请先登录" });
    if (req.user.role !== role) return res.status(403).json({ error: "权限不足" });
    next();
  };
}

function parseStudentCsv(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, raw: line.trim() }))
    .filter((row) => row.raw && !/^username\s*,/i.test(row.raw) && !/^学号\s*,/.test(row.raw))
    .map((row) => {
      const [username, displayName, password] = row.raw.split(",").map((value) => value?.trim() ?? "");
      return { line: row.line, username, displayName, password };
    });
}

function renderScoresCsv(students) {
  const header = ["学号", "姓名", "完成率", "平均分", "尝试次数", ...CHALLENGES.flatMap((challenge) => [`${challenge.shortTitle}状态`, `${challenge.shortTitle}最高分`, `${challenge.shortTitle}尝试次数`, `${challenge.shortTitle}耗时`])];
  const rows = students.map((student) => [
    student.username,
    student.displayName,
    `${student.summary.completionRate}%`,
    student.summary.averageScore,
    student.summary.totalAttempts,
    ...LEARNING_ITEMS.flatMap((challenge) => {
      const record = student.progress[challenge.id];
      return [record.status, record.bestScore, record.attempts, record.timeSpentMinutes];
    }),
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCookies(header) {
  return String(header || "").split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const segments = [name + "=" + encodeURIComponent(value), "Path=/", "HttpOnly", "SameSite=Lax"];
  if (process.env.COOKIE_SECURE) segments.push("Secure");
  if (options.expires) segments.push("Expires=" + options.expires.toUTCString());
  if (options.maxAge !== undefined) segments.push("Max-Age=" + options.maxAge);
  return segments.join("; " );
}



