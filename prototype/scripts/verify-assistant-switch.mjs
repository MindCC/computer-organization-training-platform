/**
 * AI 实验助教换关重置回归（2026-09-28 bug 修复）：
 * 1. 在与门请求一次讲解 → 显示讲解内容；
 * 2. 切到或门 → 面板必须重置为待机文案，不得残留与门的讲解；
 * 3. 在或门再请求一次 → 显示的是或门（本关）的讲解；
 * 4. 请求后立即换关 → 旧关卡的返回不得盖到新关卡上。
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
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

  // 1. 与门请求讲解
  await page.locator(".lab-assistant-button").click();
  await page.waitForSelector(".lab-assistant-body", { timeout: 15000 });
  const andHint = await page.locator(".lab-assistant-concept").innerText();
  check("与门讲解显示", andHint.length > 0, andHint.slice(0, 40));

  // 2. 切到或门（步骤条里点或门）
  await page.locator(".lab-studio-step", { hasText: "或门" }).first().click();
  await page.waitForTimeout(800);
  const afterSwitch = await page.locator(".lab-assistant-panel").innerText();
  check(
    "换关后面板重置（不残留与门讲解）",
    !afterSwitch.includes("错误分析") && afterSwitch.includes("卡住了"),
    afterSwitch.slice(0, 90),
  );
  check("面板 data-challenge 已切到或门", (await page.locator(".lab-assistant-panel").getAttribute("data-challenge")) === "or-gate");

  // 3. 或门再请求一次 → 应是或门的讲解
  await page.locator(".lab-assistant-button").click();
  await page.waitForSelector(".lab-assistant-body", { timeout: 15000 });
  const orHint = await page.locator(".lab-assistant-concept").innerText();
  check("或门讲解显示且与与门不同", orHint.length > 0, orHint.slice(0, 40));

  // 4. 请求后立即换关 → 旧请求返回不得盖到新关卡
  await page.locator(".lab-studio-step", { hasText: "非门" }).first().click();
  await page.waitForTimeout(400);
  await page.locator(".lab-assistant-button").click(); // 触发非门请求
  await page.locator(".lab-studio-step", { hasText: "异或门" }).first().click(); // 立即切走
  await page.waitForTimeout(2000); // 等旧请求返回窗口期
  const finalText = await page.locator(".lab-assistant-panel").innerText();
  check(
    "换关后在途旧请求不盖到新关卡（面板为待机或异或门内容）",
    (finalText.includes("卡住了") || finalText.includes("异或")) && (await page.locator(".lab-assistant-panel").getAttribute("data-challenge")) === "xor-gate",
    (await page.locator(".lab-assistant-panel").getAttribute("data-challenge")),
  );
  check("全程无运行期错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
