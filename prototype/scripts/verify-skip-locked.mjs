import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { CHALLENGES } from "../src/platformLogic.js";
import { fillLoginForm, submitLoginForm, gotoApp } from "./lib/qaLogin.mjs";
import { openChallengeFromHome } from "./lib/qaHome.mjs";

// P2-C: 跳关开关 UI 实测
const appUrl = process.env.PROTOTYPE_URL ?? process.env.PROTOTYPE_APP_URL ?? "http://127.0.0.1:8787";
const apiUrl = process.env.PROTOTYPE_API_URL ?? "http://127.0.0.1:8787";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// 1. 创建测试班级和学生
const teacherLogin = await fetch(apiUrl + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "teacher", password: "ChangeMe123!" }),
});
const teacherCookie = (teacherLogin.headers.get("set-cookie") ?? "").split(";")[0];
const className = "跳关验证班-" + Date.now();
const createClass = await fetch(apiUrl + "/api/classes", {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: teacherCookie },
  body: JSON.stringify({ name: className }),
});
const classId = (await createClass.json()).class?.id;
const username = "skip-" + Date.now();
await fetch(apiUrl + `/api/teacher/classes/${classId}/import-students`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: teacherCookie },
  body: JSON.stringify({ csv: `${username},跳关学生,Student123!` }),
});

// 2. 教师登录，打开设置页，切换跳关开关
await gotoApp(page, appUrl);
await fillLoginForm(page, { username: "teacher", password: "ChangeMe123!" });
await submitLoginForm(page);
await page.waitForTimeout(2500);

// 选择刚创建的班级
await page.locator(".teacher-class", { hasText: className }).click();
await page.waitForLoadState("networkidle");

const settingsButton = page.getByRole("button", { name: "课堂设置" });
if (!(await settingsButton.isVisible().catch(() => false))) {
  await page.locator(".profile-button").click();
}
await settingsButton.click();
await page.waitForTimeout(1000);

// 跳关开关存在且默认关闭
const toggle = page.getByLabel("允许学生跳关");
await toggle.waitFor({ state: "visible", timeout: 10_000 });
console.log("toggle default checked:", await toggle.isChecked());
assert.equal(await toggle.isChecked(), false, "default off");

// 开启
await toggle.click();
await page.waitForTimeout(1500);
console.log("toggle after check:", await toggle.isChecked());
assert.equal(await toggle.isChecked(), true, "toggled on");

// 3. 学生登录验证 locked 关卡可点击
await page.getByRole("button", { name: "关闭" }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "退出登录" }).click().catch(async () => {
  await page.locator(".profile-button").click();
  await page.getByRole("button", { name: "退出登录" }).click();
});
await page.waitForTimeout(1000);
await fillLoginForm(page, { username, password: "Student123!" });
await submitLoginForm(page);
await page.waitForTimeout(2500);

// 课程首页上默认锁定的关卡，在开启跳关后应能真正进入实验台。
// 旧实现只有首页卡片放开了开关，实验台与步骤条仍会拦截，点进去只会闪一行文字。
const lockedChallenge = CHALLENGES[1];
console.log("probing locked challenge:", lockedChallenge.title);
await openChallengeFromHome(page, lockedChallenge.title);
await page.locator(".lab-studio").waitFor({ state: "visible", timeout: 20_000 });
assert.ok(await page.locator(".lab-studio").count() >= 1, "locked challenge opens once skip is enabled");
console.log("opened locked challenge with skip enabled:", lockedChallenge.title);

assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(" | ")}`);
console.log("P2-C PASS: skip-locked toggle works end to end");
await browser.close();
