import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { openChallengeFromHome } from "./lib/qaHome.mjs";
import { gotoApp } from "./lib/qaLogin.mjs";
import { openTeacherWorkspace, TEACHER_WORKSPACE } from "./lib/qaTeacherWorkspace.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { CIRCUIT_CHALLENGES } from "../src/circuit/challengeCircuitModel.js";
import { CHALLENGES } from "../src/platformLogic.js";

const text = {
  appTitle: "\u7ec4\u6210\u539f\u7406\u5b9e\u8bad\u5e73\u53f0",
  login: "\u767b\u5f55",
  teacherHeading: "教师数据页",
  className: "\u8ba1\u7ec4 UI Smoke \u73ed " + Date.now(),
  studentNo: "ui-smoke-" + Date.now(),
  studentName: "\u6d4b\u8bd5\u5b66\u751f",
  studentPassword: "Student123!",
  createClass: "\u521b\u5efa\u73ed\u7ea7",
  importStudents: "\u5bfc\u5165\u5b66\u751f",
  importTemplate: "\u4e0b\u8f7d\u5bfc\u5165\u6a21\u677f",
  classroomSettings: "\u8bfe\u5802\u8bbe\u7f6e",
  smartAssistant: "\u667a\u80fd\u52a9\u6559",
  generateAssistant: "\u751f\u6210 AI \u52a9\u6559\u5efa\u8bae",
  localFallback: "\u672c\u5730\u964d\u7ea7\u5efa\u8bae",
  deepseekGenerated: "DeepSeek \u751f\u6210",
  missingDeepseekKey: "DEEPSEEK_API_KEY \u672a\u914d\u7f6e",
  viewDetail: "\u67e5\u770b\u8be6\u60c5",
  studentDetail: "\u5b66\u751f\u8be6\u60c5",
  viewReference: "\u67e5\u770b\u53c2\u8003\u7ed3\u6784",
  fillReference: "\u586b\u5165\u53c2\u8003\u7ed3\u6784",
  casePanel: "\u7528\u4f8b\u5c55\u793a",
  liveDataFlow: "\u5b9e\u65f6\u6570\u636e\u6d41\u68c0\u6d4b",
  submit: "\u63d0\u4ea4\u68c0\u6d4b",
  passed: "\u672c\u5173\u901a\u8fc7",
  backHome: "\u8fd4\u56de\u8bfe\u7a0b\u9996\u9875",
  records: "\u5b66\u4e60\u8bb0\u5f55",
  hardwareGame: "\u786c\u4ef6\u914d\u7f6e\u6311\u6218",
  teacherHardwareSummary: "\u786c\u4ef6\u6311\u6218",
  submitPlan: "\u63d0\u4ea4\u65b9\u6848",
  goalReached: "\u5df2\u6ee1\u8db3\u5ba2\u6237\u76ee\u6807",
  recordsTitle: "\u4e2a\u4eba\u5b66\u60c5\u8bb0\u5f55",
  dataJourney: "\u6570\u636e\u65c5\u7a0b",
  journeyCheckpoint: "\u6570\u636e\u65c5\u7a0b\u68c0\u67e5\u70b9",
  pcToMar: "PC -> MAR",
  machineNumberQuiz: "\u673a\u5668\u6570\u5c0f\u6d4b",
  twosComplement: "\u8865\u7801",
  profile: "\u5b66\u4e60\u6863\u6848",
  logout: "\u9000\u51fa\u767b\u5f55",
};

const baseUrl = process.env.PROTOTYPE_URL ?? "http://127.0.0.1:8787";
const teacherUsername = process.env.TEACHER_USERNAME ?? "teacher";
const teacherPassword = process.env.TEACHER_PASSWORD ?? "ChangeMe123!";
const legacyOverviewChallenges = CHALLENGES.filter(
  (challenge) => !CIRCUIT_CHALLENGES.some((circuitChallenge) => circuitChallenge.id === challenge.id),
);
const defaultArtifactDirUrl = new URL("../qa-artifacts/", import.meta.url);
const artifactDir = process.env.QA_ARTIFACT_DIR ? path.resolve(process.env.QA_ARTIFACT_DIR) : fileURLToPath(defaultArtifactDirUrl);
const artifactDirUrl = new URL(`file:///${artifactDir.replace(/\\/g, "/")}${artifactDir.endsWith("\\") ? "" : "/"}`);
const visibleMojibakeTokens = ["\\u", "\uFFFD", "\u9286", "\u9205", "\u951B", "\u9422", "\u701B", "\u95AB", "\u59AF", "\u934F", "\u9366"];

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

