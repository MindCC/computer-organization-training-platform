/**
 * 工作台内「点选切换数据」+ 顶栏删除 验收：
 * 1. 顶部 .lab-studio-inputs 输入栏已删除（整页更矮，尽量一屏）；
 * 2. 电路工作台输入节点可点击切 0/1（手动探测），节点端口实时显示信号值，出现「手动探测中」徽章；点用例退回预设；
 * 3. 机器数案例芯片可点击切换输入值。
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

  // 1. 顶栏已删
  check("顶部 .lab-studio-inputs 输入栏已删除", (await page.locator(".lab-studio-inputs").count()) === 0);
  const pageH = await page.evaluate(() => document.documentElement.scrollHeight);
  check("整页高度明显收敛（≤ 1000px）", pageH <= 1000, `scrollH=${pageH}`);

  // 2. 输入节点可点击切 0/1 + 端口实时显示
  const inputNode = page.locator('.circuit-flow-node[data-component-type="input"]').first();
  const before = await inputNode.locator(".circuit-flow-port-value").first().innerText().catch(() => "?");
  check("输入节点显示初始信号值", ["0", "1"].includes(before), `初值=${before}`);
  await inputNode.click();
  await page.waitForTimeout(500);
  const after = await inputNode.locator(".circuit-flow-port-value").first().innerText().catch(() => "?");
  check("点击输入节点后值翻转", after !== before && ["0", "1"].includes(after), `${before} → ${after}`);
  check("出现「手动探测中」徽章", (await page.locator(".circuit-flow-manual-badge").count()) === 1);

  // 再点一次翻回
  await inputNode.click();
  await page.waitForTimeout(500);
  const back = await inputNode.locator(".circuit-flow-port-value").first().innerText().catch(() => "?");
  check("再次点击翻回原值", back === before, `${after} → ${back}`);

  // 点用例 → 退回预设（徽章消失）
  await page.locator(".circuit-flow-case-tabs button").first().click();
  await page.waitForTimeout(400);
  check("点用例退回预设（徽章消失）", (await page.locator(".circuit-flow-manual-badge").count()) === 0);

  // 节点端口实时显示（门节点也有端口值）
  const gateNode = page.locator('.circuit-flow-node[data-component-type="and"]').first();
  check("门节点端口也显示信号值", (await gateNode.locator(".circuit-flow-port-value").count()) >= 1, `count=${await gateNode.locator(".circuit-flow-port-value").count()}`);

  // 3. 机器数案例芯片可点击切换
  const ch2 = page.locator(".project-chapter-toggle", { hasText: "第 2 章" });
  await page.locator(".lab-studio-icon-button").first().click(); // 返回首页
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });
  await ch2.click();
  await page.waitForTimeout(400);
  await page.locator(".project-chapter", { has: ch2 }).locator("button.project-experiment-row").filter({ hasText: "机器数" }).first().click();
  await page.waitForSelector(".lab-studio", { timeout: 20000 });
  await page.waitForTimeout(800);
  const caseChips = page.locator(".machine-number-cases button");
  check("机器数案例是可点按钮", (await caseChips.count()) >= 5, `count=${await caseChips.count()}`);
  const headingVal = async () => await page.locator(".machine-number-heading > strong").innerText();
  const v0 = await headingVal();
  // 点一个与当前值不同的案例芯片（取第 3 个，避免点到同值）
  const chipVals = await caseChips.locator("span").allTextContents();
  const different = chipVals.findIndex((v) => String(v).trim() !== String(v0).trim());
  await caseChips.nth(different).click();
  await page.waitForTimeout(400);
  const v1 = await headingVal();
  check("点案例芯片切换输入值", v1 !== v0, `${v0} → ${v1}`);

  check("全程无运行期错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
  await page.screenshot({ path: "qa-artifacts/workbench-inputs.png" });
  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
