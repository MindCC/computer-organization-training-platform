import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// P2-E: 活跃会话 + 密码强度提示
const appUrl = "http://127.0.0.1:8787";
const apiUrl = "http://127.0.0.1:8787";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// 1. 教师登录（两个会话，模拟多设备）
await page.goto(appUrl, { waitUntil: "networkidle" });
await page.getByLabel("账号").waitFor({ state: "visible", timeout: 15_000 });
await page.getByLabel("账号").fill("teacher");
await page.getByLabel("密码").fill("ChangeMe123!");
await page.getByRole("button", { name: "登录" }).click();
await page.waitForTimeout(2500);

// API 创建第二个教师会话（模拟另一设备）
await fetch(apiUrl + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "teacher", password: "ChangeMe123!" }),
});

// 2. 打开设置页，查看活跃会话
const settingsButton = page.getByRole("button", { name: "课堂设置" });
if (!(await settingsButton.isVisible().catch(() => false))) {
  await page.locator(".profile-button").click();
}
await settingsButton.click();
await page.waitForTimeout(1500);

await page.getByText("活跃会话", { exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });
console.log("活跃会话 section visible");
const sessionRows = await page.locator(".teacher-session-row").count();
console.log("session rows:", sessionRows);
assert.ok(sessionRows >= 1, "at least one active session shown");

// 3. 学生端：改密码 + 强度提示
// 先造一个学生
const teacherLogin = await fetch(apiUrl + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "teacher", password: "ChangeMe123!" }),
});
const teacherCookie = (teacherLogin.headers.get("set-cookie") ?? "").split(";")[0];
const className = "P2E验证班-" + Date.now();
const createClass = await fetch(apiUrl + "/api/classes", {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: teacherCookie },
  body: JSON.stringify({ name: className }),
});
const classId = (await createClass.json()).class?.id;
const username = "p2e-" + Date.now();
await fetch(apiUrl + `/api/teacher/classes/${classId}/import-students`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: teacherCookie },
  body: JSON.stringify({ csv: `${username},P2E学生,Student123!` }),
});

// 退出教师，登录学生
await page.getByRole("button", { name: "关闭" }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "退出登录" }).click().catch(async () => {
  await page.locator(".profile-button").click();
  await page.getByRole("button", { name: "退出登录" }).click();
});
await page.waitForTimeout(800);
await page.getByLabel("账号").fill(username);
await page.getByLabel("密码").fill("Student123!");
await page.getByRole("button", { name: "登录" }).click();
await page.waitForTimeout(2500);
const postLogin = await page.locator("body").innerText().catch(() => "");
console.log("STUDENT POST-LOGIN:", JSON.stringify(postLogin.slice(0, 200)));

// 打开设置（学生个人设置）——通过侧边栏「学习设置」
await page.getByRole("button", { name: "学习设置" }).click().catch(async () => {
  await page.locator(".profile-button").click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "个人设置" }).click();
});
await page.waitForTimeout(800);
const settingsText = await page.locator(".settings-panel").innerText().catch(() => "NO PANEL");
console.log("STUDENT SETTINGS PANEL:", JSON.stringify(settingsText.slice(0, 300)));

// 输入新密码，检查强度条
const newPassInput = page.locator('input[autocomplete="new-password"]').first();
await newPassInput.fill("weak");
await page.waitForTimeout(300);
const weakMeter = await page.locator(".password-strength-weak").count();
console.log("weak strength meter:", weakMeter);
assert.ok(weakMeter >= 1, "weak password shows weak meter");

await newPassInput.fill("StrongNewPass456!");
await page.waitForTimeout(300);
const strongMeter = await page.locator(".password-strength-strong").count();
console.log("strong strength meter:", strongMeter);
assert.ok(strongMeter >= 1, "strong password shows strong meter");

assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(" | ")}`);
console.log("P2-E PASS: sessions list and password strength hint work");
await browser.close();