await mkdir(artifactDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
await gotoApp(page, baseUrl);
await assertVisible(page, text.appTitle);
await assertVisible(page, "当前任务");
await page.getByRole("button", { name: "开始第一个实验" }).click();
await assertVisible(page, "装配知识，运行你的第一台计算机");
await assertVisible(page, "学生入口");
await assertVisible(page, "教师入口");
assert.equal(await page.locator(".login-portal").count(), 1);
assert.equal(await page.locator(".login-card").count(), 0);
await page.getByRole("button", { name: "先浏览课程" }).click();
await assertVisible(page, "当前任务");
await page.getByRole("button", { name: "登录" }).click();
await login(page, teacherUsername, teacherPassword);
await assertVisible(page, text.teacherHeading);
await assertNoVisibleMojibake(page, "teacher dashboard");
await openClassroomSettings(page);
const templateHref = await page.locator(".settings-template-link").getAttribute("href");
assert.match(templateHref ?? "", /^data:text\/csv/);
// 断言收敛到设置弹层内：「导入学生」这几个字也出现在看板空状态文案里，
// 用 getByText 会命中弹层背后的隐藏段落。
await page.locator(".settings-overlay").getByRole("button", { name: text.importStudents }).waitFor({ state: "visible", timeout: 30_000 });
await page.getByRole("button", { name: "\u5173\u95ed" }).click();
await page.screenshot({ path: artifactPath("teacher-empty.png"), fullPage: true });

await page.getByLabel("\u65b0\u73ed\u7ea7\u540d\u79f0").fill(text.className);
await page.getByRole("button", { name: text.createClass }).click();
await assertVisible(page, text.className);
await selectClass(page, text.className);
// 教师看板是「教学活动 / 学情统计 → 子标签」结构，智能助教在学情分析助手标签下
await openTeacherWorkspace(page, TEACHER_WORKSPACE.statistics, TEACHER_WORKSPACE.assistant);
await assertVisible(page, text.smartAssistant);
await page.getByRole("button", { name: text.generateAssistant }).click();
await assertAssistantReportGenerated(page);
assert.equal(await page.locator(".teacher-import-panel").count(), 0);
await openTeacherWorkspace(page, TEACHER_WORKSPACE.statistics, TEACHER_WORKSPACE.insight);
await assertVisible(page, "班级探索进度");
assert.equal(await page.locator(".teacher-quest-overview").count(), 1);
await openTeacherWorkspace(page, TEACHER_WORKSPACE.teaching);
await assertVisible(page, "首次开课");
assert.equal(await page.locator(".teacher-setup-checklist").count(), 1);
await openClassroomSettings(page);
await page.getByLabel("\u5b66\u751f\u5bfc\u5165 CSV").fill(`\u5b66\u53f7,\u59d3\u540d,\u521d\u59cb\u5bc6\u7801\n${text.studentNo},${text.studentName},${text.studentPassword}`);
await page.getByRole("button", { name: text.importStudents }).click();
await page.getByRole("button", { name: "\u5173\u95ed" }).click();
// 学生表与导出入口在「学情明细」标签下
await openTeacherWorkspace(page, TEACHER_WORKSPACE.statistics, TEACHER_WORKSPACE.students);
try {
  await page.locator(".teacher-student-table").getByText(text.studentName).waitFor({ state: "visible", timeout: 15_000 });
} catch {
  // 导入后学情快照可能还是旧的：手动刷新一次再断言
  await page.getByRole("button", { name: "立即刷新" }).click();
  await page.locator(".teacher-student-table").getByText(text.studentName).waitFor({ state: "visible", timeout: 30_000 });
}
await page.screenshot({ path: artifactPath("teacher-imported.png"), fullPage: true });
const csvText = await page.evaluate(async () => {
  const response = await fetch(document.querySelector('a[href$="/export.csv"]').href, { credentials: "include" });
  return response.text();
});
assert.match(csvText, new RegExp(text.studentNo));
assert.match(csvText, new RegExp(text.studentName));

await logout(page);
await login(page, text.studentNo, text.studentPassword);
await assertVisible(page, "当前任务");
await page.locator(".project-chapter-board").waitFor({ state: "visible", timeout: 10_000 });
await assertNoVisibleMojibake(page, "student home");
assert.equal(await page.locator(".project-chapter").count() > 0, true, "course chapters are visible on the student home");
assert.equal(await page.locator(".quest-primary-action").count(), 1, "exactly one primary quest action");
await assertVisible(page, "新手上路");
await assertVisible(page, "跳过引导");
await assertVisible(page, "完成率");
assert.equal(await page.locator(".quest-hero-stats .metric-card").count(), 4, "student overview uses four shared metric cards");
await assertVisible(page, "学习状态");
const lockedCard = page.locator(".route-card.locked").first();
if (await lockedCard.isVisible().catch(() => false)) {
  assert.equal(await lockedCard.isDisabled(), true, "locked challenge card must not be enterable");
}
await page.locator(".sidebar-nav .nav-item").filter({ hasText: "\u9519\u9898\u672c" }).click();
await page.locator(".mistakes-layout").waitFor({ state: "visible", timeout: 10_000 });
await page.locator(".sidebar-nav .nav-item").filter({ hasText: "\u8bfe\u540e\u4f5c\u4e1a" }).click();
await page.locator(".student-assignments").waitFor({ state: "visible", timeout: 10_000 });
await page.locator(".sidebar-nav .nav-item").filter({ hasText: "\u8bfe\u7a0b\u8bfe\u4ef6" }).click();
await page.locator(".courseware-view").waitFor({ state: "visible", timeout: 10_000 });
await page.locator(".sidebar-nav .nav-item").filter({ hasText: "学习笔记" }).click();
await page.getByLabel("笔记内容").fill("3D 与总线关系复盘");
await page.getByRole("button", { name: "保存笔记" }).click();
await assertVisible(page, "3D 与总线关系复盘");
await page.locator(".sidebar-nav .nav-item").filter({ hasText: "\u8bfe\u7a0b\u9996\u9875" }).click();
await openChallenge(page, "\u8ba4\u8bc6\u8ba1\u7b97\u673a\u4e94\u5927\u90e8\u4ef6");
await page.getByRole("button", { name: "\u6253\u5f00\u4e2a\u4eba\u8bbe\u7f6e" }).click();
await page.locator(".settings-overlay").waitFor({ state: "visible", timeout: 10_000 });
await page.getByRole("button", { name: "\u5173\u95ed" }).click();
await assertVisible(page, "\u5206\u6b65\u7ec4\u88c5");
await page.getByRole("button", { name: "\u5206\u6b65\u7ec4\u88c5" }).click();
for (let step = 1; step < 8; step += 1) {
  await page.locator(".exploded-stepbar").getByRole("button", { name: "\u4e0b\u4e00\u6b65" }).click();
}
const overviewAttemptPromise = waitForAttemptResponse(page);
await page.getByRole("button", { name: "\u5b8c\u6210\u63a2\u7d22" }).click();
await assertAttemptSaved(await overviewAttemptPromise, "computer-components");
await page.locator(".quest-settlement").waitFor({ state: "visible", timeout: 10_000 });
assert.equal(await page.locator(".quest-settlement-card").count(), 1, "settlement card present after first pass");
await assertVisible(page, "评测结算");
await assertVisible(page, "继续下一关");
await dismissQuestSettlementIfPresent(page);
await page.getByRole("button", { name: "\u5df2\u5b8c\u6210\u63a2\u7d22" }).waitFor({ state: "visible", timeout: 10_000 });
await dismissQuestSettlementNow(page);
await page.getByRole("button", { name: new RegExp(text.backHome) }).click();
await assertVisible(page, "当前任务");

await dismissQuestSettlementNow(page);
await page.locator(".sidebar-nav .nav-item").filter({ hasText: "课程首页" }).click();
await assertVisible(page, "当前任务");


for (const challenge of legacyOverviewChallenges) {
  await openChallenge(page, challenge.title);
  await verifyLegacyChallenge(page, challenge);
  await page.screenshot({ path: artifactPath(`student-lab-${challenge.id}.png`), fullPage: true });
  await dismissQuestSettlementNow(page);
  await page.getByRole("button", { name: new RegExp(text.backHome) }).click();
}

for (const challenge of CIRCUIT_CHALLENGES.filter((item) => item.id !== "computer-components")) {
  console.log(`Verifying React Flow lab: ${challenge.id}`);
  await openChallenge(page, challenge.title);
  await verifyReactFlowChallenge(page, challenge);
  await assertNoVisibleMojibake(page, `react-flow lab ${challenge.id}`);
  await page.screenshot({ path: artifactPath(`student-lab-${challenge.id}.png`), fullPage: true });
  await dismissQuestSettlementNow(page);
  await page.getByRole("button", { name: new RegExp(text.backHome) }).click();
}

await openHardwareGame(page);
await page.locator(".assembly-workshop").waitFor({ state: "visible", timeout: 10_000 });
assert.equal(await page.locator(".assembly-part-tabs button").count(), 4, "workshop exposes four assembly categories");
await page.locator('.assembly-workshop canvas[data-model-source="blender-glb"]').waitFor({ state: "visible", timeout: 20_000 });
assert.equal(await page.locator(".assembly-workshop canvas").count(), 1, "hardware challenge renders the modeled 3D workbench");
assert.equal(await page.locator(".profile-menu").count(), 0, "profile menu closes before entering the hardware workbench");
await page.getByRole('button', { name: '打开侧板', exact: true }).click();
await page.getByRole('button', { name: '固定主板', exact: true }).click();
await page.getByRole('button', { name: '固定电源', exact: true }).click();
await page.locator('.assembly-part-tabs button').filter({ hasText: '内存' }).click();
await page.locator('#assembly-variant').selectOption('mem-16');
assert.equal(await page.locator('#assembly-variant').inputValue(), 'mem-16');
await page.getByRole('button', { name: '安装到DIMM 插槽', exact: true }).last().click();
await page.locator('.assembly-part-tabs button').filter({ hasText: '处理器' }).click();
await page.getByRole('button', { name: '安装到CPU 插座', exact: true }).last().click();
await page.locator('.assembly-part-tabs button').filter({ hasText: '硬盘' }).click();
await page.getByRole('button', { name: '安装到硬盘托架', exact: true }).last().click();
await page.getByRole('button', { name: '固定CPU 散热器', exact: true }).click();
for (const [from,to] of [['psu-atx','board-atx'],['psu-cpu','cpu-power'],['cooler-fan','cpu-fan'],['ssd-data','board-sata'],['psu-sata','ssd-power']]) {
  await page.getByRole('combobox', { name: '线缆端', exact: true }).selectOption(from);
  await page.getByRole('combobox', { name: '目标接口', exact: true }).selectOption(to);
  await page.getByRole('button', { name: '连接接口', exact: true }).click();
}
await page.getByRole('button', { name: '开机自检', exact: true }).click();
await page.getByRole('button', { name: '交付装机 · 提交方案' }).waitFor({ state: 'visible' });
await page.screenshot({ path: artifactPath("precision-workshop-desktop.png"), fullPage: true });

await assertVisible(page, text.hardwareGame);
await assertVisible(page, "\u7535\u8111\u88c5\u673a\u5e97\u7ecf\u8425\u6311\u6218");
await assertVisible(page, "\u5ba2\u6237\u6ee1\u610f\u5ea6");
await assertVisible(page, "\u7ecf\u8425\u5229\u6da6");
const hardwareAttemptPromise = waitForAttemptResponse(page);
await page.getByRole("button", { name: '交付装机 · 提交方案' }).click();
await assertAttemptSaved(await hardwareAttemptPromise, "game-office-pc");
await dismissQuestSettlementIfPresent(page);
await assertVisible(page, text.goalReached);
await page.screenshot({ path: artifactPath("student-hardware-game.png"), fullPage: true });

await dismissQuestSettlementNow(page);
await openRecords(page);
await assertVisible(page, text.recordsTitle);
await page.locator(".record-table .record-row").filter({ hasText: "\u7a0b\u5e8f\u8fd0\u884c\u8def\u7ebf" }).click();
await page.locator(".circuit-flow-workbench").waitFor({ state: "visible", timeout: 10_000 });
await page.getByRole("button", { name: new RegExp(text.backHome) }).click();
await openRecords(page);
await assertVisible(page, text.recordsTitle);
await page.reload({ waitUntil: "networkidle" });
await openRecords(page);
await assertVisible(page, text.recordsTitle);
await page.screenshot({ path: artifactPath("student-records-after-refresh.png"), fullPage: true });

await logout(page);
await login(page, teacherUsername, teacherPassword);
await assertVisible(page, text.teacherHeading);
await selectClass(page, text.className);
// 重新登录后看板回到「教学活动」：硬件挑战汇总在「学情洞察」，学生表在「学情明细」。
await openTeacherWorkspace(page, TEACHER_WORKSPACE.statistics, TEACHER_WORKSPACE.insight);
await assertVisible(page, text.teacherHardwareSummary);
await openTeacherWorkspace(page, TEACHER_WORKSPACE.statistics, TEACHER_WORKSPACE.students);
await assertVisible(page, text.studentName);
await page.locator(".teacher-student-table .record-row").filter({ hasText: text.studentName }).last().getByRole("button", { name: text.viewDetail }).click();
const detailPanel = page.locator(".teacher-detail-panel");
await detailPanel.waitFor({ state: "visible", timeout: 10_000 });
await detailPanel.getByText(text.studentDetail).waitFor({ state: "visible", timeout: 10_000 });
await detailPanel.getByText("\u9010\u5173\u6700\u4f73\u6210\u7ee9").waitFor({ state: "visible", timeout: 10_000 });
await detailPanel.getByText("\u6700\u8fd1\u63d0\u4ea4").waitFor({ state: "visible", timeout: 10_000 });
await page.screenshot({ path: artifactPath("teacher-overview-after-student.png"), fullPage: true });

await page.setViewportSize({ width: 390, height: 900 });
await page.goto(baseUrl, { waitUntil: "networkidle" });
await assertVisible(page, text.teacherHeading);
await page.screenshot({ path: artifactPath("mobile-teacher.png"), fullPage: true });
assert.equal(await page.locator(".sidebar-nav").evaluate((node) => getComputedStyle(node).position), "fixed", "mobile navigation stays reachable at the bottom");
assert.equal(await page.locator(".sidebar-nav").evaluate((node) => getComputedStyle(node).scrollbarWidth), "none", "mobile navigation hides its horizontal scrollbar");
const mobileOverflow = await page.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
  elements: [...document.querySelectorAll("body *")]
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { selector: `${element.tagName.toLowerCase()}.${element.className || ""}`, left: rect.left, right: rect.right, width: rect.width };
    })
    .filter((item) => item.left < -1 || item.right > document.documentElement.clientWidth + 1)
    .sort((left, right) => right.width - left.width)
    .slice(0, 12),
}));
assert.equal(mobileOverflow.scrollWidth <= mobileOverflow.clientWidth, true, `mobile layout must not overflow horizontally: ${JSON.stringify(mobileOverflow)}`);

