/**
 * 学习记录「蓝色科技大屏」回归（2026-09-19）：
 * 1. 大屏渲染：标题、KPI、学习树画布、饼图/折线/柱状图齐全；
 * 2. 学习树按章节生长：1 树干 + 8 树枝 + 24 树杈，完成的实验点亮；
 * 3. 画布可缩放（控制器放大后视口 scale 变化）；
 * 4. 点击树杈进入对应实验；保留 .record-table/.record-row 明细契约。
 *
 * 运行：node scripts/verify-records-screen.mjs
 * 前置：API(8787) 与 Vite(5173) 已启动，且已 seed 演示班级（demo2026001 / Student123!）。
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";
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

  // 点亮状态（demo2026001 的播种学情：沿章节顺序做到「半加器」卡住，
  // 装机挑战 game-office-pc 等也已完成）
  const officeLeafClass = await page.locator(".tree-leaf", { hasText: "办公电脑" }).getAttribute("class");
  const andGateClass = await page.locator(".tree-leaf", { hasText: "与门" }).getAttribute("class");
  const halfAdderClass = await page.locator(".tree-leaf", { hasText: "半加器" }).first().getAttribute("class");
  const fullAdderClass = await page.locator(".tree-leaf", { hasText: "全加器" }).getAttribute("class");
  check("已完成实验点亮（办公电脑/与门）", officeLeafClass.includes("lit") && andGateClass.includes("lit"));
  check("进行中实验高亮（半加器）", halfAdderClass.includes("active"));
  check("未完成实验未点亮（全加器）", fullAdderClass.includes("dim"));

  // 统计图
  check("饼图渲染", await page.locator("[data-testid='chart-donut'] svg").count() === 1);
  check("折线图渲染（8 章刻度）", await page.locator("[data-testid='chart-line'] .line-x-label").count() === 8);
  check("柱状图渲染（8 行）", await page.locator("[data-testid='chart-bars'] .tech-bar-row").count() === 8);

  // 复位视图后点击叶子进入实验（半加器为 demo2026001 的进行中关卡）
  await page.locator(".tree-zoom-fit").click();
  await page.waitForTimeout(250);
  await page.locator(".tree-leaf[data-leaf-id='half-adder'] .leaf-hit").click();
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

  await page.screenshot({ path: `${ARTIFACT_DIR}/records-tech-screen-full.png`, fullPage: true });
  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
