/**
 * 课后作业「按章练习 + 课程知识图谱」浏览器验收：
 * 1. 演示学生登录 → 课后作业 → 模式切换「按章练习 / 教师作业」都在；
 * 2. 按章练习：章节 Tab（8 章）→ 第三章题量与真实题库一致，每题带知识点 chip；
 * 3. 答一道单选题（与门 A=1,B=0 → 0）→ 提交判分 → 该题判对、显示解析与得分/掌握度；
 * 4. 判分结果同步账户并缓存到按用户隔离的存储；
 * 5. 打开课程知识图谱 → 第三章真实概念与关系，实验记录不冒充概念解锁；
 * 6. 点题目上的知识点 chip → 高亮定位对应课程概念（前置/后续 chip 出现）；
 * 7. 教师作业板块原功能仍在（作业卡列表或空状态正常渲染）；
 * 8. 全程无页面错误。
 */
import { createRequire } from "node:module";
import { questionOf, questionsForChapter } from "../src/assignmentQuestions.js";
import { knowledgeEvidenceOf, knowledgePointsByChapter, layoutKnowledgeGraph } from "../src/knowledgePoints.js";

const require = createRequire(new URL("../package.json", import.meta.url));
const { chromium } = require("playwright");

const BASE_URL = process.env.PROTOTYPE_APP_URL ?? process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";

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

  // 登录演示学生，图谱展示实际相关实验记录，课程概念始终可浏览
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForSelector(".login-portal", { timeout: 10000 });
  await page.locator(".demo-login-button").click();
  await page.waitForSelector(".topbar-nav", { timeout: 20000 });

  // 1. 进入课后作业
  await page.locator(".topbar-nav").getByRole("button", { name: "课后作业" }).click();
  await page.waitForSelector(".student-assignments", { timeout: 10000 });
  await page.waitForSelector(".assignment-mode-switch", { timeout: 10000 });
  check("模式切换存在（按章练习/教师作业）", await page.locator(".assignment-mode-switch .mode-tab").count() === 2);

  // 默认进入按章练习；题目应已渲染
  await page.waitForSelector(".practice-question", { timeout: 10000 });
  check("默认模式为「按章练习」且有题目", (await page.locator(".practice-question").count()) >= 5);
  check("提交并判分位于最后一道题之后", await page.locator('.chapter-practice').evaluate(root => {
    const lastQuestion = root.querySelector('.practice-question:last-child');
    const submit = root.querySelector('.practice-submit');
    return Boolean(lastQuestion && submit && (lastQuestion.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING));
  }));

  // 2. 切到第三章（运算单元设计）
  await page.locator(".chapter-tab", { hasText: "第3章" }).click();
  await page.waitForTimeout(300);
  const ch3Questions = await page.locator(".practice-question").count();
  check("第三章题目数量与课程题库一致", ch3Questions === questionsForChapter("ch3").length, `${ch3Questions} 题`);
  const kpChipCount = await page.locator(".practice-question .kp-chip").count();
  const allQuestionsTagged = await page.locator(".practice-question").evaluateAll(nodes => nodes.every(node => node.querySelectorAll(".kp-chip").length >= 1));
  check("每题都标注至少一个知识点 chip", allQuestionsTagged && kpChipCount >= ch3Questions, `${kpChipCount}/${ch3Questions}`);

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

  // 4. 账户同步与按用户隔离的缓存
  const state = await page.evaluate(async () => (await fetch("/api/student/chapter-practice")).json());
  check("判分结果同步到账户", Boolean(state.graded?.["ch3-q01"]));
  const stored = await page.evaluate(async () => { const {user} = await (await fetch("/api/auth/me")).json(); return localStorage.getItem(`zcyl:chapter-practice-v2:${user.id}`); });
  check("练习缓存按账号隔离", Boolean(stored && stored.includes("ch3-q01")));

  // 5. 打开课程知识图谱，选择第三章验证具体课程概念及真实关系
  await page.locator(".summary-actions .ghost-button", { hasText: "课程知识图谱" }).click();
  await page.waitForSelector(".kg-svg", { timeout: 5000 });
  const graph = page.locator("[data-testid='course-knowledge-graph']");
  await graph.locator("[data-knowledge-chapter='ch3']").click();
  const expectedConcepts = knowledgePointsByChapter("ch3");
  const expectedGraph = layoutKnowledgeGraph({ chapterId: "ch3", width: 920, height: 620 });
  const conceptIds = await graph.locator(".kg-node").evaluateAll(nodes => nodes.map(node => node.dataset.kpId));
  check("第三章图谱渲染全部课程概念", JSON.stringify([...conceptIds].sort()) === JSON.stringify(expectedConcepts.map(point => point.id).sort()), `${conceptIds.length} 个知识点`);
  const edgeCount = await graph.locator(".kg-edge").count();
  check("概念依赖连线与课程模型一致", edgeCount === expectedGraph.edges.length, `${edgeCount} 条`);
  check("课程概念没有关卡锁定状态", await graph.locator(".kg-node[data-status='locked'], .kg-node.kg-locked").count() === 0);
  const remoteProgress = await page.evaluate(async () => (await (await fetch("/api/student/progress")).json()).progress ?? {});
  const evidenceStatuses = await graph.locator(".kg-node").evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.dataset.kpId, node.dataset.status])));
  check("图谱实验记录状态与账户进度一致", expectedConcepts.every(point => evidenceStatuses[point.id] === knowledgeEvidenceOf(point, remoteProgress).status));

  // 6. 点题目 chip → 精确课程概念定位 + 前置/后续关系
  const focusedConceptId = questionOf("ch3-q01").kpId;
  await page.locator('[data-qid="ch3-q01"] .kp-chip').first().click();
  await page.waitForTimeout(400);
  check(
    "点 chip 后图谱高亮定位对应课程概念",
    await graph.locator(`.kg-node.highlighted[data-kp-id='${focusedConceptId}']`).isVisible(),
  );
  const detail = graph.locator(`.concept-inspector .kp-detail[data-kp-detail='${focusedConceptId}']`);
  check("知识点详情展开（含前置/后续知识点）", await detail.isVisible()
    && (await detail.locator(".kp-chip.prereq").count()) > 0
    && (await detail.locator(".kp-chip.dependent").count()) > 0,
    `前置 ${await detail.locator(".kp-chip.prereq").count()} 个 / 后续 ${await detail.locator(".kp-chip.dependent").count()} 个`);
  check("详情含相关实验入口与练习题", await detail.locator(".kp-enter-btn").first().isVisible() && (await detail.locator(".kp-question-link").count()) > 0);

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