assert.deepEqual(pageErrors, [], "UI smoke must not emit page errors");
console.log("UI smoke check passed");
} finally {
  await browser.close();
}

async function openClassroomSettings(targetPage) {
  const settingsButton = targetPage.getByRole("button", { name: text.classroomSettings });
  if (!(await settingsButton.isVisible().catch(() => false))) {
    await targetPage.locator(".profile-button").click();
  }
  await settingsButton.click();
}

async function login(targetPage, username, password) {
  // 退出登录后应用会回到匿名落地页，需要先进入登录表单；
  // 输入框按 id 定位，避免依赖会随登录身份变化的 aria-label 文案。
  if (!(await targetPage.locator("#login-username").isVisible().catch(() => false))) {
    const entry = targetPage.getByRole("button", { name: text.login }).first();
    if (await entry.isVisible().catch(() => false)) {
      await entry.click();
      await targetPage.waitForLoadState("networkidle");
    }
  }
  await targetPage.locator("#login-username").fill(username);
  await targetPage.locator("#login-password").fill(password);
  await targetPage.locator(".login-submit").click();
  await targetPage.waitForLoadState("networkidle");
}

async function logout(targetPage) {
  const logoutButton = targetPage.getByRole("button", { name: text.logout });
  if (!(await logoutButton.isVisible().catch(() => false))) {
    await targetPage.locator(".profile-button").click();
  }
  await logoutButton.click();
  try {
    await assertVisible(targetPage, text.login);
  } catch (error) {
    console.error("LOGOUT DEBUG url:", targetPage.url());
    const html = await targetPage.content().catch(() => "<unavailable>");
    console.error("LOGOUT DEBUG html len:", html.length);
    const bodyInfo = await targetPage.evaluate(() => {
      const body = document.body;
      const root = document.querySelector("#root");
      return {
        bodyDisplay: getComputedStyle(body).display,
        bodyVisibility: getComputedStyle(body).visibility,
        rootChildCount: root ? root.childElementCount : -1,
        rootTextLen: root ? root.textContent.length : -1,
        bodyClass: body.className,
        readyState: document.readyState,
      };
    }).catch((e) => ({ error: String(e) }));
    console.error("LOGOUT DEBUG bodyInfo:", JSON.stringify(bodyInfo));
    await targetPage.screenshot({ path: artifactPath("logout-debug.png") }).catch(() => {});
    throw error;
  }
}

