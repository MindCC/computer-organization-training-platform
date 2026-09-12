import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { fillLoginForm, submitLoginForm, gotoApp } from "./lib/qaLogin.mjs";
import { openChallengeFromHome } from "./lib/qaHome.mjs";

// P1-E: 验证 3D 视图不请求任何外部网络资源（离线环境贴图）
const appUrl = process.env.PROTOTYPE_URL ?? process.env.PROTOTYPE_APP_URL ?? "http://127.0.0.1:8787";
const apiUrl = process.env.PROTOTYPE_API_URL ?? "http://127.0.0.1:8787";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const externalRequests = [];
const pageErrors = [];
page.on("request", (req) => {
  const url = req.url();
  // blob:/filesystem: 是页面自己生成的对象 URL，不是外部网络请求
  const localSchemes = ["data:", "blob:", "filesystem:"];
  if (!url.startsWith(appUrl) && !url.startsWith(apiUrl) && !localSchemes.some((scheme) => url.startsWith(scheme))) {
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

await gotoApp(page, appUrl);
await fillLoginForm(page, { username, password: "Student123!" });
await submitLoginForm(page);
await page.waitForTimeout(2500);

await openChallengeFromHome(page, "认识计算机五大部件");
const scene = page.locator(".computer-exploded canvas");
// 首屏 chunk 与 WebGL 初始化都是异步的：等 canvas 真正挂载再断言，别用固定等待
await scene.first().waitFor({ state: "visible", timeout: 60_000 });
const canvasCount = await scene.count();
console.log("3D canvas count:", canvasCount);
assert.ok(canvasCount >= 1, "3D canvas should render");

console.log("external requests:", externalRequests.length ? externalRequests.join("\n") : "NONE (fully offline)");
assert.equal(externalRequests.length, 0, `3D view must not fetch external resources: ${externalRequests.join(", ")}`);
assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(" | ")}`);
console.log("P1-E PASS: offline environment works, no external HDR requests, no page errors");
await browser.close();
