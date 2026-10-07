/**
 * 学习记录页回归（2026-10 浅色化大改版后更新）
 * 1. 页面渲染：标题、KPI、六张统计图齐全；
 * 2. 章节学习树已于 2026-10-06 按用户要求删除：断言它不再渲染（`章节学习树已移除`）；
 * 3. 浅色主题：浅底 #f6f8fb、白卡片、深色正文；
 * 4. 关卡明细保留 .record-table/.record-row 契约，按章节可折叠（默认第一章展开）；
 * 5. 图表点击弹出大图弹层，关闭后收回；
 * 6. 图表：各章累计学习时长柱状图、高频错误 Top；
 * 7. 冒险地图：八章区域按真实实验记录点亮，章节清单覆盖全部任务，可进入对应实验。
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
import { clickTopNavItem } from './nav-helpers.mjs';

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
  const restoreCompanion = async () => { const trigger = page.locator('.study-companion-trigger'); if (await trigger.count()) await trigger.press('Home'); };

  await gotoApp(page, `${BASE_URL}/`);
  await fillLoginForm(page, {username:'demo2026001',password:'Student123!'});
  await submitLoginForm(page);
  await page.waitForSelector(".quest-student-home", { timeout: 15000 });

  // 进入学习记录
  await clickTopNavItem(page, "学习记录");
  await page.waitForSelector(".records-screen", { timeout: 15000 });
  check("大屏标题「个人学情记录」", await page.getByRole("heading", { name: "个人学情记录" }).count() > 0);

  // KPI 指标条
  check("KPI 指标条 5 项", await page.locator(".records-kpi").count() === 5);
  check("KPI 使用明确的已完成实验文案", (await page.locator(".records-kpi").first().innerText()).includes("已完成实验"));
  check('学习记录不再挂载知识图谱', await page.getByTestId('course-knowledge-graph').count() === 0);
  check('默认学习概览，计划与明细分区隐藏', await page.getByRole('tab', {name:'学习概览'}).getAttribute('aria-selected') === 'true' && !(await page.locator('#records-pane-planning').isVisible()) && !(await page.locator('#records-pane-details').isVisible()));
  await page.screenshot({path:`${ARTIFACT_DIR}/records-overview-desktop.png`,fullPage:true});
  await page.getByRole('tab', {name:'计划与专注'}).click();
  await page.getByTestId('study-planning').waitFor({state:'visible'});
  check('计划与专注只显示自己的学习工具', await page.locator('.pomodoro-panel').isVisible() && !(await page.getByTestId('records-statistics-grid').isVisible()));
  await page.getByRole('button', {name:'新建学习计划',exact:true}).click();
  await page.getByLabel('学习计划目标').fill('整理记录分区验收');
  await page.getByRole('button', {name:'保存学习计划',exact:true}).click();
  await page.locator('.study-plan-item').filter({hasText:'整理记录分区验收'}).waitFor();
  await page.locator('.pomo-primary').click();
  await page.getByRole('tab', {name:'学习概览'}).click();
  check('离开专注分区暂停动画解码', await page.locator('.pomo-video').evaluate(video => video.paused));
  await page.getByRole('tab', {name:'计划与专注'}).click();
  check('切换分区保留正在运行的计时', (await page.locator('.pomo-primary').innerText()).includes('暂停'));
  await page.locator('.pomo-primary').click();
  const pausedClock = await page.locator('.pomo-sign-clock').innerText();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`${ARTIFACT_DIR}/records-planning-desktop.png`,fullPage:true});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('tab', {name:'计划与专注'}).click();
  await page.locator('.study-plan-item').filter({hasText:'整理记录分区验收'}).waitFor();
  check('刷新保留服务器计划及已暂停的番茄钟', (await page.locator('.pomo-primary').innerText()).includes('开始') && await page.locator('.pomo-sign-clock').innerText() === pausedClock);
  await page.getByRole('tab', {name:'学习概览'}).click();
  await page.getByRole('tab', {name:'学习概览'}).focus();
  await page.keyboard.press('End');
  check('键盘可切换到详细记录', await page.getByRole('tab', {name:'详细记录'}).getAttribute('aria-selected') === 'true');
  await page.getByRole('tab', {name:'学习概览'}).click();

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
  // 2026-10-05 版式调整：改成 4 列基准网格，两张趋势类图表各占两列。
  // 新契约：6 张卡高度仍完全一致，且恰好 2 张为双列宽（其余等宽）。
  const wide = sizes.filter(size => size.width > sizes[0].width + 1);
  const narrow = sizes.filter(size => Math.abs(size.width - sizes[0].width) < 1 || size.width < sizes[0].width - 1);
  check('六张统计卡统一高度', sizes.length === 6 && sizes.every(size => Math.abs(size.height - sizes[0].height) < 1), JSON.stringify(sizes.map(s => Math.round(s.height))));
  check('恰好两张重点图表占双列，其余等宽', wide.length === 2 && new Set(narrow.map(size => Math.round(size.width))).size === 1, JSON.stringify(sizes.map(s => Math.round(s.width))));
  check('最近活动在统计图卡片内', await page.locator('[data-testid="records-statistics-grid"] [data-testid="chart-recent-activity"]').count() === 1);
  const mascot = page.locator('.records-kpi-review .study-mascot-trigger');
  await mascot.hover();
  await page.waitForTimeout(200);
  const mascotHover = await page.locator('.records-kpi-review [role="tooltip"]').evaluate(node => ({visible:getComputedStyle(node).visibility,opacity:getComputedStyle(node).opacity,hover:node.parentElement.matches(':hover')}));
  check('悬停小芯显示复习建议', mascotHover.visible === 'visible' && Number(mascotHover.opacity) > .9, JSON.stringify(mascotHover));
  await mascot.click();
  await page.getByRole('dialog').locator('.companion-live').waitFor({state:'visible'});
  // 2026-10-05：小芯对话框改为 createPortal 渲染到 document 根节点（upstream 决定），
  // 因此不能再限定在 .records-kpi-review 内查找；用只属于小芯的 .study-mascot-review 定位。
  check('点击小芯也能读到复习建议', (await page.locator('[role="dialog"] .companion-live').innerText()).includes('建议继续'));
  await page.getByRole('button', {name:'关闭小芯助教'}).click();
  check('明细默认折叠，缩短页面', await page.locator('[data-testid="records-details-section"]').evaluate(node=>!node.open));
  await page.locator('[data-testid="records-statistics-grid"]').screenshot({path:`${ARTIFACT_DIR}/records-statistics-equal.png`,style:'.topbar {visibility:hidden;}'});

  // 2026-10-06 用户要求删除「章节学习树」板块：这里断言它确实不再渲染，
  // 防止后续改动把它带回来（原学习树断言见 git 历史）。
  check("章节学习树已移除", await page.locator('[data-testid="records-tree-section"], .learning-tree-canvas, .tree-leaf').count() === 0);

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
  await restoreCompanion();

  // ── 冒险地图：状态来自同一份真实课程进度，概念图谱不承担关卡锁定 ──
  await page.getByRole('button', {name:'课程首页',exact:true}).click();
  await page.waitForSelector("[data-testid='course-adventure-map'] [data-region-id]", { timeout: 15000 });
  const progressResponse = await (await page.request.get(`${API_URL}/api/student/progress`)).json();
  const expectedMap = buildAdventureMap(progressResponse.progress ?? {});
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
  await clickTopNavItem(page, "学习记录");
  await page.waitForSelector(".records-screen", { timeout: 15000 });

  // 学习树删除后，进入实验的入口由课程首页冒险地图承担（上面已断言地图覆盖全部任务），
  // 这里不再有树上的叶子/缩放交互可测。

  await page.screenshot({ path: `${ARTIFACT_DIR}/records-tech-screen.png`, fullPage: false });
  await restoreCompanion();

  // 明细契约保留（verify-ui 依赖 .record-table .record-row）
  await clickTopNavItem(page, "学习记录");
  await page.waitForSelector(".records-screen", { timeout: 15000 });
  await page.getByRole('tab', {name:'详细记录'}).click();
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
  await page.getByTestId('records-practice-section').locator('summary').click();
  await page.getByTestId('records-service-section').locator('summary').click();
  check('随堂练习和维修记录分开归组', await page.getByTestId('demo-practice-panel').isVisible() && await page.getByTestId('records-service-section').evaluate(node => node.open));
  for (const label of ['学习概览','计划与专注','详细记录']) {
    await page.setViewportSize({width:390,height:844});
    await restoreCompanion();
    await page.getByRole('tab',{name:label}).click();
    check(`手机${label}无横向溢出`, await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1));
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${ARTIFACT_DIR}/records-${label}-mobile.png`,fullPage:true});
  }
  await page.getByRole('tab',{name:'学习概览'}).click();
  await page.getByTestId('records-activity-section').locator('summary').click();
  check('日历与热力图可按需展开', await page.locator('.records-calendar-panel').isVisible() && await page.locator('.records-heatmap-panel').isVisible());
  const teacherContext = await browser.newContext({viewport:{width:1366,height:768}});
  const teacher = await teacherContext.newPage();
  await gotoApp(teacher,`${BASE_URL}/`);
  await fillLoginForm(teacher,{username:'teacher',password:'ChangeMe123!'});
  await teacher.locator('[data-login-role="teacher"]').click();
  await submitLoginForm(teacher);
  await teacher.locator('.teacher-studio').waitFor();
  await clickTopNavItem(teacher,'学习记录');
  await teacher.locator('.teacher-review-roster').waitFor();
  await teacher.locator('.teacher-review-roster tbody tr').first().getByRole('button',{name:'学习记录',exact:true}).click();
  await teacher.locator('.records-screen').waitFor();
  check('教师查看学生只保留概览与明细，不挂载私人计划和计时', await teacher.getByRole('tab',{name:'计划与专注'}).count() === 0 && await teacher.getByTestId('study-planning').count() === 0 && await teacher.locator('.pomodoro-panel').count() === 0);
  await teacher.getByLabel('学情查看对象',{exact:true}).selectOption('mine');
  await teacher.getByRole('tab',{name:'计划与专注'}).click();
  await teacher.getByTestId('study-planning').waitFor();
  check('教师试练拥有独立计划分区，未继承学生私人计划', !(await teacher.getByTestId('study-planning').innerText()).includes('整理记录分区验收'));
  await teacherContext.close();
  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