async function openChallenge(targetPage, title) {
  await dismissQuestSettlementNow(targetPage);
  // 首页按章节折叠，且顶栏也有含关卡标题的按钮：统一用共享助手定位真正的关卡入口。
  await openChallengeFromHome(targetPage, title);
  await assertVisible(targetPage, title);
}

async function openRecords(targetPage) {
  await targetPage.locator(".sidebar-nav .nav-item").filter({ hasText: text.records }).click();
}

async function openHardwareGame(targetPage) {
  await targetPage.locator(".sidebar-nav .nav-item").filter({ hasText: text.hardwareGame }).click();
}

async function selectClass(targetPage, className) {
  const classButton = targetPage.locator(".teacher-class").filter({ hasText: className }).last();
  await classButton.waitFor({ state: "visible", timeout: 10_000 });
  await classButton.click();
}

async function assertAssistantReportGenerated(targetPage) {
  await targetPage.waitForFunction(
    ({ fallbackText, aiText }) => document.body.innerText.includes(fallbackText) || document.body.innerText.includes(aiText),
    { fallbackText: text.localFallback, aiText: text.deepseekGenerated },
  );

  const fallbackVisible = await targetPage.getByText(text.localFallback, { exact: false }).first().isVisible().catch(() => false);
  if (fallbackVisible) {
    await assertVisible(targetPage, text.missingDeepseekKey);
  }
}

