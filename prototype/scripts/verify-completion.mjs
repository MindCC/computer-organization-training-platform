import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { fillLoginForm, submitLoginForm, gotoApp } from "./lib/qaLogin.mjs";

// P2-D: 学生首页 已完成 x/y 关 + 预计剩余课时
const appUrl = process.env.PROTOTYPE_URL ?? process.env.PROTOTYPE_APP_URL ?? "http://127.0.0.1:8787";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// 登录有进度的学生
await gotoApp(page, appUrl);
await fillLoginForm(page, { username: "demo2026001", password: "Student123!" });
await submitLoginForm(page);
// 首页是懒加载的：先等完成度卡片出现，再读文本，避免取到加载中的空页面
await page.getByText("预计剩余课时", { exact: false }).first().waitFor({ state: "visible", timeout: 30_000 });
await page.waitForTimeout(500);

const body = await page.locator("body").innerText();
const hasProgress = /已完成\s+\d+\s*\/\s*\d+\s*关/.test(body);
const hasRemaining = /预计剩余课时/.test(body);
const hasEstimate = /约 \d+ 课时/.test(body) || /暂无估算/.test(body);
console.log("已完成 x/y 关:", hasProgress);
console.log("预计剩余课时 label:", hasRemaining);
console.log("课时估算值:", hasEstimate);

// 检查 quest-hero-stats 里的新卡
const statCards = await page.locator(".quest-hero-stats .metric-card").allInnerTexts();
console.log("stat cards:", JSON.stringify(statCards));
assert.ok(hasRemaining, "remaining-lesson card should exist");
assert.ok(hasEstimate, "remaining estimate value should show");
assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(" | ")}`);
console.log("P2-D PASS: completion overview renders on student home");
await browser.close();
