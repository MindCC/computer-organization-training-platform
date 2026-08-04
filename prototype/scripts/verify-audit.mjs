import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// P2-A: 教师设置页审计日志展示
const appUrl = "http://127.0.0.1:8787";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

await page.goto(appUrl, { waitUntil: "networkidle" });
await page.getByLabel("账号").waitFor({ state: "visible", timeout: 15_000 });
await page.getByLabel("账号").fill("teacher");
await page.getByLabel("密码").fill("ChangeMe123!");
await page.getByRole("button", { name: "登录" }).click();
await page.waitForTimeout(2500);

const settingsButton = page.getByRole("button", { name: "课堂设置" });
if (!(await settingsButton.isVisible().catch(() => false))) {
  await page.locator(".profile-button").click();
}
await settingsButton.click();
await page.waitForTimeout(1500);

// 审计日志区域存在
await page.getByText("审计日志", { exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });
console.log("审计日志 section visible");

// 应有登录成功记录（刚登录过）
const rows = await page.locator(".teacher-audit-row").count();
console.log("audit rows:", rows);
assert.ok(rows >= 1, "audit log rows should render after login");

const rowTexts = await page.locator(".teacher-audit-row").allInnerTexts();
console.log("first rows:", JSON.stringify(rowTexts.slice(0, 3)));
assert.ok(rowTexts.some((t) => /登录成功/.test(t)), "login_success should appear");

// 操作类型筛选器存在
const filter = page.getByLabel("按操作类型筛选");
assert.equal(await filter.count(), 1, "action filter select exists");
await filter.selectOption("login_success");
await page.waitForTimeout(800);
const filteredRows = await page.locator(".teacher-audit-row").count();
console.log("filtered rows (login_success):", filteredRows);
assert.ok(filteredRows >= 1, "filtered rows should show login_success only");
const filteredTexts = await page.locator(".teacher-audit-row").allInnerTexts();
assert.ok(filteredTexts.every((t) => /登录成功/.test(t)), "all filtered rows are login_success");

assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(" | ")}`);
console.log("P2-A PASS: audit logs visible and filterable in teacher settings");
await browser.close();
