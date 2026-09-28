/**
 * 补码演示页平台集成回归（2026-09-19）：
 * 1. /demos/twos-complement.html 由 dev server 正常服务且页面可运行；
 * 2. 课程课件 ch2 展开后有「课堂演示」入口（新窗口链接）；
 * 3. 机器数编码实验面板含演示入口；
 * 4. 独立副本 E:\workspace\twos-complement-demo\index.html 保持可用（file://）。
 *
 * 前置：API(8787) 与 Vite(5173) 已启动，演示班级已 seed。
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
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });

  // 1. 静态资源可服务且页面可运行（HTTP 环境）
  const demoPage = await context.newPage();
  const demoErrors = [];
  demoPage.on("pageerror", (err) => demoErrors.push(String(err)));
  const resp = await demoPage.goto(`${BASE_URL}/demos/twos-complement.html`);
  check("演示页 HTTP 200", resp?.status() === 200, `status=${resp?.status()}`);
  await demoPage.waitForTimeout(500);
  check("演示页在 HTTP 环境下正常运行", (await demoPage.locator("h1").innerText()).includes("补码的运算") && demoErrors.length === 0);
  const modes = await demoPage.locator("#modeTabs button").allTextContents();
  check("六大模式齐全", modes.length === 6, modes.join("/"));
  await demoPage.close();

  // 2. 课程课件 ch2 的「课堂演示」入口
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.locator("#login-username").fill("demo2026001");
  await page.locator("#login-password").fill("Student123!");
  await page.locator(".login-submit").click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });
  await page.locator(".topbar-nav .topbar-nav-item", { hasText: "课程课件" }).click();
  await page.locator(".chapter-header", { hasText: "第二章" }).click();
  const demoLink = page.locator(".chapter-body .linked-challenges a[href='/demos/twos-complement.html']");
  check("ch2 课件含「课堂演示」入口", await demoLink.count() === 1);
  check("入口新窗口打开且带说明", (await demoLink.getAttribute("target")) === "_blank" && ((await demoLink.getAttribute("title")) ?? "").includes("移码"));

  // 3. 机器数编码实验面板入口（demo2026010 的 machine-number 已解锁）
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {}));
  await page.context().clearCookies();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.locator("#login-username").fill("demo2026010");
  await page.locator("#login-password").fill("Student123!");
  await page.locator(".login-submit").click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });
  await page.locator(".project-chapter-toggle", { hasText: "第 2 章" }).click();
  await page.locator(".project-experiment-row", { hasText: "机器数编码" }).first().click();
  await page.waitForSelector(".lab-studio", { timeout: 15000 });
  const panelLink = page.locator(".machine-number-panel a[href='/demos/twos-complement.html']");
  check("机器数实验面板含演示入口", await panelLink.count() === 1);
  await page.close();

  // 4. 独立副本仍可通过 file:// 使用
  const standalone = await context.newPage();
  const standaloneErrors = [];
  standalone.on("pageerror", (err) => standaloneErrors.push(String(err)));
  await standalone.goto("file:///E:/workspace/twos-complement-demo/index.html");
  await standalone.waitForTimeout(400);
  check("独立副本 file:// 可用", (await standalone.locator("h1").innerText()).includes("补码的运算") && standaloneErrors.length === 0);
  await standalone.close();

  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
