import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// P1-E: 验证 3D 视图不请求任何外部网络资源（离线环境贴图）
const appUrl = "http://127.0.0.1:8787";
const apiUrl = "http://127.0.0.1:8787";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const externalRequests = [];
const pageErrors = [];
page.on("request", (req) => {
  const url = req.url();
  if (!url.startsWith(appUrl) && !url.startsWith(apiUrl) && !url.startsWith("data:")) {
    externalRequests.push(url);
  }
});
page.on("pageerror", (e) => pageErrors.push(e.message));

// 创建隔离测试学生
const teacherLogin = await fetch(apiUrl + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "teacher", password: "ChangeMe123!" }),
});
const teacherCookie = (teacherLogin.headers.get("set-cookie") ?? "").split(";")[0];
const className = "P1E验证班-" + Date.now();
const createClass = await fetch(apiUrl + "/api/classes", {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: teacherCookie },
  body: JSON.stringify({ name: className }),
});
const classId = (await createClass.json()).class?.id;
const username = "p1e-" + Date.now();
await fetch(apiUrl + `/api/teacher/classes/${classId}/import-students`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: teacherCookie },
  body: JSON.stringify({ csv: `${username},P1E测试学生,Student123!` }),
});

await page.goto(appUrl, { waitUntil: "networkidle" });
await page.getByLabel("账号").waitFor({ state: "visible", timeout: 15_000 });
await page.getByLabel("账号").fill(username);
await page.getByLabel("密码").fill("Student123!");
await page.getByRole("button", { name: "登录" }).click();
await page.waitForTimeout(2500);

await page.getByRole("button", { name: "开始第一个实验" }).first().click().catch(async () => {
  await page.getByRole("button", { name: "进入当前关卡" }).first().click();
});
await page.waitForTimeout(4000); // 等待 3D 场景和 PMREM 环境生成

const scene = page.locator(".computer-exploded canvas");
const canvasCount = await scene.count();
console.log("3D canvas count:", canvasCount);
assert.ok(canvasCount >= 1, "3D canvas should render");

console.log("external requests:", externalRequests.length ? externalRequests.join("\n") : "NONE (fully offline)");
assert.equal(externalRequests.length, 0, `3D view must not fetch external resources: ${externalRequests.join(", ")}`);
assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(" | ")}`);
console.log("P1-E PASS: offline environment works, no external HDR requests, no page errors");
await browser.close();
