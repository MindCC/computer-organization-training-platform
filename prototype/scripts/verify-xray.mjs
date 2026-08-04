import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// P0-C: 3D X-ray 模式浏览器实测
const appUrl = "http://127.0.0.1:8787"; // 直连 API（绕过 Vite proxy 的 CSRF Origin 校验）
const apiUrl = "http://127.0.0.1:8787";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// 1. 通过 API 创建隔离测试学生
const teacherLogin = await fetch(apiUrl + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "teacher", password: "ChangeMe123!" }),
});
assert.ok(teacherLogin.ok);
const teacherCookie = (teacherLogin.headers.get("set-cookie") ?? "").split(";")[0];

const className = "Xray验证班-" + Date.now();
const createClass = await fetch(apiUrl + "/api/classes", {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: teacherCookie },
  body: JSON.stringify({ name: className }),
});
assert.ok(createClass.ok || createClass.status === 201);
const classId = (await createClass.json()).class?.id;

const username = "xray-" + Date.now();
const importRes = await fetch(apiUrl + `/api/teacher/classes/${classId}/import-students`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: teacherCookie },
  body: JSON.stringify({ csv: `${username},Xray测试学生,Student123!` }),
});
assert.ok(importRes.ok);

// 2. 登录学生，进入 3D 概览关卡（computer-components）
await page.goto(appUrl, { waitUntil: "networkidle" });
await page.getByLabel("账号").waitFor({ state: "visible", timeout: 15_000 });
await page.getByLabel("账号").fill(username);
await page.getByLabel("密码").fill("Student123!");
await page.getByRole("button", { name: "登录" }).click();
await page.waitForTimeout(2500);
const bodyText = await page.locator("body").innerText().catch(() => "");
console.log("POST-LOGIN BODY:", JSON.stringify(bodyText.slice(0, 300)));

// 进入第一个挑战
await page.getByRole("button", { name: "开始第一个实验" }).first().click().catch(async () => {
  await page.getByRole("button", { name: "进入当前关卡" }).first().click();
});
await page.waitForLoadState("networkidle");

// 3. 找到 3D 场景（computer-exploded 容器）
const scene = page.locator(".computer-exploded");
await scene.first().waitFor({ state: "visible", timeout: 15_000 });
console.log("3D scene visible");

// 4. X-ray 按钮存在且默认关闭
const xrayButton = page.getByRole("button", { name: /X-ray/ }).first();
await xrayButton.waitFor({ state: "visible", timeout: 10_000 });
assert.equal(await xrayButton.getAttribute("aria-pressed"), "false", "X-ray defaults off");
console.log("X-ray button present, defaults to off");

// 5. 点击开启，按钮状态切换
await xrayButton.click();
await page.waitForTimeout(500);
assert.equal(await xrayButton.getAttribute("aria-pressed"), "true", "X-ray toggles on");
console.log("X-ray toggles on");

// 6. 截图存档
await page.screenshot({ path: "test-artifacts/xray-on.png", fullPage: false });
await xrayButton.click();
await page.waitForTimeout(300);
assert.equal(await xrayButton.getAttribute("aria-pressed"), "false", "X-ray toggles off");
await page.screenshot({ path: "test-artifacts/xray-off.png", fullPage: false });
console.log("X-ray toggles off, screenshots saved");

// 7. P1-D: X-ray 开启时显示总线标签牌（数据总线/地址总线/控制总线）
await xrayButton.click();
await page.waitForTimeout(800);
const busLabels = page.locator(".bus-label");
const labelCount = await busLabels.count();
console.log("bus label count:", labelCount);
assert.ok(labelCount >= 3, `expected >=3 bus labels, got ${labelCount}`);
const labelTexts = await busLabels.allInnerTexts();
const joined = labelTexts.join("|");
assert.ok(/数据总线/.test(joined), `data bus label missing: ${joined}`);
assert.ok(/地址总线/.test(joined), `address bus label missing: ${joined}`);
assert.ok(/控制总线/.test(joined), `control bus label missing: ${joined}`);
await page.screenshot({ path: "test-artifacts/xray-labels.png", fullPage: false });
console.log("P1-D PASS: bus labels visible in X-ray mode:", joined.slice(0, 120));

assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(" | ")}`);
console.log("P0-C X-RAY PASS: no page errors, toggle works");
await browser.close();
