/**
 * 挑战路径：限高内滚 + 可拖拽调宽 + 可整体收起 验收：
 * 1. 侧栏高度被限在视口内（不再 2300+px），步骤条内部可滚动；
 * 2. 拖拽右缘手柄向右 150px，侧栏变宽（--route-width 增大）；
 * 3. 点 ◀ 整体收起为 34px 窄条，工作区变宽；点 ▶ 展开复原。
 */
import { chromium } from "playwright";

const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForSelector(".login-portal", { timeout: 10000 });
  await page.locator(".demo-login-button").click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });
  const ch3 = page.locator(".project-chapter-toggle", { hasText: "第 3 章" });
  await ch3.click();
  await page.waitForTimeout(400);
  await page.locator(".project-chapter", { has: ch3 }).locator("button.project-experiment-row").filter({ hasText: "与门" }).first().click();
  await page.waitForSelector(".lab-studio", { timeout: 20000 });
  await page.waitForTimeout(1000);

  const widthOf = async () => await page.locator(".lab-studio-route").evaluate((el) => el.getBoundingClientRect().width);
  const gridWidthVar = async () => await page.locator(".lab-studio-grid").evaluate((el) => el.style.getPropertyValue("--route-width"));

  // 1. 限高 + 内滚
  const routeBox = await page.locator(".lab-studio-route").boundingBox();
  check("侧栏高度限在视口内（≤ 860px，不再 2300+）", routeBox.height <= 860, `h=${Math.round(routeBox.height)}`);
  const scroll = await page.locator(".lab-studio-stepper").evaluate((el) => ({ scrollH: el.scrollHeight, clientH: el.clientHeight, overflowY: getComputedStyle(el).overflowY }));
  check("步骤条内部可滚动", scroll.scrollH > scroll.clientH && (scroll.overflowY === "auto" || scroll.overflowY === "scroll"), `scrollH=${scroll.scrollH} clientH=${scroll.clientH} overflow=${scroll.overflowY}`);
  check("初始宽度约 232px", Math.abs((await widthOf()) - 232) < 4, `w=${await widthOf()}`);

  // 2. 拖拽调宽
  const handle = await page.locator(".route-resize-handle").boundingBox();
  await page.mouse.move(handle.x + 4, handle.y + 200);
  await page.mouse.down();
  await page.mouse.move(handle.x + 150, handle.y + 200, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const newWidth = await widthOf();
  check("拖拽右缘后宽度增大 ~382px", newWidth > 340, `w=${Math.round(newWidth)}（var=${await gridWidthVar()}）`);

  // 3. 整体收起
  const workspaceBefore = (await page.locator(".lab-studio-workspace").boundingBox()).width;
  await page.locator(".route-collapse-btn").click();
  await page.waitForTimeout(400);
  const collapsedWidth = await widthOf();
  check("点 ◀ 后收成窄条（~34px）", collapsedWidth <= 40, `w=${Math.round(collapsedWidth)}`);
  check("收起后步骤条隐藏、出现展开按钮", (await page.locator(".lab-studio-stepper").isHidden()) && (await page.locator(".route-expand-btn").count()) === 1);
  const workspaceAfter = (await page.locator(".lab-studio-workspace").boundingBox()).width;
  check("收起后工作区变宽", workspaceAfter > workspaceBefore, `${Math.round(workspaceBefore)} → ${Math.round(workspaceAfter)}`);

  // 4. 展开复原
  await page.locator(".route-expand-btn").click();
  await page.waitForTimeout(400);
  check("点 ▶ 展开后宽度回到拖拽后的值", Math.abs((await widthOf()) - newWidth) < 6, `w=${Math.round(await widthOf())}`);
  check("展开后步骤条恢复可见", await page.locator(".lab-studio-stepper").isVisible());
  check("全程无运行期错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
  await page.screenshot({ path: "qa-artifacts/route-resize.png" });
  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