async function verifyLegacyChallenge(targetPage, challenge) {
  await assertVisible(targetPage, challenge.title);
  await targetPage.getByRole("button", { name: text.viewReference }).first().click();
  await targetPage.getByRole("button", { name: text.submit }).first().click();
  await assertVisible(targetPage, text.passed);
  await dismissQuestSettlementIfPresent(targetPage);
}

// Quest 评测结算层会在每次通过的提交后异步出现,延迟可达数秒(常在导航时渲染);
// 等待其出现后关闭,避免全屏拦截后续点击。
async function dismissQuestSettlementIfPresent(targetPage) {
  const settlement = targetPage.locator(".quest-settlement");
  try {
    await settlement.waitFor({ state: "visible", timeout: 12_000 });
  } catch {
    return; // 未出现结算层
  }
  await clickQuestSettlementDismiss(targetPage);
  await settlement.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
}

// 快速清理:结算层已存在时立刻关闭(不等待),用于导航点击前的安全网。
async function dismissQuestSettlementNow(targetPage) {
  const settlement = targetPage.locator(".quest-settlement");
  if (!(await settlement.isVisible().catch(() => false))) return;
  await clickQuestSettlementDismiss(targetPage);
  await settlement.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
}

// 用 DOM 直接点击"复盘本关",绕过 GSAP 卡片动画可能导致的 actionability 等待。
async function clickQuestSettlementDismiss(targetPage) {
  await targetPage.evaluate(() => {
    const button = [...document.querySelectorAll(".quest-settlement button")]
      .find((node) => node.textContent.includes("复盘本关"));
    button?.click();
  });
}

