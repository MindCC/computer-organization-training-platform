import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// P2-B: 错题本页面浏览器实测
const appUrl = "http://127.0.0.1:8787";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// 登录有提交数据的学生（demo2026040 有失败提交）
await page.goto(appUrl, { waitUntil: "networkidle" });
await page.getByLabel("账号").waitFor({ state: "visible", timeout: 15_000 });
await page.getByLabel("账号").fill("demo2026040");
await page.getByLabel("密码").fill("Student123!");
await page.getByRole("button", { name: "登录" }).click();
await page.waitForTimeout(2500);

// 主导航应有「错题本」入口
const mistakesNav = page.locator(".sidebar-nav").getByRole("button", { name: "错题本" });
await mistakesNav.waitFor({ state: "visible", timeout: 10_000 });
console.log("错题本 nav entry visible");
await mistakesNav.click();
await page.waitForTimeout(1500);

// 页面应显示错题本标题
await page.getByRole("heading", { name: "错题本" }).first().waitFor({ state: "visible", timeout: 10_000 });
console.log("错题本 page rendered");

// 检查总览或空状态（demo 学生有提交，可能有错题）
const body = await page.locator("body").innerText();
if (/暂无错题/.test(body)) {
  console.log("状态: 暂无错题（空状态正确显示）");
  const emptyCta = await page.getByRole("button", { name: "去实验工作台" }).count();
  assert.ok(emptyCta >= 1, "empty state should offer actionable CTA");
} else {
  console.log("状态: 有错题数据");
  await page.waitForTimeout(1000);
  const metrics = await page.locator(".metric").count();
  console.log("metrics count:", metrics);
  const metricGrid = await page.locator(".metric-grid").count();
  console.log("metric-grid count:", metricGrid);
  const mistakeGroups = await page.locator(".mistake-group").count();
  console.log("mistake groups:", mistakeGroups);
  assert.ok(mistakeGroups >= 1, "mistake groups should render");
  const retryButtons = await page.getByRole("button", { name: /回到该关卡练习/ }).count();
  console.log("retry buttons:", retryButtons);
  assert.ok(retryButtons >= 1, "retry buttons should render");
}

assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(" | ")}`);
console.log("P2-B PASS: mistake book page works, no page errors");
await browser.close();
