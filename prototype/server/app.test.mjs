import test from "node:test";
import assert from "node:assert/strict";

import { hashPassword, verifyPassword } from "./auth.js";
import { createApp } from "./app.js";
import { createUser, migrate, openDatabase } from "./db.js";

async function makeServer() {
  const db = openDatabase(":memory:");
  migrate(db);
  createUser(db, {
    username: "teacher",
    displayName: "任课教师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const app = createApp({ db, serveStatic: false });
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

test("password hashing verifies correct password and rejects wrong password", async () => {
  const hashed = await hashPassword("Secret123!");
  assert.equal(await verifyPassword("Secret123!", hashed), true);
  assert.equal(await verifyPassword("wrong", hashed), false);
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
        challengeId: "data-flow",
        result: { passed: true, score: 100, errors: [], elapsedMinutes: 8 },
      }),
    }, studentJar);
    assert.equal(result.response.status, 201);
    assert.equal(result.body.progress["data-flow"].status, "completed");
    assert.equal(result.body.progress["and-gate"].status, "in-progress");
    assert.equal(result.body.progress["half-adder"].status, "locked");

    result = await request(baseUrl, "/api/student/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "复盘", content: "我理解了进位。", tag: "课堂" }),
    }, studentJar);
    assert.equal(result.response.status, 201);

    result = await request(baseUrl, `/api/teacher/classes/${classId}/overview`, {}, teacherJar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.students.length, 1);
    assert.equal(result.body.students[0].summary.totalAttempts, 1);
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
    assert.equal(result.body.student.attempts.length, 1);
    assert.equal(result.body.student.notes.length, 1);
    assert.equal(result.body.student.progress["data-flow"].bestScore, 100);

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
