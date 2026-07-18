import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const APP_URL = process.env.PROTOTYPE_APP_URL ?? "http://127.0.0.1:5173";
const API_URL = process.env.PROTOTYPE_API_URL ?? "http://127.0.0.1:3001";
const ARTIFACT_DIR = process.env.QA_ARTIFACT_DIR ?? path.resolve("qa-artifacts");
const TEACHER_USER = process.env.TEACHER_USERNAME ?? "teacher";
const TEACHER_PASS = process.env.TEACHER_PASSWORD ?? "ChangeMe123!";
const STUDENT_USER = "qa101";
const STUDENT_PASS = "Student123!";
const TIMEOUT = 20_000;
const UI = {
  account: "\u8d26\u53f7",
  password: "\u5bc6\u7801",
  login: "\u767b\u5f55",
  dashboard: "\u6559\u5e08\u770b\u677f",
  create: "\u521b\u5efa\u8349\u7a3f",
  start: "\u5f00\u59cb\u8bfe\u5802",
  continue: "\u7ee7\u7eed\u4efb\u52a1",
  assembly: "\u5206\u6b65\u7ec4\u88c5",
  next: "\u4e0b\u4e00\u6b65 \u25b6",
  complete: "\u5b8c\u6210\u63a2\u7d22",
  pause: "\u6682\u505c",
  paused: "\u6559\u5e08\u5df2\u6682\u505c\u8bfe\u5802",
  resume: "\u6062\u590d",
  end: "\u7ed3\u675f\u8bfe\u5802",
  confirmEnd: "\u786e\u8ba4\u7ed3\u675f",
  report: "\u8bfe\u5802\u62a5\u544a",
  passed: "\u5b9e\u8bad\u901a\u8fc7",
  failed: "\u5b9e\u8bad\u672a\u901a\u8fc7",
};

function printed(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

async function apiRequest(requestPath, options = {}, jar = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (jar.cookie) headers.cookie = jar.cookie;
  const response = await fetch(API_URL + requestPath, { ...options, headers });
  const cookie = response.headers.get("set-cookie");
  if (cookie) jar.cookie = cookie.split(";")[0];
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, body };
}

async function requireApi(requestPath, options, jar, status) {
  const result = await apiRequest(requestPath, options, jar);
  assert.equal(result.response.status, status, `${requestPath}: ${printed(result.body)}`);
  return result.body;
}

function attachErrors(page, label, errors) {
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
}

async function login(context, username, password, label, errors) {
  const page = await context.newPage();
  attachErrors(page, label, errors);
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.getByLabel(UI.account, { exact: true }).fill(username);
  await page.getByLabel(UI.password, { exact: true }).fill(password);
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/auth/login")
      && response.request().method() === "POST",
    { timeout: TIMEOUT },
  );
  await page.getByRole("button", { name: UI.login, exact: true }).click();
  assert.equal((await responsePromise).status(), 200, `${label} UI login`);
  return page;
}

async function unique(locator, label) {
  await locator.first().waitFor({ state: "visible", timeout: TIMEOUT });
  const count = await locator.evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
  }).length);
  assert.equal(count, 1, `${label} has one visible target`);
  return locator.first();
}

async function click(locator, label) {
  await (await unique(locator, label)).click();
}

async function clickJson(page, locator, predicate, label) {
  const responsePromise = page.waitForResponse(predicate, { timeout: TIMEOUT });
  try {
    await click(locator, label);
  } catch (error) {
    responsePromise.catch(() => {});
    throw error;
  }
  const response = await responsePromise;
  const body = await response.json();
  assert.ok(response.ok(), `${label}: ${response.status()} ${printed(body)}`);
  return { response, body };
}

async function noOverflow(page, label) {
  const width = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.equal(width, 0, `${label} has no horizontal overflow`);
}

