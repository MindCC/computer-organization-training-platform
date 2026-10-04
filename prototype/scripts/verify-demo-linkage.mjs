/**
 * 演示页 ↔ 平台学情联动 E2E 回归（2026-09-19）：
 * 登录 → 互动演示打开章节页 → 徽标已连接 → 答 5 题成批 → demo-attempts 入账
 * → report.md 含演示练习 → 学习记录面板可见 → 独立版 file:// 降级正常。
 *
 * 前置：API(8787) 与 Vite(5173) 已启动，演示班级已 seed。
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const BASE_URL = process.env.PROTOTYPE_APP_URL ?? process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";
const API_URL = process.env.PROTOTYPE_API_URL ?? process.env.QA_API_URL ?? "http://127.0.0.1:8787";
const ARTIFACT_DIR = fileURLToPath(new URL("../qa-artifacts/", import.meta.url));
mkdirSync(ARTIFACT_DIR, { recursive: true });

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
}

let browser;
try { browser = await chromium.launch({channel:"msedge",headless:true}); } catch { browser = await chromium.launch({headless:true}); }
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  // 1. 登录 → 课件「课堂互动演示」区有演示入口（新的讲演视图布局，演示卡直接可见）
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.locator("#login-username").fill("demo2026001");
  await page.locator("#login-password").fill("Student123!");
  await page.locator(".login-submit").click();
  await page.waitForSelector(".quest-student-home", { timeout: 15000 });
  await page.locator(".topbar-nav .topbar-nav-item", { hasText: "互动演示" }).click();
  await page.waitForSelector(".courseware-demo-grid", { timeout: 15000 });
  const demoLink = page.locator(".courseware-demo-card a[href='/demos/addressing.html']");
  check("互动演示页含寻址演示入口", await demoLink.count() === 1);

  // 2. 平台内打开演示页：徽标显示已连接学情
  await demoLink.click();
  const demoPage = page;
  await demoPage.waitForSelector(".hosted-demo-frame", { timeout: 15000 });
  const demoFrame = await (await demoPage.locator(".hosted-demo-frame").elementHandle()).contentFrame();
  await demoFrame.waitForSelector("#platform-link-badge", { timeout: 15000 });
  const badge = await demoFrame.locator("#platform-link-badge").innerText();
  check("演示页徽标显示已连接学情", badge.includes("已连接学情"), badge);

  // 3. 答 5 题（强制题型 + 全部答对）→ 成批提交
  await demoFrame.evaluate(() => { window.__forceQuizType = "eacalc"; });
  await demoFrame.locator('[data-mode="quiz"]').click();
  for (let i = 0; i < 5; i++) {
    const answer = await demoFrame.evaluate(() => window.__quizState.current.answer);
    await demoFrame.locator(`.quiz-choice[data-idx="${answer}"]`).click();
    await demoFrame.locator("#quizSubmit").click();
    await demoPage.waitForTimeout(150);
    await demoPage.keyboard.press("Enter"); // 下一题
    await demoPage.waitForTimeout(150);
  }
  await demoFrame.waitForFunction(() => document.querySelector("#platform-link-badge")?.textContent.includes("已存 1 批"));
  const badgeAfter = await demoFrame.locator("#platform-link-badge").innerText();
  check("徽标显示已存批次", badgeAfter.includes("已存 1 批"), badgeAfter);

  // 4. demo-attempts 汇总入账（走 API 直连校验）
  const apiResp = await page.request.get(`${API_URL}/api/student/demo-attempts`);
  const apiBody = await apiResp.json();
  const addressing = (apiBody.demos ?? []).find((d) => d.demoId === "addressing");
  check("demo-attempts 已入账（1 批 5 题全对）", Boolean(addressing) && addressing.batches >= 1 && addressing.totalCorrect >= 5, JSON.stringify(addressing ?? null));

  // 4b. 第三章运算器演示页同样联动（章节新增演示页须通过服务端白名单）
  const aluPage = await context.newPage();
  await aluPage.goto(`${BASE_URL}/demos/alu.html`, { waitUntil: "domcontentloaded" });
  await aluPage.waitForSelector(".hosted-demo-frame", { timeout: 15000 });
  const aluFrame = await (await aluPage.locator(".hosted-demo-frame").elementHandle()).contentFrame();
  await aluFrame.waitForSelector("#platform-link-badge", { timeout: 15000 });
  check("运算器演示页徽标已连接学情", (await aluFrame.locator("#platform-link-badge").innerText()).includes("已连接学情"));
  await aluFrame.evaluate(() => { window.__forceQuizType = "concept"; });
  await aluFrame.locator('[data-mode="quiz"]').click();
  for (let i = 0; i < 5; i++) {
    const answer = await aluFrame.evaluate(() => window.__quizState.current.answer);
    await aluFrame.locator(`.quiz-choice[data-idx="${answer}"]`).click();
    await aluFrame.locator("#quizSubmit").click();
    await aluPage.waitForTimeout(150);
    await aluPage.keyboard.press("Enter");
    await aluPage.waitForTimeout(150);
  }
  await aluFrame.waitForFunction(() => document.querySelector("#platform-link-badge")?.textContent.includes("已存 1 批"));
  const aluApi = await (await page.request.get(`${API_URL}/api/student/demo-attempts`)).json();
  const alu = (aluApi.demos ?? []).find((d) => d.demoId === "alu");
  check("运算器练习成绩入账 demo-attempts", Boolean(alu) && alu.batches >= 1 && alu.totalCorrect >= 5, JSON.stringify(alu ?? null));
  await aluPage.close();

  // 5. report.md 含课堂演示练习
  const reportResp = await page.request.get(`${API_URL}/api/student/report.md`);
  const reportText = await reportResp.text();
  check("report.md 含课堂演示练习章节", reportText.includes("课堂演示练习") && reportText.includes("指令系统与寻址方式"));

  // 6. 学习记录页显示演示练习面板
  await page.locator(".topbar-nav .topbar-nav-item", hasText => hasText).first().waitFor();
  await page.locator(".topbar-nav .topbar-nav-item", { hasText: "学习记录" }).click();
  await page.waitForSelector(".records-screen", { timeout: 15000 });
  const panel = page.locator("[data-testid='demo-practice-panel']");
  check("学习记录显示演示练习面板", await panel.count() === 1 && (await panel.innerText()).includes("指令系统与寻址方式"), await panel.count());
  await page.screenshot({ path: `${ARTIFACT_DIR}/demo-linkage.png`, fullPage: true });

  // 7. 独立版（file://）降级正常：徽标独立模式、无页面错误
  const standalone = await context.newPage();
  const errors = [];
  standalone.on("pageerror", (err) => errors.push(String(err)));
  const original = "E:/workspace/addressing-demo/index.html";
  const standalonePath = existsSync(original) ? original : fileURLToPath(new URL("../public/demos/addressing.html",import.meta.url));
  if (!existsSync(original)) console.log("原 E 盘文件不在当前环境，使用未修改的发布 HTML 验证独立文件模式。");
  await standalone.goto(pathToFileURL(standalonePath).href);
  await standalone.waitForSelector("#platform-link-badge", { timeout: 15000 });
  const standaloneBadge = await standalone.locator("#platform-link-badge").innerText();
  check("独立版徽标显示独立模式且无错误", standaloneBadge.includes("独立模式") && errors.length === 0, `${standaloneBadge} | errors=${errors.length}`);

  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
