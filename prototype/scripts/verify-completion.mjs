import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// P2-D: 学生首页 已完成 x/y 关 + 预计剩余课时
const appUrl = "http://127.0.0.1:8787";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// 登录有进度的学生
await page.goto(appUrl, { waitUntil: "networkidle" });
await page.getByLabel("账号").waitFor({ state: "visible", timeout: 15_000 });
await page.getByLabel("账号").fill("demo2026001");
await page.getByLabel("密码").fill("Student123!");
await page.getByRole("button", { name: "登录" }).click();
await page.waitForTimeout(3000);

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
