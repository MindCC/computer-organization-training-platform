import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";

const APP_URL = process.env.PROTOTYPE_APP_URL ?? "http://127.0.0.1:5173";
const API_URL = process.env.PROTOTYPE_API_URL ?? "http://127.0.0.1:3001";
const ARTIFACT_DIR = process.env.QA_ARTIFACT_DIR ?? path.resolve("qa-artifacts");
const TEACHER_USER = process.env.TEACHER_USERNAME ?? "teacher";
const TEACHER_PASS = process.env.TEACHER_PASSWORD ?? "ChangeMe123!";

async function login(context, username, password) {
  const page = await context.newPage();
  await page.goto(APP_URL);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/home", { timeout: 10_000 }).catch(() => {});
  return page;
}

async function apiRequest(path, options = {}, jar = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (jar.cookie) headers.cookie = jar.cookie;
  const response = await fetch(API_URL + path, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) jar.cookie = setCookie.split(";")[0];
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, body };
}

mkdirSync(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const pageErrors = [];

try {
  const teacherContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const studentContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });

  teacherContext.on("pageerror", (err) => pageErrors.push("teacher: " + err.message));
  studentContext.on("pageerror", (err) => pageErrors.push("student: " + err.message));

  // --- Teacher: login, create class, import student ---
  const teacherJar = {};
  await apiRequest("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: TEACHER_USER, password: TEACHER_PASS }),
  }, teacherJar);

  let res = await apiRequest("/api/classes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "课堂QA测试班" }),
  }, teacherJar);
  assert.equal(res.response.status, 201);
  const classId = res.body.class.id;

  res = await apiRequest(`/api/teacher/classes/${classId}/import-students`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ csv: "qa101,QA学生,Student123!" }),
  }, teacherJar);
  assert.equal(res.response.status, 200);

  // --- Student login ---
  const studentJar = {};
  await apiRequest("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "qa101", password: "Student123!" }),
  }, studentJar);

  // --- Teacher: create and start session ---
  res = await apiRequest(`/api/teacher/classes/${classId}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80, allowMakeup: false }),
  }, teacherJar);
  assert.equal(res.response.status, 201);
  const sessionId = res.body.session.id;

  res = await apiRequest(`/api/teacher/sessions/${sessionId}/start`, {
    method: "POST",
  }, teacherJar);
  assert.equal(res.response.status, 200);
  assert.equal(res.body.session.status, "live");
  console.log("PASS: teacher creates and starts session");

  // --- Student: discover and enter ---
  res = await apiRequest("/api/student/classroom/current", {}, studentJar);
  assert.ok(res.body.session);
  assert.equal(res.body.session.id, sessionId);

  res = await apiRequest(`/api/student/classroom/${sessionId}/enter`, {
    method: "POST",
  }, studentJar);
  assert.equal(res.body.studentState.status, "in_progress");
  console.log("PASS: student discovers and enters session");

  // --- Student: submit stage 1 ---
  const clientId = crypto.randomUUID();
  res = await apiRequest("/api/student/attempts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientSubmissionId: clientId,
      challengeId: "computer-components",
      result: { completed: true, elapsedMinutes: 3 },
    }),
  }, studentJar);
  assert.equal(res.response.status, 201);
  console.log("PASS: student submits stage 1");

  // --- Duplicate submission: idempotent ---
  res = await apiRequest("/api/student/attempts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientSubmissionId: clientId,
      challengeId: "computer-components",
      result: { completed: true, elapsedMinutes: 3 },
    }),
  }, studentJar);
  assert.equal(res.response.status, 200);
  assert.ok(res.body.duplicateResult?.passed);
  console.log("PASS: duplicate submission is idempotent");

  // --- Teacher: pause, student submit rejected ---
  await apiRequest(`/api/teacher/sessions/${sessionId}/pause`, { method: "POST" }, teacherJar);
  res = await apiRequest("/api/student/attempts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientSubmissionId: crypto.randomUUID(),
      challengeId: "computer-components",
      result: { completed: true, elapsedMinutes: 1 },
    }),
  }, studentJar);
  assert.equal(res.response.status, 409);
  assert.equal(res.body.error.code, "SESSION_PAUSED");
  console.log("PASS: paused session rejects submission");

  // --- Teacher: resume, end ---
  await apiRequest(`/api/teacher/sessions/${sessionId}/resume`, { method: "POST" }, teacherJar);
  res = await apiRequest(`/api/teacher/sessions/${sessionId}/end`, { method: "POST" }, teacherJar);
  assert.equal(res.body.session.status, "ended");
  assert.ok(res.body.report);
  console.log("PASS: teacher ends session, report generated");

  // --- Browser screenshots (student route) ---
  const studentPage = await login(studentContext, "qa101", "Student123!");
  await studentPage.waitForTimeout(2000);
  await studentPage.screenshot({ path: path.join(ARTIFACT_DIR, "classroom-student-route.png"), fullPage: true });
  const overflow = await studentPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(overflow, 0, "No horizontal overflow on student route");
  console.log("PASS: student route screenshot captured, no horizontal overflow");

  // --- Browser screenshots (teacher command center) ---
  const teacherPage = await login(teacherContext, TEACHER_USER, TEACHER_PASS);
  await teacherPage.click("text=教师看板");
  await teacherPage.waitForTimeout(2000);
  await teacherPage.screenshot({ path: path.join(ARTIFACT_DIR, "classroom-teacher-command-center.png"), fullPage: true });
  console.log("PASS: teacher command center screenshot captured");

  // --- Final: no page errors ---
  assert.deepEqual(pageErrors, [], "No unhandled page errors");
  console.log("PASS: zero page errors");

  console.log("\nAll classroom QA checks passed.");
} catch (err) {
  console.error("FAIL:", err.message);
  process.exit(1);
} finally {
  await browser.close();
}