async function verifyReactFlowChallenge(targetPage, challenge) {
  const workbench = targetPage.locator(".circuit-flow-workbench");
  await targetPage.getByTestId("react-flow-circuit-canvas").waitFor({ state: "visible", timeout: 10_000 });
  await workbench.getByText(challenge.title).first().waitFor({ state: "visible", timeout: 10_000 });
  await workbench.getByText(text.casePanel).waitFor({ state: "visible", timeout: 10_000 });
  await targetPage.getByText(text.liveDataFlow).first().waitFor({ state: "visible", timeout: 10_000 });
  await waitForReactFlowNodeCount(targetPage, challenge);
  if (challenge.id === "data-flow") {
    await dragRequiredEdge(targetPage, challenge.requiredEdges[0]);
    await targetPage.waitForFunction(() => document.querySelectorAll(".react-flow__edge").length >= 1);
    await workbench.locator(".circuit-flow-edge-signal").first().waitFor({ state: "visible", timeout: 10_000 });
    await workbench.getByRole("button", { name: "\u91cd\u7f6e" }).click();
  }
  if (challenge.id === "instruction-data") {
    await assertVisible(targetPage, text.journeyCheckpoint);
    await assertVisible(targetPage, text.pcToMar);
    const cpuPanel = targetPage.locator(".cpu-execution-panel");
    await cpuPanel.waitFor({ state: "visible", timeout: 10_000 });
    const microStep = cpuPanel.getByRole("button", { name: "微步", exact: true });
    await microStep.waitFor({ state: "visible", timeout: 10_000 });
    await targetPage.waitForFunction(() => ![...document.querySelectorAll(".cpu-execution-panel button")].some((button) => button.textContent.includes("微步") && button.disabled));
    const savedPractice = targetPage.waitForResponse((response) => response.url().endsWith("/api/student/cpu-practice/events") && response.request().method() === "POST");
    await microStep.click();
    const savedPracticeResponse = await savedPractice;
    assert.equal(savedPracticeResponse.status(), 200, `CPU public-practice event should persist: ${await savedPracticeResponse.text()}`);
    await targetPage.reload({ waitUntil: "networkidle" });
    await cpuPanel.waitFor({ state: "visible", timeout: 10_000 });
    await assertVisible(targetPage, "已恢复上次公共练习");
  }
  if (challenge.id === "memory-address") {
    await assertVisible(targetPage, "简化存储系统");
    await assertVisible(targetPage, "地址译码");
    await assertVisible(targetPage, "控制总线");
    await assertVisible(targetPage, "\u5730\u5740\u5bc4\u5b58\u5668MAR");
    await assertVisible(targetPage, "\u4e3b\u5b58\u5355\u5143");
    await assertVisible(targetPage, "\u6570\u636e\u5bc4\u5b58\u5668MDR");
    await assertVisible(targetPage, "CPU\u6570\u636e\u603b\u7ebf");
  }
  if (challenge.id === "machine-number") {
    await assertVisible(targetPage, text.machineNumberQuiz);
    await assertVisible(targetPage, text.twosComplement);
    await assertVisible(targetPage, "1011");
  }
  await workbench.getByRole("button", { name: text.fillReference }).click();
  await targetPage.waitForFunction(
    ({ expectedEdges }) => document.querySelectorAll(".react-flow__edge").length >= expectedEdges,
    { expectedEdges: challenge.requiredEdges.length },
  );
  const attemptPromise = waitForAttemptResponse(targetPage);
  await workbench.getByRole("button", { name: text.submit }).click();
  await assertAttemptSaved(await attemptPromise, challenge.id);
  const report = workbench.locator(".circuit-flow-report");
  await report.waitFor({ state: "visible", timeout: 10_000 });
  const reportText = await report.innerText();
  assert.match(reportText, /本关通过/, `${challenge.id} report: ${reportText}`);
  await dismissQuestSettlementIfPresent(targetPage);
}

