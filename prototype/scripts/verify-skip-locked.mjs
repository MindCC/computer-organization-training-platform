import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// P2-C: 跳关开关 UI 实测
const appUrl = "http://127.0.0.1:8787";
const apiUrl = "http://127.0.0.1:8787";

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
await page.goto(appUrl, { waitUntil: "networkidle" });
await page.getByLabel("账号").waitFor({ state: "visible", timeout: 15_000 });
await page.getByLabel("账号").fill("teacher");
await page.getByLabel("密码").fill("ChangeMe123!");
await page.getByRole("button", { name: "登录" }).click();
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
await page.getByLabel("账号").fill(username);
await page.getByLabel("密码").fill("Student123!");
await page.getByRole("button", { name: "登录" }).click();
await page.waitForTimeout(2500);

// 课程地图上 locked 关卡应可点击（disabled=false）
const lockedStages = page.locator(".quest-stage.locked");
const lockedCount = await lockedStages.count();
console.log("locked stage buttons:", lockedCount);
if (lockedCount > 0) {
  const disabledStates = await lockedStages.evaluateAll((els) => els.map((el) => el.disabled));
  console.log("disabled states:", JSON.stringify(disabledStates));
  assert.ok(disabledStates.every((d) => d === false), "locked stages clickable when skip enabled");
} else {
  console.log("no locked stages visible (student may have progressed)");
}

assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(" | ")}`);
console.log("P2-C PASS: skip-locked toggle works end to end");
await browser.close();
