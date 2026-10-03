/**
 * 学习记录页回归（2026-10 浅色化大改版后更新）：
 * 1. 页面渲染：标题、KPI、学习树画布、饼图/折线/柱状图齐全；
 * 2. 学习树按章节生长：1 树干 + 8 树枝 + 24 树杈，完成的实验点亮；
 * 3. 画布可缩放（控制器放大后视口 scale 变化）；
 * 4. 点击树杈进入对应实验；保留 .record-table/.record-row 明细契约；
 * 5. 浅色主题：浅底 #f6f8fb、白卡片、深色正文、深色树干 + 绿/琥珀/灰叶子；
 * 6. 关卡明细按章节可折叠（details/summary，默认第一章展开）；
 * 7. 图表点击弹出大图弹层，关闭后收回；
 * 8. 新增图表：各章累计学习时长柱状图、高频错误 Top；
 * 9. 知识星图：18 颗星 + 依赖连线，状态着色正确，点星进入实验。
 *
 * 运行：node scripts/verify-records-screen.mjs
 * 前置：API(8787) 与 Vite(5173) 已启动，且已 seed 演示班级（demo2026001 / Student123!）。
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CHALLENGE_DEPS } from "../src/challengeDependencies.js";

const EXPECTED_STAR_COUNT = Object.keys(CHALLENGE_DEPS).length;
const EXPECTED_EDGE_COUNT = Object.values(CHALLENGE_DEPS).reduce((sum, deps) => sum + deps.length, 0);

const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";
const API_URL = process.env.QA_API_URL ?? "http://127.0.0.1:8787";
const ARTIFACT_DIR = fileURLToPath(new URL("../qa-artifacts/", import.meta.url));
mkdirSync(ARTIFACT_DIR, { recursive: true });

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.locator("#login-username").fill("demo2026001");
  await page.locator("#login-password").fill("Student123!");
  await page.locator(".login-submit").click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });

  // 进入学习记录
  await page.locator(".topbar-nav .topbar-nav-item", { hasText: "学习记录" }).click();
  await page.waitForSelector(".records-screen", { timeout: 15000 });
  check("大屏标题「个人学情记录」", await page.getByRole("heading", { name: "个人学情记录" }).count() > 0);

  // KPI 指标条
  check("KPI 指标条 5 项", await page.locator(".records-kpi").count() === 5);
  check("KPI 含已点亮树杈", (await page.locator(".records-kpi").first().innerText()).includes("已点亮树杈"));

  // ── 浅色主题（computed style 断言，替代原深色大屏的语义） ──
  const screenStyle = await page.locator(".records-screen").evaluate((el) => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, color: style.color };
  });
  check("浅色页面背景 #f6f8fb", screenStyle.background === "rgb(246, 248, 251)", screenStyle.background);
  check("深色正文 #0f172a", screenStyle.color === "rgb(15, 23, 42)", screenStyle.color);
  const kpiBg = await page.locator(".records-kpi").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  check("KPI 白底卡片", kpiBg === "rgb(255, 255, 255)", kpiBg);
  const trunkStop = await page.locator("#treeTrunkGrad stop").first().getAttribute("stop-color");
  check("树干深色渐变（#4a3423）", trunkStop?.toLowerCase() === "#4a3423", trunkStop ?? "未取到");

  // 学习树画布结构（真正的树：树干 + 主枝 + 枝头叶子）
  await page.waitForSelector(".learning-tree-canvas .organic-tree-svg", { timeout: 15000 });
  await page.waitForSelector(".tree-leaf", { timeout: 15000 });
  const trunkCount = await page.locator(".tree-trunk").count();
  const branchCount = await page.locator(".tree-branch").count();
  const chapterLabelCount = await page.locator(".tree-chapter").count();
  const twigCount = await page.locator(".tree-twig").count();
  const leafCount = await page.locator(".tree-leaf").count();
  check("学习树：1 树干", trunkCount === 1);
  check("学习树：8 章节主枝", branchCount === 8 && chapterLabelCount === 8, `主枝 ${branchCount} / 标签 ${chapterLabelCount}`);
  check("学习树：24 细枝", twigCount === 24, `实际 ${twigCount}`);
  check("学习树：24 实验叶子", leafCount === 24, `实际 ${leafCount}`);

  // 点亮/进行中/未解锁的渲染与 API 学情一致（演示数据是活的，按实际状态断言，不写死）
  const progress = await (await page.request.get(`${API_URL}/api/student/progress`)).json();
  const prog = progress.progress ?? {};
  const entries = Object.entries(prog);
  const leafClass = async (id) => await page.locator(`.tree-leaf[data-leaf-id='${id}']`).first().getAttribute("class").catch(() => "");
  const completedId = entries.find(([, r]) => r?.status === "completed")?.[0];
  const activeId = entries.find(([, r]) => r?.status === "in-progress")?.[0];
  const lockedId = entries.find(([, r]) => r?.status === "locked")?.[0];
  if (completedId) check(`已完成实验点亮（${completedId}）`, (await leafClass(completedId)).includes("lit"));
  if (activeId) check(`进行中实验高亮（${activeId}）`, (await leafClass(activeId)).includes("active"));
  if (lockedId) check(`未解锁实验未点亮（${lockedId}）`, (await leafClass(lockedId)).includes("dim"));

  // 浅色叶子配色：完成=绿、未开始=灰芽（按实际学情取代表节点断言 computed fill）
  if (completedId) {
    const litFill = await page.locator(`.tree-leaf[data-leaf-id='${completedId}'] .leaf-dot`).evaluate((el) => getComputedStyle(el).fill);
    check("点亮叶子为绿色（#10b981）", litFill === "rgb(16, 185, 129)", litFill);
  }
  const dimLeaf = page.locator(".tree-leaf.dim .leaf-dot").first();
  if (await dimLeaf.count() > 0) {
    const dimFill = await dimLeaf.evaluate((el) => getComputedStyle(el).fill);
    check("未点亮叶子为灰芽（#cbd5e1）", dimFill === "rgb(203, 213, 225)", dimFill);
  }

  // 统计图
  check("饼图渲染", await page.locator("[data-testid='chart-donut'] svg").count() === 1);
  check("折线图渲染（8 章刻度）", await page.locator("[data-testid='chart-line'] .line-x-label").count() === 8);
  check("柱状图渲染（8 行）", await page.locator("[data-testid='chart-bars'] .tech-bar-row").count() === 8);

  // 新增图表：各章学习时长柱状图 + 高频错误 Top
  check("学习时长柱状图渲染（8 柱）", await page.locator("[data-testid='chart-study-time'] .study-bar").count() === 8);
  const errorRows = await page.locator("[data-testid='chart-errors'] .error-bar").count();
  const errorEmpty = await page.locator("[data-testid='chart-errors'] .chart-empty-note").count();
  check("高频错误图渲染（有数据出条形，无数据出空态）", errorRows > 0 || errorEmpty === 1, `条形 ${errorRows} / 空态 ${errorEmpty}`);

  // ── 图表点击放大弹层 ──
  await page.locator("[data-testid='chart-donut']").first().click();
  await page.waitForSelector(".chart-zoom-overlay", { timeout: 5000 });
  check("点击统计图弹出大图弹层", true);
  check("弹层内渲染同款大图", await page.locator(".chart-zoom-overlay [data-testid='chart-donut'] svg").count() === 1);
  await page.locator(".chart-zoom-close").click();
  await page.waitForTimeout(250);
  check("关闭后收回小图（弹层消失）", await page.locator(".chart-zoom-overlay").count() === 0);

  // ── 知识图谱 · 星图 ──
  await page.waitForSelector("[data-testid='knowledge-star-map'] .star-node", { timeout: 15000 });
  const starCount = await page.locator(".star-node").count();
  const starEdgeCount = await page.locator(".star-edge").count();
  check(`知识星图：${EXPECTED_STAR_COUNT} 颗关卡星`, starCount === EXPECTED_STAR_COUNT && EXPECTED_STAR_COUNT === 18, `实际 ${starCount} / 期望 18`);
  check(`知识星图：依赖星座连线 ${EXPECTED_EDGE_COUNT} 条（= CHALLENGE_DEPS 全量依赖）`, starEdgeCount === EXPECTED_EDGE_COUNT, `实际 ${starEdgeCount}`);
  const starState = async (id) => await page.locator(`.star-node[data-challenge-id='${id}']`).first().getAttribute("data-star-state").catch(() => "");
  if (completedId) check(`星图已完成=亮星（${completedId}）`, (await starState(completedId)) === "lit");
  if (activeId) check(`星图进行中=脉冲（${activeId}）`, (await starState(activeId)) === "active");
  if (lockedId) check(`星图未解锁=暗星（${lockedId}）`, (await starState(lockedId)) === "dim");

  // 点击星星进入对应实验
  await page.locator(".star-node[data-challenge-id='program-flow']").click();
  await page.waitForSelector(".lab-studio", { timeout: 15000 });
  check("点击星星进入对应实验", true);
  await page.getByRole("button", { name: "返回课程首页" }).click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });
  await page.locator(".topbar-nav .topbar-nav-item", { hasText: "学习记录" }).click();
  await page.waitForSelector(".records-screen .tree-leaf", { timeout: 15000 });

  // 复位视图后点击一个已完成叶子进入对应实验
  await page.locator(".tree-zoom-fit").click();
  await page.waitForTimeout(250);
  await page.locator(`.tree-leaf[data-leaf-id='${completedId}'] .leaf-hit`).click();
  await page.waitForSelector(".lab-studio", { timeout: 15000 });
  check("点击叶子进入对应实验", true);
  await page.getByRole("button", { name: "返回课程首页" }).click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });
  await page.locator(".topbar-nav .topbar-nav-item", { hasText: "学习记录" }).click();
  await page.waitForSelector(".records-screen .tree-leaf", { timeout: 15000 });

  // 画布缩放：点击控制器放大后容器 data-zoom 变大
  const canvas = page.locator(".learning-tree-canvas");
  const scaleOf = async () => Number(await canvas.getAttribute("data-zoom"));
  const before = await scaleOf();
  await page.locator(".tree-zoom-in").click();
  await page.waitForTimeout(300);
  const after = await scaleOf();
  check("画布可放大（zoom-in 生效）", Number.isFinite(before) && Number.isFinite(after) && after > before, `${before} → ${after}`);

  // 滚轮缩放（以光标为中心）
  await canvas.hover({ position: { x: 300, y: 260 } });
  await page.mouse.wheel(0, -480);
  await page.waitForTimeout(300);
  const afterWheel = await scaleOf();
  check("滚轮可继续放大", afterWheel > after, `${after} → ${afterWheel}`);

  await page.screenshot({ path: `${ARTIFACT_DIR}/records-tech-screen.png`, fullPage: false });

  // 明细契约保留（verify-ui 依赖 .record-table .record-row）
  await page.locator(".topbar-nav .topbar-nav-item", { hasText: "学习记录" }).click();
  await page.waitForSelector(".records-screen", { timeout: 15000 });
  const rowCount = await page.locator(".record-table .record-row").count();
  check("章节化关卡明细保留（.record-table .record-row）", rowCount === 18, `实际 ${rowCount} 行`);

  // ── 关卡明细可折叠：默认第一章展开，其余收起；summary 可切换 ──
  const chapterGroupCount = await page.locator("details.record-chapter").count();
  check("关卡明细按章节分组为可折叠 details", chapterGroupCount === 8, `实际 ${chapterGroupCount} 组`);
  const openGroupCount = await page.locator("details.record-chapter[open]").count();
  check("默认仅第一章展开", openGroupCount === 1, `展开 ${openGroupCount} 组`);
  const firstGroup = page.locator("details.record-chapter").first();
  check("第一章默认展开且行可见", await firstGroup.locator(".record-row").first().isVisible());
  await firstGroup.locator(".record-chapter-summary").click();
  await page.waitForTimeout(200);
  check("点击章节标题收起该组", await page.locator("details.record-chapter[open]").count() === 0);
  check("收起后该组行不可见（DOM 仍在，契约不破）",
    !(await firstGroup.locator(".record-row").first().isVisible())
    && (await page.locator(".record-table .record-row").count()) === 18);
  await page.locator("details.record-chapter .record-chapter-summary").nth(1).click();
  await page.waitForTimeout(200);
  check("可展开其它章节", await page.locator("details.record-chapter[open]").count() === 1);
  await page.locator("details.record-chapter .record-chapter-summary").nth(1).click();

  await page.screenshot({ path: `${ARTIFACT_DIR}/records-tech-screen-full.png`, fullPage: true });
  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
