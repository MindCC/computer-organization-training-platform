import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { hashPassword, verifyPassword } from "./auth.js";
import { createApp } from "./app.js";
import { createUser, migrate, openDatabase } from "./db.js";

async function makeServer(options = {}) {
  const db = openDatabase(options.databasePath ?? ":memory:");
  const { databasePath: _databasePath, ...appOptions } = options;
  migrate(db);
  createUser(db, {
    username: "teacher",
    displayName: "任课教师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const app = createApp({
    db,
    serveStatic: false,
    assistantOptions: { env: {} },
    ...appOptions,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  return { db, server, baseUrl: `http://127.0.0.1:${port}` };
}

async function request(baseUrl, path, options = {}, jar = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (jar.cookie) headers.cookie = jar.cookie;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) jar.cookie = setCookie.split(";")[0];
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, body };
}

test("cross-origin classroom POST is rejected before route handling", async () => {
  const { db, server, baseUrl } = await makeServer({ publicBaseUrl: "http://127.0.0.1" });
  const teacherJar = {};
  try {
    let result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "teacher", password: "Teacher123!" }),
    }, teacherJar);
    assert.equal(result.response.status, 200);

    result = await request(baseUrl, "/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "CSRF regression" }),
    }, teacherJar);
    assert.equal(result.response.status, 201);

    result = await request(baseUrl, `/api/teacher/classes/${result.body.class.id}/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
      body: JSON.stringify({
        templateKey: "computer-data-flow",
        durationMinutes: 45,
        passScore: 80,
        allowMakeup: false,
      }),
    }, teacherJar);
    assert.equal(result.response.status, 403);
    assert.equal(result.body.error, "跨站请求被拒绝");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
test("password hashing verifies correct password and rejects wrong password", async () => {
  const hashed = await hashPassword("Secret123!");
  assert.equal(await verifyPassword("Secret123!", hashed), true);
  assert.equal(await verifyPassword("wrong", hashed), false);
});

test("assistant route uses injected generator instead of host AI configuration", async () => {
  const calls = [];
  const { db, server, baseUrl } = await makeServer({
    assistantOptions: { env: { DEEPSEEK_API_KEY: "must-not-be-read" } },
    generateTeacherAssistantReport: async (_db, teacherId, classId, options) => {
      calls.push({ teacherId, classId, options });
      return {
        source: "fallback",
        generatedAt: "2026-07-15T00:00:00.000Z",
        fallbackReason: "测试注入",
        report: {
          lessonFocus: "测试重点",
          riskStudents: [],
          groupingPlan: [],
          commonMisconceptions: [],
          nextClassPlan: [],
          teacherScript: "测试讲解",
        },
      };
    },
  });
  const jar = {};
  try {
    await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "teacher", password: "Teacher123!" }),
    }, jar);
    const created = await request(baseUrl, "/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "依赖注入班" }),
    }, jar);
    const result = await request(
      baseUrl,
      `/api/teacher/classes/${created.body.class.id}/assistant-report`,
      { method: "POST" },
      jar,
    );

    assert.equal(result.response.status, 200);
    assert.equal(result.body.fallbackReason, "测试注入");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].options.env, { DEEPSEEK_API_KEY: "must-not-be-read" });
    const forbidden = await request(
      baseUrl,
      "/api/teacher/classes/999999/assistant-report",
      { method: "POST" },
      jar,
    );
    assert.equal(forbidden.response.status, 404);
    assert.equal(calls.length, 1);

  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
test("teacher imports students, student submits progress, teacher exports csv", async () => {
  const { db, server, baseUrl } = await makeServer();
  const teacherJar = {};
  const studentJar = {};
  try {
    let result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "teacher", password: "Teacher123!" }),
    }, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.user.role, "teacher");

    result = await request(baseUrl, "/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "计组一班" }),
    }, teacherJar);
    assert.equal(result.response.status, 201);
    const classId = result.body.class.id;

    result = await request(baseUrl, `/api/teacher/classes/${classId}/import-students`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: "username,displayName,password\n2026001,李同学,Student123!\n2026001,李同学,Student123!\n,缺学号," }),
    }, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.imported, 1);
    assert.equal(result.body.updated, 1);
    assert.equal(result.body.skipped, 1);

    result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "2026001", password: "Student123!" }),
    }, studentJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.user.role, "student");

    result = await request(baseUrl, "/api/student/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: "computer-components",
        result: { passed: true, score: 100, errors: [], elapsedMinutes: 8 },
      }),
    }, studentJar);
    assert.equal(result.response.status, 201);
    assert.equal(result.body.progress["computer-components"].status, "completed");
    assert.equal(result.body.progress["program-flow"].status, "in-progress");

    result = await request(baseUrl, "/api/student/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: "game-office-pc",
        result: {
          passed: true,
          score: 100,
          errors: [],
          elapsedMinutes: 6,
          selection: { cpu: "cpu-i3", memory: "mem-8", storage: "ssd-512", gpu: "gpu-integrated" },
        },
      }),
    }, studentJar);
    assert.equal(result.response.status, 201);
    assert.equal(result.body.progress["game-office-pc"].status, "completed");
    result = await request(baseUrl, "/api/student/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "复盘", content: "我理解了进位。", tag: "课堂", challengeId: "data-flow" }),
    }, studentJar);
    assert.equal(result.response.status, 201);
    const noteId = result.body.note.id;
    assert.equal(result.body.note.challengeId, "data-flow");

    result = await request(baseUrl, "/api/student/notes?query=进位&challengeId=data-flow", {}, studentJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.notes.length, 1);

    result = await request(baseUrl, `/api/student/notes/${noteId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "数据流复盘", content: "我理解了 CPU 到内存的数据流动。", tag: "数据流", challengeId: "data-flow" }),
    }, studentJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.note.title, "数据流复盘");

    result = await request(baseUrl, "/api/student/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "临时笔记", content: "下课前清理。", tag: "临时", challengeId: "and-gate" }),
    }, studentJar);
    const deletedNoteId = result.body.note.id;
    result = await request(baseUrl, `/api/student/notes/${deletedNoteId}`, { method: "DELETE" }, studentJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.ok, true);

    result = await request(baseUrl, "/api/student/report.md", {}, studentJar);
    assert.equal(result.response.status, 200);
    assert.match(result.response.headers.get("content-type"), /text\/markdown/);
    assert.match(result.body, /# 计算机组成原理实验报告/);
    assert.match(result.body, /学号：2026001/);
    assert.match(result.body, /数据流/);
    assert.match(result.body, /硬件配置/);
    assert.match(result.body, /数据流复盘/);
    assert.match(result.body, /CPU 到内存的数据流动/);

    result = await request(baseUrl, `/api/teacher/classes/${classId}/overview`, {}, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.students.length, 1);
    assert.equal(result.body.students[0].summary.totalAttempts, 2);
    assert.equal(result.body.hardwareGameSummary.completedCases, 1);
    assert.equal(result.body.hardwareGameSummary.typicalBuilds[0].caseId, "game-office-pc");
    const studentId = result.body.students[0].id;

    result = await request(baseUrl, `/api/teacher/classes/${classId}/assistant-report`, {
      method: "POST",
    }, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.source, "fallback");
    assert.equal(result.body.fallbackReason, "DEEPSEEK_API_KEY 未配置");
    assert.equal(typeof result.body.report.lessonFocus, "string");

    result = await request(baseUrl, `/api/teacher/classes/${classId + 9999}/assistant-report`, {
      method: "POST",
    }, teacherJar);
    assert.equal(result.response.status, 404);
    assert.equal(result.body.error, "班级不存在");

    createUser(db, {
      username: "other-teacher",
      displayName: "其他教师",
      role: "teacher",
      passwordHash: await hashPassword("OtherTeacher123!"),
    });
    const otherTeacherJar = {};
    result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "other-teacher", password: "OtherTeacher123!" }),
    }, otherTeacherJar);
    assert.equal(result.response.status, 200);
    result = await request(baseUrl, `/api/teacher/classes/${classId}/assistant-report`, {
      method: "POST",
    }, otherTeacherJar);
    assert.equal(result.response.status, 404);
    assert.equal(result.body.error, "班级不存在");

    result = await request(baseUrl, `/api/teacher/classes/${classId}/students/${studentId}`, {}, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.student.username, "2026001");
    assert.equal(result.body.student.attempts.length, 2);
    assert.equal(result.body.student.notes.length, 1);
    assert.equal(result.body.student.progress["computer-components"].bestScore, 100);
    assert.equal(result.body.student.progress["game-office-pc"].bestScore, 100);
    assert.equal(result.body.student.timeDistribution[0].challengeId, "computer-components");
    assert.equal(result.body.student.timeDistribution[0].timeSpentMinutes, 8);
    assert.ok(result.body.student.scoreTrends.some((item) => item.challengeId === "computer-components" && item.best === 100));
    assert.equal(result.body.student.hardwareSummary.completedCases, 1);
    assert.equal(result.body.student.hardwareSummary.bestCaseId, "game-office-pc");

    result = await request(baseUrl, "/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "计组二班" }),
    }, teacherJar);
    assert.equal(result.response.status, 201);
    const secondClassId = result.body.class.id;

    result = await request(baseUrl, `/api/teacher/classes/${secondClassId}/import-students`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: "学号,姓名,初始密码\n2026001,李同学,Student123!\n" }),
    }, teacherJar);
    assert.equal(result.response.status, 200);

    result = await request(baseUrl, `/api/teacher/classes/${secondClassId}/students/${studentId}`, {}, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.student.classId, secondClassId);

    result = await request(baseUrl, `/api/teacher/classes/${classId}/export.csv`, {}, teacherJar);
    assert.equal(result.response.status, 200);
    assert.match(result.body, /2026001/);
    assert.match(result.body, /李同学/);
    assert.match(result.body, /数据流/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("unauthenticated and cross-role access is rejected", async () => {
  const { server, baseUrl } = await makeServer();
  const teacherJar = {};
  const studentJar = {};
  try {
    let result = await request(baseUrl, "/api/student/progress");
    assert.equal(result.response.status, 401);

    result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "teacher", password: "Teacher123!" }),
    }, teacherJar);
    assert.equal(result.response.status, 200);
    result = await request(baseUrl, "/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "一班" }),
    }, teacherJar);
    const classId = result.body.class.id;
    await request(baseUrl, `/api/teacher/classes/${classId}/import-students`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: "2026002,王同学,Student123!" }),
    }, teacherJar);
    result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "2026002", password: "Student123!" }),
    }, studentJar);
    assert.equal(result.response.status, 200);
    result = await request(baseUrl, "/api/teacher/classes", {}, studentJar);
    assert.equal(result.response.status, 403);
    result = await request(baseUrl, `/api/teacher/classes/${classId}/assistant-report`, {
      method: "POST",
    }, studentJar);
    assert.equal(result.response.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("classroom mission full flow: teacher creates/starts, student discovers/enters/submits, duplicate idempotent, pause/reject, end/report", async () => {
  const { db, server, baseUrl } = await makeServer();
  const teacherJar = {};
  const studentJar = {};
  try {
    // Login
    let result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "teacher", password: "Teacher123!" }),
    }, teacherJar);
    assert.equal(result.response.status, 200);

    // Create class
    result = await request(baseUrl, "/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "课堂测试班" }),
    }, teacherJar);
    assert.equal(result.response.status, 201);
    const classId = result.body.class.id;

    // Import student
    result = await request(baseUrl, `/api/teacher/classes/${classId}/import-students`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: "cs101,张同学,Student123!" }),
    }, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.imported, 1);

    // Student login
    result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "cs101", password: "Student123!" }),
    }, studentJar);
    assert.equal(result.response.status, 200);

    // Student: no current session
    result = await request(baseUrl, "/api/student/classroom/current", {}, studentJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.session, null);

    // Teacher: create draft
    result = await request(baseUrl, `/api/teacher/classes/${classId}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80, allowMakeup: false }),
    }, teacherJar);
    assert.equal(result.response.status, 201);
    assert.equal(result.body.session.status, "draft");
    const sessionId = result.body.session.id;

    // Teacher: start
    result = await request(baseUrl, `/api/teacher/sessions/${sessionId}/start`, {
      method: "POST",
    }, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.session.status, "live");

    // Student: discover current
    result = await request(baseUrl, "/api/student/classroom/current", {}, studentJar);
    assert.equal(result.response.status, 200);
    assert.ok(result.body.session);
    assert.equal(result.body.session.id, sessionId);

    // Student: enter
    result = await request(baseUrl, `/api/student/classroom/${sessionId}/enter`, {
      method: "POST",
    }, studentJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.studentState.status, "in_progress");

    // Student: submit stage 1 (completed=true for participation)
    const clientId = crypto.randomUUID();
    result = await request(baseUrl, "/api/student/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientSubmissionId: clientId,
        challengeId: "computer-components",
        result: { completed: true, elapsedMinutes: 3 },
      }),
    }, studentJar);
    assert.equal(result.response.status, 201);
    assert.ok(result.body.summary?.xp >= 100);

    // Duplicate submission: idempotent
    result = await request(baseUrl, "/api/student/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientSubmissionId: clientId,
        challengeId: "computer-components",
        result: { completed: true, elapsedMinutes: 3 },
      }),
    }, studentJar);
    assert.equal(result.response.status, 200);
    assert.ok(result.body.duplicateResult?.passed);

    // Teacher: pause
    result = await request(baseUrl, `/api/teacher/sessions/${sessionId}/pause`, {
      method: "POST",
    }, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.session.status, "paused");

    // Student: submit during pause → rejected
    result = await request(baseUrl, "/api/student/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientSubmissionId: crypto.randomUUID(),
        challengeId: "computer-components",
        result: { completed: true, elapsedMinutes: 1 },
      }),
    }, studentJar);
    assert.equal(result.response.status, 409);
    assert.equal(result.body.error.code, "SESSION_PAUSED");
    assert.equal(result.body.error.retryable, true);

    // Teacher: resume
    result = await request(baseUrl, `/api/teacher/sessions/${sessionId}/resume`, {
      method: "POST",
    }, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.session.status, "live");

    // Teacher: overview
    result = await request(baseUrl, `/api/teacher/sessions/${sessionId}/overview`, {}, teacherJar);
    assert.equal(result.response.status, 200);
    assert.ok(result.body.students);
    assert.ok(result.body.students.some((s) => s.studentId));

    // Teacher: report before end → 409
    result = await request(baseUrl, `/api/teacher/sessions/${sessionId}/report`, {}, teacherJar);
    assert.equal(result.response.status, 409);
    assert.equal(result.body.error.code, "SESSION_NOT_ENDED");

    // Teacher: end
    result = await request(baseUrl, `/api/teacher/sessions/${sessionId}/end`, {
      method: "POST",
    }, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.session.status, "ended");
    assert.ok(result.body.report);

    // Teacher: report after end
    result = await request(baseUrl, `/api/teacher/sessions/${sessionId}/report`, {}, teacherJar);
    assert.equal(result.response.status, 200);
    assert.ok(result.body.report.frozenAt);
    assert.ok(result.body.report.studentReports);

    // Ownership 404
    await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "teacher", password: "Teacher123!" }),
    }, teacherJar);
    result = await request(baseUrl, `/api/teacher/sessions/${sessionId + 9999}/overview`, {}, teacherJar);
    assert.equal(result.response.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("admin backup endpoints return db info and reject download for in-memory", async () => {
  const { db, server, baseUrl } = await makeServer();
  const teacherJar = {};
  try {
    let result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "teacher", password: "Teacher123!" }),
    }, teacherJar);
    assert.equal(result.response.status, 200);

    result = await request(baseUrl, "/api/admin/db-info", {}, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.path, ":memory:");

    result = await request(baseUrl, "/api/admin/backup", {}, teacherJar);
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /内存数据库/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("student import and backup never expose recoverable initial passwords", async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "zcyl-password-backup-"));
  const databasePath = path.join(tempDirectory, "classroom.sqlite");
  const knownPassword = "RecoverableSecret123!";
  const { db, server, baseUrl } = await makeServer({ databasePath });
  const teacherJar = {};
  const studentJar = {};
  try {
    let result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "teacher", password: "Teacher123!" }),
    }, teacherJar);
    assert.equal(result.response.status, 200);

    result = await request(baseUrl, "/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Password boundary" }),
    }, teacherJar);
    const classId = result.body.class.id;

    result = await request(baseUrl, `/api/teacher/classes/${classId}/import-students`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: `secure001,Safe Student,${knownPassword}` }),
    }, teacherJar);
    assert.equal(result.response.status, 200);

    const imported = db.prepare("SELECT id, profile_json FROM users WHERE username = ?").get("secure001");
    assert.equal(Object.hasOwn(JSON.parse(imported.profile_json), "initialPassword"), false);

    db.prepare("UPDATE users SET profile_json = ? WHERE id = ?").run(
      JSON.stringify({ initialPassword: knownPassword, goal: "legacy", mustChangePassword: true }),
      imported.id,
    );
    migrate(db);
    const migrated = db.prepare("SELECT profile_json FROM users WHERE id = ?").get(imported.id);
    assert.deepEqual(JSON.parse(migrated.profile_json), { goal: "legacy", mustChangePassword: true });

    result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "secure001", password: knownPassword }),
    }, studentJar);
    assert.equal(result.response.status, 200);
    result = await request(baseUrl, "/api/auth/me", {}, studentJar);
    assert.equal(JSON.stringify(result.body).includes("initialPassword"), false);
    assert.equal(JSON.stringify(result.body).includes(knownPassword), false);
    assert.equal(result.body.user.profile.mustChangePassword, true);

    const nextPassword = "ChangedSecret456!";
    result = await request(baseUrl, "/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: knownPassword, nextPassword }),
    }, studentJar);
    assert.equal(result.response.status, 200);
    const changedProfile = JSON.parse(
      db.prepare("SELECT profile_json FROM users WHERE id = ?").get(imported.id).profile_json,
    );
    assert.equal(changedProfile.mustChangePassword, false);
    assert.match(changedProfile.passwordChangedAt, /^\d{4}-\d{2}-\d{2}T/);

    const backupResponse = await fetch(`${baseUrl}/api/admin/backup`, {
      headers: { cookie: teacherJar.cookie },
    });
    assert.equal(backupResponse.status, 200);
    const backupBytes = Buffer.from(await backupResponse.arrayBuffer());
    assert.equal(backupBytes.includes(Buffer.from(knownPassword, "utf8")), false);
    assert.equal(backupBytes.includes(Buffer.from(nextPassword, "utf8")), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
