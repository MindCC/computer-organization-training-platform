import test from "node:test";
import assert from "node:assert/strict";

import { hashPassword } from "./auth.js";
import { createApp } from "./app.js";
import { createUser, migrate, openDatabase, recordDemoAttempt, summarizeDemoAttempts } from "./db.js";
import { demoTitleOf, isValidDemoId, normalizeDemoAttemptPayload } from "./demoValidation.js";
import { buildStudentMarkdownReport } from "./studentReport.js";

async function makeServer() {
  const db = openDatabase(":memory:");
  migrate(db);
  createUser(db, { username: "teacher", displayName: "任课教师", role: "teacher", passwordHash: await hashPassword("Teacher123!") });
  createUser(db, { username: "stu01", displayName: "演示学生", role: "student", passwordHash: await hashPassword("Student123!") });
  const app = createApp({ db, serveStatic: false, assistantOptions: { env: {} } });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return { db, server, baseUrl: `http://127.0.0.1:${server.address().port}` };
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

test("演示练习载荷校验：白名单与字段约束", () => {
  assert.equal(isValidDemoId("cpu"), true);
  assert.equal(isValidDemoId("not-a-demo"), false);
  assert.equal(demoTitleOf("bus"), "系统总线");

  const ok = normalizeDemoAttemptPayload({ demoId: "cpu", result: { score: 80, total: 5, correct: 4, elapsedMinutes: 3 } });
  assert.equal(ok.ok, true);
  assert.deepEqual({ score: ok.result.score, total: ok.result.total, correct: ok.result.correct }, { score: 80, total: 5, correct: 4 });

  assert.equal(normalizeDemoAttemptPayload({ demoId: "nope", result: { score: 80, total: 5, correct: 4 } }).ok, false);
  assert.equal(normalizeDemoAttemptPayload({ demoId: "cpu", result: { score: 101, total: 5, correct: 4 } }).ok, false);
  assert.equal(normalizeDemoAttemptPayload({ demoId: "cpu", result: { score: 80, total: 0, correct: 0 } }).ok, false);
  assert.equal(normalizeDemoAttemptPayload({ demoId: "cpu", result: { score: 80, total: 5, correct: 6 } }).ok, false);
});

test("演示练习记录与按页汇总", () => {
  const db = openDatabase(":memory:");
  migrate(db);
  const student = createUser(db, { username: "stu01", displayName: "演示学生", role: "student", passwordHash: "x" });
  recordDemoAttempt(db, student.id, "cpu", { score: 80, total: 5, correct: 4, errors: [], elapsedMinutes: 2 });
  recordDemoAttempt(db, student.id, "cpu", { score: 100, total: 5, correct: 5, errors: [], elapsedMinutes: 2 });
  recordDemoAttempt(db, student.id, "bus", { score: 60, total: 5, correct: 3, errors: ["判优特性混淆"], elapsedMinutes: 3 });

  const summary = summarizeDemoAttempts(db, student.id);
  const cpu = summary.find((item) => item.demoId === "cpu");
  assert.equal(cpu.batches, 2);
  assert.equal(cpu.totalQuestions, 10);
  assert.equal(cpu.totalCorrect, 9);
  assert.equal(cpu.accuracy, 90);
  assert.equal(cpu.bestScore, 100);
  assert.equal(cpu.latestScore, 100);
  const bus = summary.find((item) => item.demoId === "bus");
  assert.equal(bus.accuracy, 60);
  db.close();
});

test("演示练习端点：提交、汇总与学情报告", async () => {
  const { server, baseUrl } = await makeServer();
  const jar = {};
  try {
    let result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "stu01", password: "Student123!" }),
    }, jar);
    assert.equal(result.response.status, 200);

    result = await request(baseUrl, "/api/student/demo-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demoId: "addressing", result: { score: 100, total: 5, correct: 5, errors: [], elapsedMinutes: 2 } }),
    }, jar);
    assert.equal(result.response.status, 201);
    const addressing = result.body.demos.find((item) => item.demoId === "addressing");
    assert.equal(addressing.batches, 1);
    assert.equal(addressing.accuracy, 100);

    // 非法演示页与非法分数被拒绝
    result = await request(baseUrl, "/api/student/demo-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demoId: "not-a-demo", result: { score: 100, total: 5, correct: 5 } }),
    }, jar);
    assert.equal(result.response.status, 400);
    result = await request(baseUrl, "/api/student/demo-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demoId: "cpu", result: { score: 120, total: 5, correct: 5 } }),
    }, jar);
    assert.equal(result.response.status, 400);

    result = await request(baseUrl, "/api/student/demo-attempts", {}, jar);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.demos[0].demoId, "addressing");
    assert.equal(result.body.demos[0].title, "指令系统与寻址方式");

    result = await request(baseUrl, "/api/student/report.md", {}, jar);
    assert.equal(result.response.status, 200);
    assert.match(result.body, /课堂演示练习/);
    assert.match(result.body, /指令系统与寻址方式/);
    assert.match(result.body, /100%/);
  } finally {
    server.close();
  }
});

test("学情报告渲染演示练习章节", () => {
  const markdown = buildStudentMarkdownReport({
    user: { displayName: "演示学生", username: "stu01" },
    summary: { completionRate: 10, averageScore: 60, totalAttempts: 1, weakSpot: "无" },
    progress: {},
    notes: [],
    demoAttempts: [
      { demoId: "io", title: "输入输出系统", batches: 2, totalQuestions: 10, totalCorrect: 8, accuracy: 80, bestScore: 100, latestScore: 60 },
    ],
  });
  assert.match(markdown, /## 课堂演示练习/);
  assert.match(markdown, /输入输出系统/);
  assert.match(markdown, /80%/);
});

test("无演示练习时报告不渲染该章节", () => {
  const markdown = buildStudentMarkdownReport({
    user: { displayName: "演示学生", username: "stu01" },
    summary: {},
    progress: {},
    notes: [],
    demoAttempts: [],
  });
  assert.equal(markdown.includes("课堂演示练习"), false);
});