mkdirSync(ARTIFACT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
let teacherContext;
let studentContext;

try {
  teacherContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  studentContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });

  const teacherJar = {};
  await requireApi("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: TEACHER_USER, password: TEACHER_PASS }),
  }, teacherJar, 200);
  const classBody = await requireApi("/api/classes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "\u8bfe\u5802 QA \u771f\u5b9e\u754c\u9762\u73ed" }),
  }, teacherJar, 201);
  const classId = classBody.class.id;
  await requireApi(`/api/teacher/classes/${classId}/import-students`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ csv: `${STUDENT_USER},QA\u5b66\u751f,${STUDENT_PASS}` }),
  }, teacherJar, 200);

  const studentJar = {};
  await requireApi("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: STUDENT_USER, password: STUDENT_PASS }),
  }, studentJar, 200);
  console.log("PASS: deterministic setup");

  const teacherPage = await login(
    teacherContext, TEACHER_USER, TEACHER_PASS, "teacher", errors,
  );
  await click(
    teacherPage.getByRole("button", { name: UI.dashboard, exact: true }),
    "teacher dashboard",
  );
  const created = await clickJson(
    teacherPage,
    teacherPage.getByRole("button", { name: UI.create, exact: true }),
    (response) => response.url().endsWith(`/api/teacher/classes/${classId}/sessions`)
      && response.request().method() === "POST",
    "create draft",
  );
  const sessionId = created.body.session.id;
  const started = await clickJson(
    teacherPage,
    teacherPage.getByRole("button", { name: UI.start, exact: true }),
    (response) => response.url().endsWith(`/api/teacher/sessions/${sessionId}/start`)
      && response.request().method() === "POST",
    "start classroom",
  );
  assert.equal(started.body.session.status, "live");
  console.log("PASS: teacher creates and starts through UI");

  const studentPage = await login(
    studentContext, STUDENT_USER, STUDENT_PASS, "student", errors,
  );
  await unique(
    studentPage.getByRole("button", { name: UI.continue, exact: true }),
    "current mission",
  );
  await studentPage.screenshot({
    path: path.join(ARTIFACT_DIR, "classroom-student-route.png"),
    fullPage: true,
  });
  await noOverflow(studentPage, "student route");

  const entered = await clickJson(
    studentPage,
    studentPage.getByRole("button", { name: UI.continue, exact: true }),
    (response) => response.url().endsWith(`/api/student/classroom/${sessionId}/enter`)
      && response.request().method() === "POST",
    "enter mission",
  );
  assert.equal(entered.body.studentState.status, "in_progress");
  await click(
    studentPage.getByRole("button", { name: UI.assembly, exact: true }),
    "step assembly mode",
  );
  for (let step = 2; step <= 8; step += 1) {
    await click(
      studentPage.getByRole("button", { name: UI.next, exact: true }),
      `assembly step ${step}`,
    );
  }
  const submitted = await clickJson(
    studentPage,
    studentPage.getByRole("button", { name: UI.complete, exact: true }),
    (response) => response.url().endsWith("/api/student/attempts")
      && response.request().method() === "POST",
    "complete stage one",
  );
  assert.equal(submitted.response.status(), 201);
  assert.equal(submitted.body.classroomSession.current_stage_index, 1);
  const current = await requireApi("/api/student/classroom/current", {}, studentJar, 200);
  assert.equal(current.studentState.current_stage_index, 1);
  await unique(studentPage.getByText(/\u9636\u6bb5 2 \/ 4/), "stage two HUD");

  const canvas = studentPage.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: TIMEOUT });
  const canvasBox = await canvas.boundingBox();
  assert.ok(canvasBox && canvasBox.width >= 720, `canvas width ${canvasBox?.width ?? 0}px`);
  await studentPage.screenshot({
    path: path.join(ARTIFACT_DIR, "classroom-student-workbench.png"),
    fullPage: true,
  });
  await noOverflow(studentPage, "student workbench");
  console.log("PASS: student advances through UI");

  await teacherPage.bringToFront();
  await click(
    teacherPage.getByRole("button", { name: "\u5237\u65b0", exact: true }),
    "refresh overview",
  );
  await teacherPage.locator(".session-student-name", { hasText: "QA\u5b66\u751f" }).waitFor({
    state: "visible", timeout: TIMEOUT,
  });
  await teacherPage.screenshot({
    path: path.join(ARTIFACT_DIR, "classroom-teacher-command-center.png"),
    fullPage: true,
  });
  await noOverflow(teacherPage, "teacher command center");

  const paused = await clickJson(
    teacherPage,
    teacherPage.getByRole("button", { name: UI.pause, exact: true }),
    (response) => response.url().endsWith(`/api/teacher/sessions/${sessionId}/pause`)
      && response.request().method() === "POST",
    "pause classroom",
  );
  assert.equal(paused.body.session.status, "paused");
  await studentPage.bringToFront();
  await studentPage.getByText(UI.paused, { exact: true }).waitFor({
    state: "visible", timeout: TIMEOUT,
  });

  await teacherPage.bringToFront();
  const resumed = await clickJson(
    teacherPage,
    teacherPage.getByRole("button", { name: UI.resume, exact: true }),
    (response) => response.url().endsWith(`/api/teacher/sessions/${sessionId}/resume`)
      && response.request().method() === "POST",
    "resume classroom",
  );
  assert.equal(resumed.body.session.status, "live");
  await studentPage.bringToFront();
  await studentPage.getByText(UI.paused, { exact: true }).waitFor({
    state: "hidden", timeout: TIMEOUT,
  });
  console.log("PASS: pause and resume propagate to student UI");

  await teacherPage.bringToFront();
  await click(
    teacherPage.getByRole("button", { name: UI.end, exact: true }),
    "end classroom",
  );
  const ended = await clickJson(
    teacherPage,
    teacherPage.getByRole("button", { name: UI.confirmEnd, exact: true }),
    (response) => response.url().endsWith(`/api/teacher/sessions/${sessionId}/end`)
      && response.request().method() === "POST",
    "confirm end",
  );
  assert.equal(ended.body.session.status, "ended");
  assert.ok(ended.body.report);
  await teacherPage.getByText(UI.report, { exact: true }).waitFor({
    state: "visible", timeout: TIMEOUT,
  });
  const report = await requireApi(
    `/api/teacher/sessions/${sessionId}/report`, {}, teacherJar, 200,
  );
  assert.ok(report.report?.frozenAt);

  await studentPage.bringToFront();
  await studentPage.getByRole("heading", {
    name: new RegExp(`${UI.passed}|${UI.failed}`),
  }).waitFor({ state: "visible", timeout: TIMEOUT });
  await studentPage.screenshot({
    path: path.join(ARTIFACT_DIR, "classroom-student-settlement.png"),
    fullPage: true,
  });
  await noOverflow(studentPage, "student settlement");
  console.log("PASS: report and settlement render through UI");

  assert.deepEqual(errors, [], `page errors: ${errors.join(" | ")}`);
  console.log("PASS: zero page errors");
  console.log("\nAll classroom UI QA checks passed.");
} catch (error) {
  console.error("FAIL:", error.stack ?? error.message);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([teacherContext?.close(), studentContext?.close()]);
  await browser.close();
}
