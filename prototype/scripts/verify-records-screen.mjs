/**
 * 学习记录页回归（2026-10 浅色化大改版后更新）：
 * 1. 页面渲染：标题、KPI、学习树画布、饼图/折线/柱状图齐全；
 * 2. 学习树按章节生长：1 树干 + 8 树枝 + 全部课程/硬件实验叶子，完成的实验点亮；
 * 3. 画布可缩放（控制器放大后视口 scale 变化）；
 * 4. 点击树杈进入对应实验；保留 .record-table/.record-row 明细契约；
 * 5. 浅色主题：浅底 #f6f8fb、白卡片、深色正文、深色树干 + 绿/琥珀/灰叶子；
 * 6. 关卡明细按章节可折叠（details/summary，默认第一章展开）；
 * 7. 图表点击弹出大图弹层，关闭后收回；
 * 8. 新增图表：各章累计学习时长柱状图、高频错误 Top；
 * 9. 冒险地图：八章区域按真实实验记录点亮，章节清单覆盖全部任务，可进入对应实验。
 *
 * 运行：node scripts/verify-records-screen.mjs
 * 前置：API(8787) 与 Vite(5173) 已启动，且已 seed 演示班级（demo2026001 / Student123!）。
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CHALLENGES, LEARNING_ITEMS } from "../src/platformLogic.js";
import { buildAdventureMap } from "../src/adventureMapModel.js";
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';

const BASE_URL = process.env.PROTOTYPE_APP_URL ?? process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";
const API_URL = process.env.PROTOTYPE_API_URL ?? process.env.QA_API_URL ?? "http://127.0.0.1:8787";
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

  await gotoApp(page, `${BASE_URL}/`);
  await fillLoginForm(page, {username:'demo2026001',password:'Student123!'});
  await submitLoginForm(page);
  await page.waitForSelector(".quest-student-home", { timeout: 15000 });

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
  const cards = page.locator('[data-testid="records-statistics-grid"] > .chart-zoomable');
  const sizes = await cards.evaluateAll(nodes => nodes.map(node => ({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));
  check('六张统计卡统一宽高', sizes.length === 6 && sizes.every(size => Math.abs(size.height-sizes[0].height)<1 && Math.abs(size.width-sizes[0].width)<1), JSON.stringify(sizes));
  check('最近活动在统计图卡片内', await page.locator('[data-testid="records-statistics-grid"] [data-testid="chart-recent-activity"]').count() === 1);
  const mascot = page.locator('.records-kpi-review .study-mascot-trigger');
  await mascot.hover();
  await page.waitForTimeout(200);
  const mascotHover = await page.locator('.records-kpi-review [role="tooltip"]').evaluate(node => ({visible:getComputedStyle(node).visibility,opacity:getComputedStyle(node).opacity,hover:node.parentElement.matches(':hover')}));
  check('悬停小芯显示复习建议', mascotHover.visible === 'visible' && Number(mascotHover.opacity) > .9, JSON.stringify(mascotHover));
  await mascot.click();
  check('点击小芯也能读到复习建议', await page.locator('.records-kpi-review [role="dialog"] .study-mascot-review').isVisible());
  await page.getByRole('button', {name:'关闭小芯助教'}).click();
  check('树与明细默认折叠，缩短页面', await page.locator('[data-testid="records-tree-section"]').evaluate(node=>!node.open) && await page.locator('[data-testid="records-details-section"]').evaluate(node=>!node.open));
  await page.locator('[data-testid="records-statistics-grid"]').screenshot({path:`${ARTIFACT_DIR}/records-statistics-equal.png`,style:'.topbar {visibility:hidden;}'});
  await page.locator('[data-testid="records-tree-section"] > summary').click();
  const trunkStop = await page.locator("#treeTrunkGrad stop").first().getAttribute("stop-color");
  check("树干深色渐变（#493a2c）", trunkStop?.toLowerCase() === "#493a2c", trunkStop ?? "未取到");

  // 学习树画布结构（真正的树：树干 + 主枝 + 枝头叶子）
  await page.waitForSelector(".learning-tree-canvas .organic-tree-svg", { timeout: 15000 });
  await page.waitForSelector(".tree-leaf", { timeout: 15000 });
  const trunkCount = await page.locator(".tree-trunk").count();
  const branchCount = await page.locator(".tree-branch").count();
  const chapterLabelCount = await page.locator(".tree-chapter-label").count();
  const twigCount = await page.locator(".tree-twig").count();
  const leafCount = await page.locator(".tree-leaf").count();
  check("学习树：1 树干", trunkCount === 1);
  check("学习树：8 章节主枝", branchCount === 8 && chapterLabelCount === 8, `主枝 ${branchCount} / 标签 ${chapterLabelCount}`);
  check("学习树包含全部实验细枝", twigCount === LEARNING_ITEMS.length, `实际 ${twigCount}`);
  check("学习树包含全部实验叶子", leafCount === LEARNING_ITEMS.length, `实际 ${leafCount}`);

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
    check("点亮叶子为绿色（#138777）", litFill === "rgb(19, 135, 119)", litFill);
  }
  const dimLeaf = page.locator(".tree-leaf.dim .leaf-dot").first();
  if (await dimLeaf.count() > 0) {
    const dimFill = await dimLeaf.evaluate((el) => getComputedStyle(el).fill);
    check("未点亮叶子为灰绿（#c7d0c0）", dimFill === "rgb(199, 208, 192)", dimFill);
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

  // ── 冒险地图：状态来自同一份真实课程进度，概念图谱不承担关卡锁定 ──
  await page.getByRole('button', {name:'课程首页',exact:true}).click();
  await page.waitForSelector("[data-testid='course-adventure-map'] [data-region-id]", { timeout: 15000 });
  const expectedMap = buildAdventureMap(prog);
  const map = page.locator("[data-testid='course-adventure-map']");
  const regionCount = await map.locator(".adventure-map-svg [data-region-id]").count();
  check("冒险地图：八章课程区域", regionCount === 8 && regionCount === expectedMap.regions.length, `实际 ${regionCount}`);
  const actualStates = await map.locator(".adventure-map-svg [data-region-id]").evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.dataset.regionId, node.dataset.regionState])));
  check("冒险地图区域状态与真实课程进度一致", expectedMap.regions.every(region => actualStates[region.chapterId] === region.state), JSON.stringify(actualStates));
  const currentRegionIds = await map.locator(".adventure-map-region.is-current").evaluateAll(nodes => nodes.map(node => node.dataset.regionId));
  check("推荐区域由真实课程路线决定", JSON.stringify(currentRegionIds) === JSON.stringify(expectedMap.currentRegionId ? [expectedMap.currentRegionId] : []));
  const seenTaskIds = [];
  for (const region of expectedMap.regions) {
    await map.locator(`[data-region-id='${region.chapterId}']`).click();
    const taskIds = await map.locator(".adventure-map-inspector [data-map-challenge-id]").evaluateAll(nodes => nodes.map(node => node.dataset.mapChallengeId));
    check(`${region.chapter.title}清单包含本章全部真实任务`, JSON.stringify(taskIds) === JSON.stringify(region.items.map(item => item.id)), `${taskIds.length} 项`);
    seenTaskIds.push(...taskIds);
  }
  check("八章地图清单覆盖全部电路与硬件任务", seenTaskIds.length === LEARNING_ITEMS.length && new Set(seenTaskIds).size === LEARNING_ITEMS.length, `${seenTaskIds.length} 项`);

  // 选择第一章，在该区域的关卡清单进入程序运行实验
  await map.locator("[data-region-id='ch1']").click();
  await map.locator("[data-map-challenge-id='program-flow'] button").click();
  await page.waitForSelector(".lab-studio", { timeout: 15000 });
  check("从冒险地图章节清单进入对应实验", true);
  await page.getByRole("button", { name: "课程首页", exact: true }).click();
  await page.waitForSelector(".quest-student-home", { timeout: 15000 });
  await page.locator(".topbar-nav .topbar-nav-item", { hasText: "学习记录" }).click();
  await page.locator('[data-testid="records-tree-section"] > summary').click();
  await page.waitForSelector(".records-screen .tree-leaf", { timeout: 15000 });

  // 复位视图后点击一个已完成叶子进入对应实验
  await page.locator(".tree-zoom-fit").click();
  await page.waitForTimeout(250);
  await page.locator(`.tree-leaf[data-leaf-id='${completedId}'] .leaf-hit`).click();
  await page.waitForSelector(".lab-studio", { timeout: 15000 });
  check("点击叶子进入对应实验", true);
  await page.getByRole("button", { name: "课程首页", exact: true }).click();
  await page.waitForSelector(".quest-student-home", { timeout: 15000 });
  await page.locator(".topbar-nav .topbar-nav-item", { hasText: "学习记录" }).click();
  await page.locator('[data-testid="records-tree-section"] > summary').click();
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
  await page.locator('[data-testid="records-details-section"] > summary').click();
  const rowCount = await page.locator(".record-table .record-row").count();
  check("章节化关卡明细保留（.record-table .record-row）", rowCount === CHALLENGES.length, `实际 ${rowCount} 行`);

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
    && (await page.locator(".record-table .record-row").count()) === CHALLENGES.length);
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