async function waitForReactFlowNodeCount(targetPage, challenge) {
  const deadline = Date.now() + 30_000;
  let nodeCount = 0;
  while (Date.now() < deadline) {
    nodeCount = await targetPage.locator(".react-flow__node").count();
    if (nodeCount >= challenge.nodes.length) return;
    await targetPage.waitForTimeout(250);
  }
  const bodyText = await targetPage.locator("body").innerText();
  throw new Error(`${challenge.id} expected ${challenge.nodes.length} React Flow nodes, saw ${nodeCount}. Text: ${bodyText.slice(0, 1200)}`);
}
function waitForAttemptResponse(targetPage) {
  return targetPage.waitForResponse(
    (response) => response.url().endsWith("/api/student/attempts")
      && response.request().method() === "POST",
    { timeout: 10_000 },
  );
}

async function assertAttemptSaved(response, challengeId) {
  const status = response.status();
  const body = await response.text();
  assert.equal(
    status,
    201,
    `${challengeId} attempt was not saved: HTTP ${status} ${body}`,
  );
}


async function dragRequiredEdge(targetPage, edge) {
  const source = targetPage.getByTestId(`port-${edge.from.nodeId}-${edge.from.portId}`);
  const target = targetPage.getByTestId(`port-${edge.to.nodeId}-${edge.to.portId}`);
  await source.waitFor({ state: "visible", timeout: 10_000 });
  await target.waitFor({ state: "visible", timeout: 10_000 });

  await source.dragTo(target, { force: true, timeout: 10_000 }).catch(async () => {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    assert.ok(sourceBox, "source port is visible");
    assert.ok(targetBox, "target port is visible");
    await targetPage.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await targetPage.mouse.down();
    await targetPage.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 24 });
    await targetPage.mouse.up();
  });
}

