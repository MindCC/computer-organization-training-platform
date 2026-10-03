/**
 * 课后作业「按章练习 + 知识星图」浏览器验收：
 * 1. 演示学生登录 → 课后作业 → 模式切换「按章练习 / 教师作业」都在；
 * 2. 按章练习：章节 Tab（8 章）→ 第三章有 10 题，每题带知识点 chip；
 * 3. 答一道单选题（与门 A=1,B=0 → 0）→ 提交判分 → 该题判对、显示解析与得分/掌握度；
 * 4. 判分结果写入 localStorage（前端本地持久化）；
 * 5. 打开知识星图 → 渲染 18 颗星 + 23 条依赖连线，状态着色类名存在；
 * 6. 点题目上的知识点 chip → 星图自动展开并高亮定位该知识点（前置/后续 chip 出现）；
 * 7. 教师作业板块原功能仍在（作业卡列表或空状态正常渲染）；
 * 8. 全程无页面错误。
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../package.json", import.meta.url));
const { chromium } = require("playwright");

const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition) });
  console.log(`${condition ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  // 登录演示学生（有 8 关学情：星图可呈现已完成/可做/未解锁混合着色）
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForSelector(".login-portal", { timeout: 10000 });
  await page.locator(".demo-login-button").click();
  await page.waitForSelector(".project-chapter-board", { timeout: 20000 });

  // 1. 进入课后作业
  await page.locator(".topbar-nav").getByRole("button", { name: "课后作业" }).click();
  await page.waitForSelector(".student-assignments", { timeout: 10000 });
  await page.waitForSelector(".assignment-mode-switch", { timeout: 10000 });
  check("模式切换存在（按章练习/教师作业）", await page.locator(".assignment-mode-switch .mode-tab").count() === 2);

  // 默认进入按章练习；题目应已渲染
  await page.waitForSelector(".practice-question", { timeout: 10000 });
  check("默认模式为「按章练习」且有题目", (await page.locator(".practice-question").count()) >= 5);

  // 2. 切到第三章（运算单元设计）
  await page.locator(".chapter-tab", { hasText: "第3章" }).click();
  await page.waitForTimeout(300);
  const ch3Questions = await page.locator(".practice-question").count();
  check("第三章题目数量在 5~10", ch3Questions >= 5 && ch3Questions <= 10, `${ch3Questions} 题`);
  const kpChipCount = await page.locator(".practice-question .kp-chip").count();
  check("每题都标注知识点 chip", kpChipCount === ch3Questions, `${kpChipCount}/${ch3Questions}`);

  // 3. 答一道单选题（ch3-q01 与门 A=1,B=0，正确答案 "0"）
  await page.locator('[data-qid="ch3-q01"] [data-option="0"]').click();
  await page.locator('[data-qid="ch3-q02"] [data-option="0"]').click(); // 故意答错，验证判分区分对错
  await page.locator(".practice-submit").click();
  await page.waitForSelector('[data-qid="ch3-q01"] .q-result', { timeout: 5000 });
  check(
    "答对的题判为正确并给分",
    await page.locator('[data-qid="ch3-q01"] .q-result.correct').isVisible(),
  );
  check(
    "答错的题判为错误并显示解析",
    await page.locator('[data-qid="ch3-q02"] .q-result.wrong').isVisible()
      && await page.locator('[data-qid="ch3-q02"] .q-analysis').isVisible(),
  );
  const summaryText = await page.locator(".practice-summary").innerText();
  check("显示得分与掌握度", /得分\s*\d+\s*\/\s*\d+/.test(summaryText) && /掌握度/.test(summaryText), summaryText.replace(/\s+/g, " ").slice(0, 60));

  // 4. 本地持久化
  const stored = await page.evaluate(() => localStorage.getItem("zcyl:chapter-practice-v1"));
  check("判分结果写入 localStorage", Boolean(stored && stored.includes("ch3-q01")));

  // 5. 打开知识星图
  await page.locator(".summary-actions .ghost-button", { hasText: "知识星图" }).click();
  await page.waitForSelector(".kg-svg", { timeout: 5000 });
  const starCount = await page.locator(".kg-node").count();
  check("知识星图渲染 18 颗星", starCount === 18, `${starCount} 颗`);
  const edgeCount = await page.locator(".kg-edge").count();
  check("依赖连线渲染 23 条", edgeCount === 23, `${edgeCount} 条`);
  check(
    "状态着色（已完成/进行中/可学习/未解锁类名）",
    (await page.locator(".kg-node.kg-completed").count()) > 0
      && (await page.locator(".kg-node.kg-locked").count()) > 0,
    `completed=${await page.locator(".kg-node.kg-completed").count()} locked=${await page.locator(".kg-node.kg-locked").count()}`,
  );

  // 6. 点题目 chip → 星图高亮定位 + 前置/后续
  await page.locator('[data-qid="ch3-q01"] .kp-chip').click();
  await page.waitForTimeout(400);
  check(
    "点 chip 后星图高亮定位该知识点",
    await page.locator('.kg-node.highlighted[data-kp-id="kp-and-gate"]').isVisible(),
  );
  const detail = page.locator('.kp-detail[data-kp-detail="kp-and-gate"]');
  check("知识点详情展开（含前置/后续知识点）", await detail.isVisible()
    && (await detail.locator(".kp-chip.prereq").count()) > 0
    && (await detail.locator(".kp-chip.dependent").count()) > 0,
    `前置 ${await detail.locator(".kp-chip.prereq").count()} 个 / 后续 ${await detail.locator(".kp-chip.dependent").count()} 个`);
  check("详情含相关关卡入口与练习题", await detail.locator(".kp-enter-btn").isVisible() && (await detail.locator(".kp-question-link").count()) > 0);

  // 7. 教师作业板块原功能仍在
  await page.locator(".assignment-mode-switch .mode-tab", { hasText: "教师作业" }).click();
  await page.waitForTimeout(1200);
  const teacherOk = (await page.locator(".assignment-cards .assignment-card").count()) > 0
    || (await page.locator(".assignment-cards .empty-state").count()) > 0;
  check("教师作业板块正常渲染", teacherOk);

  check("全程无页面错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));

  await browser.close();
} catch (error) {
  check(`脚本执行异常：${error.message}`, false);
  await browser.close().catch(() => {});
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n按章练习验收: ${passed}/${results.length} 通过`);
if (passed !== results.length) process.exit(1);
