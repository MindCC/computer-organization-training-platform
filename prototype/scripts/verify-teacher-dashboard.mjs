import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

/**
 * 教师看板定向回归：验证按功能拆分后的版块都能渲染，
 * 并覆盖"刷新后重新挂上进行中的课堂"与"教师可进入课程课件"两项修复。
 */

const baseUrl = process.env.PROTOTYPE_URL ?? "http://127.0.0.1:8787";
const apiUrl = process.env.PROTOTYPE_API_URL ?? baseUrl;
const teacherUsername = process.env.TEACHER_USERNAME ?? "teacher";
const teacherPassword = process.env.TEACHER_PASSWORD ?? "ChangeMe123!";
const artifactDir = process.env.QA_ARTIFACT_DIR
  ? path.resolve(process.env.QA_ARTIFACT_DIR)
  : path.resolve("qa-artifacts");

const stamp = Date.now();
const className = `教师看板校验班 ${stamp}`;
const studentNo = `dashboard-${stamp}`;
const studentName = "看板校验学生";
const jsonHeaders = { "content-type": "application/json" };

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

const jar = {};
async function api(pathname, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (jar.cookie) headers.cookie = jar.cookie;
  const response = await fetch(`${apiUrl}${pathname}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) jar.cookie = setCookie.split(";")[0];
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { status: response.status, body };
}

// ── 准备：一个班级、一名学生，以及一个进行中的课堂 ──
let result = await api("/api/auth/login", {
  method: "POST", headers: jsonHeaders, body: JSON.stringify({ username: teacherUsername, password: teacherPassword }),
});
assert.equal(result.status, 200, "teacher should be able to log in through the API");

const classId = (await api("/api/classes", {
  method: "POST", headers: jsonHeaders, body: JSON.stringify({ name: className }),
})).body.class.id;

await api(`/api/teacher/classes/${classId}/import-students`, {
  method: "POST", headers: jsonHeaders, body: JSON.stringify({ csv: `学号,姓名,初始密码\n${studentNo},${studentName},Student123!` }),
});

const session = (await api(`/api/teacher/classes/${classId}/sessions`, {
  method: "POST",
  headers: jsonHeaders,
  body: JSON.stringify({ templateKey: "computer-data-flow", durationMinutes: 45, passScore: 80, allowMakeup: false }),
})).body.session;
await api(`/api/teacher/sessions/${session.id}/start`, { method: "POST" });
const current = await api(`/api/teacher/classes/${classId}/sessions/current`);
assert.equal(current.status, 200, "current-session endpoint answers");
assert.equal(current.body.session?.id, session.id, "current-session endpoint returns the running session");

await mkdir(artifactDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text().slice(0, 800));
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  // 登录（首次进入可能是匿名落地页，需要先点登录入口）
  if (!(await page.locator("#login-username").isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "登录" }).first().click();
  }
  await page.locator("#login-username").fill(teacherUsername);
  await page.locator("#login-password").fill(teacherPassword);
  await page.locator(".login-submit").click();
  await page.waitForLoadState("networkidle");

  await page.locator(".teacher-studio").waitFor({ state: "visible", timeout: 15_000 });

  // 教师侧边栏必须能进入课程课件（本次修复的可发现性问题）
  const coursewareNav = page.locator(".sidebar-nav .nav-item").filter({ hasText: "课程课件" });
  assert.equal(await coursewareNav.count(), 1, "teacher sidebar exposes the courseware entry");

  // 拆分后的各功能版块
  assert.equal(await page.locator(".teacher-studio-sidebar .teacher-class").count() >= 1, true, "class list renders in its own sidebar");
  await page.locator(".teacher-class").filter({ hasText: className }).click();

  await page.locator(".teacher-studio-summary .metric-card").first().waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await page.locator(".teacher-studio-summary .metric-card").count(), 4, "four class metric cards render");
  assert.equal(await page.locator(".hardware-teacher-summary").count(), 1, "hardware summary block renders");
  assert.equal(await page.locator(".teacher-assistant-panel").count() >= 1, true, "assistant panel renders");
  assert.equal(await page.locator(".teacher-quest-overview").count(), 1, "quest overview renders");
  await page.locator(".teacher-student-table").getByText(studentName).waitFor({ state: "visible", timeout: 10_000 });

  // 学生详情面板
  await page.locator(".teacher-student-table .record-row").filter({ hasText: studentName })
    .getByRole("button", { name: "查看详情" }).click();
  await page.locator(".teacher-detail-panel").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(".teacher-detail-panel").getByRole("button", { name: "关闭" }).click();

  // 刷新后必须重新挂上进行中的课堂，而不是退回"创建课堂任务"面板
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".teacher-studio").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator(".teacher-class").filter({ hasText: className }).click();
  const commandCenter = page.locator(".classroom-command-center");
  await commandCenter.locator(".danger-button").first().waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await commandCenter.getByText("创建课堂任务").count(), 0, "running session is reattached instead of showing the setup panel");

  // 手动刷新入口
  await page.getByRole("button", { name: "立即刷新" }).click();
  await page.locator(".teacher-studio-summary .metric-card").first().waitFor({ state: "visible", timeout: 10_000 });

  // 课堂设置面板：备份改为二次口令确认，导入学生区块的初始口令清单可渲染
  const settingsButton = page.getByRole("button", { name: "课堂设置" });
  if (!(await settingsButton.isVisible().catch(() => false))) {
    await page.locator(".profile-button").click();
  }
  await settingsButton.click();
  await page.locator(".settings-overlay").waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await page.getByLabel("备份确认口令").count(), 1, "backup download asks for the account password");
  assert.equal(await page.getByLabel("学生导入 CSV").count(), 1, "student import block renders");
  await page.getByRole("button", { name: "关闭" }).click();

  // 课件页：教师可选发布班级并上传
  await coursewareNav.click();
  await page.locator(".courseware-view").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(".upload-courseware-panel").waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await page.getByLabel("选择发布课件的班级").count(), 1, "teacher can pick the publishing class on the courseware page");

  assert.deepEqual(pageErrors, [], "no uncaught page errors during teacher dashboard verification");
  await page.screenshot({ path: path.join(artifactDir, "teacher-dashboard-refactor.png"), fullPage: true });
  console.log("teacher dashboard verification passed");
} catch (error) {
  // 失败时把未捕获的前端异常打出来，否则只能看到一个超时
  console.error("teacher dashboard verification failed:", error?.message ?? error);
  console.error("uncaught page errors:", JSON.stringify(pageErrors, null, 2));
  console.error("console errors:", JSON.stringify(consoleErrors, null, 2));
  console.error("final state:", JSON.stringify(await page.evaluate(() => ({
    nav: [...document.querySelectorAll(".sidebar-nav .nav-item")].map((el) => el.textContent.trim()),
    bodyText: document.body.innerText.replace(/\s+/g, " ").slice(0, 300),
    viewSession: window.sessionStorage.getItem("zcyl:view-session"),
    teacherStudioCount: document.querySelectorAll(".teacher-studio").length,
    detailPanelCount: document.querySelectorAll(".teacher-detail-panel").length,
    studentDetailText: document.body.innerText.includes("学生详情"),
    recordRowCount: document.querySelectorAll(".teacher-student-table .record-row").length,
    viewDetailButtonCount: [...document.querySelectorAll(".teacher-student-table button")].filter((b) => b.textContent.includes("查看详情")).length,
  }))));
  await page.screenshot({ path: path.join(artifactDir, "teacher-dashboard-failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