async function assertNoVisibleMojibake(targetPage, label) {
  const visibleText = await targetPage.locator("body").innerText({ timeout: 10_000 });
  const match = visibleMojibakeTokens.find((token) => visibleText.includes(token)) ?? null;
  const matchIndex = match ? visibleText.indexOf(match) : -1;
  const context = matchIndex >= 0 ? visibleText.slice(Math.max(0, matchIndex - 80), matchIndex + 160) : "";
  assert.equal(match, null, `${label} contains visible mojibake: ${match ?? ""} context=${context}`);
}

async function assertVisible(targetPage, visibleText) {
  // 同一段文案在页面里可能出现多次（弹层背后的看板、空状态提示等），
  // getByText().first() 会命中隐藏的那一个；断言应针对"可见的那一个"。
  const locator = targetPage.getByText(visibleText, { exact: false }).filter({ visible: true }).first();
  try {
    // 开发服务器按需编译：懒加载的页面 chunk 在冷启动或机器繁忙时可能超过 10 秒，
    // 过紧的等待会把"还在加载"误判成"页面错误"。
    await locator.waitFor({ state: "visible", timeout: 30_000 });
    assert.equal(await locator.isVisible(), true);
  } catch (error) {
    const bodyText = await targetPage.locator("body").innerText().catch(() => "<body unavailable>");
    const runtimeErrors = pageErrors.length > 0 ? pageErrors.join(" | ") : "none";
    const loginFormDiagnostic = await targetPage.locator(".login-form-panel").evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        connected: element.isConnected,
        inlineStyle: element.getAttribute("style"),
        display: style.display,
        opacity: style.opacity,
        visibility: style.visibility,
        transform: style.transform,
      };
    }).catch(() => null);
    throw new Error(
      `Expected visible text ${JSON.stringify(visibleText)}. Runtime errors: ${runtimeErrors}. Login form: ${JSON.stringify(loginFormDiagnostic)}. Body: ${bodyText.slice(0, 2000)}`,
      { cause: error },
    );
  }
}

function artifactPath(fileName) {
  return fileURLToPath(new URL(fileName, artifactDirUrl));
}
