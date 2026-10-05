import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { openTeacherWorkspace, TEACHER_WORKSPACE } from "./lib/qaTeacherWorkspace.mjs";
import { selectTeacherClass } from "./helpers/select-teacher-class.mjs";
import { HARDWARE_GAME_CASES } from '../src/hardwareGame.js';
import { COURSEWARE } from '../src/courseware.js';

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

const emptyClassName=`空练习班 ${stamp}`;
await api('/api/classes',{method:'POST',headers:jsonHeaders,body:JSON.stringify({name:emptyClassName})});
await api('/api/auth/login',{method:'POST',headers:jsonHeaders,body:JSON.stringify({username:studentNo,password:'Student123!'})});
const savedPractice=await api(`/api/student/assembly-practice/${HARDWARE_GAME_CASES[0].id}`,{method:'PUT',headers:jsonHeaders,body:JSON.stringify({
  operationId:crypto.randomUUID(),baseRevision:0,document:{version:1,active:null,history:[{id:'teacher-browser-run',mode:'guided',fault:'power',completedAt:Date.now(),seconds:45,errorCount:1,hints:1,score:92,errors:['请先打开侧板']}]}
})});
assert.equal(savedPractice.status,200,'student fixture sync succeeds');
await api('/api/auth/login',{method:'POST',headers:jsonHeaders,body:JSON.stringify({username:teacherUsername,password:teacherPassword})});

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
  await page.locator('[data-login-role="teacher"]').click();
  await page.locator(".login-submit").click();
  await page.waitForLoadState("networkidle");

  // 开发服务器按需编译懒加载的看板 chunk，冷启动时可能明显变慢
  await page.locator(".teacher-studio").waitFor({ state: "visible", timeout: 60_000 });

  // 教师侧边栏必须能进入课程课件（本次修复的可发现性问题）
  const coursewareNav = page.locator(".topbar-nav .topbar-nav-item").filter({ hasText: "课程课件" });
  assert.equal(await coursewareNav.count(), 1, "teacher sidebar exposes the courseware entry");

  // 拆分后的各功能版块（教师看板为「教学活动 / 学情统计 → 子标签」结构）
  assert.equal(await page.locator(".teacher-studio-sidebar .teacher-class-select select").count(), 1, "class dropdown renders in its own sidebar");
  assert.equal(await selectTeacherClass(page, className), true, "class dropdown exposes the created class");

  await openTeacherWorkspace(page,TEACHER_WORKSPACE.statistics,'装机练习');
  const practice=page.getByRole('region',{name:'班级装机练习'});
  await expect(practice.locator('tbody tr')).toHaveCount(1);
  await expect(practice.locator('tbody')).toContainText('92');
  await practice.getByRole('button',{name:`查看${studentName}的练习复盘`}).click();
  const review=page.getByRole('region',{name:'学生装机练习复盘'});
  await expect(review).toContainText('请先打开侧板');
  await review.locator('summary').click();await expect(review).toContainText('用时 45 秒');
  await practice.getByRole('textbox',{name:'查找练习学生'}).fill('不存在的学生');
  await expect(practice.locator('tbody tr')).toHaveCount(0);
  await practice.getByRole('textbox',{name:'查找练习学生'}).fill('');
  await page.screenshot({path:path.join(artifactDir,'teacher-assembly-practice.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'practice narrow layout fits viewport');
  await page.screenshot({path:path.join(artifactDir,'teacher-assembly-practice-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1040});
  const practiceRoute=`**/api/teacher/classes/${classId}/assembly-practice`;
  await page.route(practiceRoute,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'测试读取失败'})}));
  await practice.getByRole('button',{name:'刷新练习记录',exact:true}).click();
  await expect(practice.getByRole('alert')).toContainText('读取失败');
  await page.unroute(practiceRoute);await practice.getByRole('button',{name:'刷新练习记录',exact:true}).click();
  await expect(practice.getByRole('alert')).toHaveCount(0);
  await selectTeacherClass(page,emptyClassName);await expect(practice).toContainText('没有符合条件的学生记录');
  await expect(page.getByRole('region',{name:'学生装机练习复盘'})).toHaveCount(0);
  await selectTeacherClass(page,className);await expect(practice.locator('tbody tr')).toHaveCount(1);
  console.log('teacher practice: summary, review, filtering, empty class, isolation, retry and mobile passed');

  // 学情洞察：指标卡 + 硬件汇总 + 课程地图
  await openTeacherWorkspace(page, TEACHER_WORKSPACE.statistics, TEACHER_WORKSPACE.insight);
  await page.locator(".teacher-studio-summary .metric-card").first().waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(await page.locator(".teacher-studio-summary .metric-card").count(), 4, "four class metric cards render");
  assert.equal(await page.locator(".hardware-teacher-summary").count(), 1, "hardware summary block renders");
  assert.equal(await page.locator(".teacher-quest-overview").count(), 1, "quest overview renders");

  // 学情分析助手
  await openTeacherWorkspace(page, TEACHER_WORKSPACE.statistics, TEACHER_WORKSPACE.assistant);
  assert.equal(await page.locator(".teacher-assistant-panel").count() >= 1, true, "assistant panel renders");

  // 学情明细：学生表与学生详情
  await openTeacherWorkspace(page, TEACHER_WORKSPACE.statistics, TEACHER_WORKSPACE.students);
  await page.locator(".teacher-student-table").getByText(studentName).waitFor({ state: "visible", timeout: 20_000 });

  await page.locator(".teacher-student-table .record-row").filter({ hasText: studentName })
    .getByRole("button", { name: "查看详情" }).click();
  await page.locator(".teacher-detail-panel").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator(".teacher-detail-panel").getByRole("button", { name: "关闭" }).click();

  // 刷新后必须重新挂上进行中的课堂，而不是退回"创建课堂任务"面板
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".teacher-studio").waitFor({ state: "visible", timeout: 30_000 });
  await selectTeacherClass(page, className);
  const commandCenter = page.locator(".classroom-command-center");
  await page.getByRole('button',{name:'课堂执行',exact:true}).click();
  await commandCenter.locator(".danger-button").first().waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(await commandCenter.getByText("创建课堂任务").count(), 0, "running session is reattached instead of showing the setup panel");

  // 手动刷新入口
  await page.locator('.teacher-dashboard-toolbar').getByRole("button", { name: "刷新",exact:true }).click();
  await openTeacherWorkspace(page, TEACHER_WORKSPACE.statistics, TEACHER_WORKSPACE.insight);
  await page.locator(".teacher-studio-summary .metric-card").first().waitFor({ state: "visible", timeout: 20_000 });

  // 个人设置中的课堂管理页：备份口令确认与学生导入。
  await page.locator(".profile-button").click();
  await page.getByRole("button", { name: "个人设置", exact: true }).click();
  const settings = page.getByRole("dialog");
  await expect(settings.getByRole("heading", { name: "个人设置", exact: true })).toBeVisible();
  await settings.getByRole("tab", { name: "课堂管理", exact: true }).click();
  await expect(settings.getByLabel("备份确认口令")).toBeVisible();
  await expect(settings.getByLabel("学生导入 CSV")).toBeVisible();
  await settings.getByRole("button", { name: "关闭", exact: true }).click();

  // 课件页：已配置的 AI 互动课件及章节切换。
  const lectureChapters = COURSEWARE.chapters.filter(chapter => chapter.embeds?.length);
  assert.ok(lectureChapters.length, "AI lecture chapters are configured");
  // 外部课件用固定响应隔离网络波动，仍检查真实配置的 iframe 地址。
  for (const origin of new Set(lectureChapters.flatMap(chapter => chapter.embeds.map(embed => new URL(embed.src).origin)))) {
    await page.route(`${origin}/**`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>AI lecture QA</title>' }));
  }
  await coursewareNav.click();
  const lecture = page.getByRole("region", { name: "AI 互动课件", exact: true });
  await expect(lecture).toBeVisible();
  const chapterNav = lecture.getByRole("navigation", { name: "选择 AI 课件章节" });
  await expect(chapterNav.getByRole("button")).toHaveCount(lectureChapters.length);
  for (const chapter of lectureChapters) {
    const chapterButton = chapterNav.getByRole("button", { name: chapter.title, exact: true });
    await chapterButton.click();
    await expect(chapterButton).toHaveAttribute("aria-pressed", "true");
    await expect(lecture.locator("iframe")).toHaveAttribute("src", chapter.embeds[0].src);
  }
  await expect(lecture.getByRole("button", { name: "全屏", exact: true })).toBeVisible();

  assert.deepEqual(pageErrors, [], "no uncaught page errors during teacher dashboard verification");
  await page.screenshot({ path: path.join(artifactDir, "teacher-dashboard-refactor.png"), fullPage: true });
  console.log("teacher dashboard verification passed");
} catch (error) {
  // 失败时把未捕获的前端异常打出来，否则只能看到一个超时
  console.error("teacher dashboard verification failed:", error?.message ?? error);
  console.error("uncaught page errors:", JSON.stringify(pageErrors, null, 2));
  console.error("console errors:", JSON.stringify(consoleErrors, null, 2));
  console.error("final state:", JSON.stringify(await page.evaluate(() => ({
    nav: [...document.querySelectorAll(".topbar-nav .topbar-nav-item")].map((el) => el.textContent.trim()),
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
