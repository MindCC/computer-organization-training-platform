import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { fillLoginForm, submitLoginForm, gotoApp } from "./lib/qaLogin.mjs";
import { clickTopNavItem } from "./nav-helpers.mjs";

// 拍照导入错题（photo 来源）浏览器回归：
// 入口与对话框、来源筛选、裁剪图、AI 未配置时的明确提示、手动掌握、组复习卷、删除。
// AI 识别/讲解/出题链路在 server/photoMistakes.test.mjs 以 mock 覆盖；本脚本验证真实 UI 流程。
const appUrl = process.env.PROTOTYPE_URL ?? process.env.PROTOTYPE_APP_URL ?? "http://127.0.0.1:8787";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

await gotoApp(page, appUrl);
await fillLoginForm(page, { username: "qa-photo-student", password: "PhotoQa123!" });
await submitLoginForm(page);
await page.waitForTimeout(2500);

await clickTopNavItem(page, "错题本");
await page.getByRole("heading", { name: "错题本" }).first().waitFor({ state: "visible", timeout: 10_000 });
await page.waitForFunction(() => !document.body.innerText.includes("正在加载错题"), { timeout: 30_000 }).catch(() => {});
console.log("错题本 page rendered");

// 1) 头部入口：拍照导入对话框可打开；QA 环境未配置视觉模型时给出明确提示而非空按钮
await page.getByTestId("photo-import-open").click();
const dialog = page.getByRole("dialog", { name: "拍照导入错题" });
await dialog.waitFor({ state: "visible", timeout: 5_000 });
await dialog.getByText(/拍照识别尚未配置视觉模型/).waitFor({ state: "visible", timeout: 10_000 });
assert.equal(await dialog.getByRole("button", { name: "开始识别" }).count(), 0, "未配置视觉模型时不应出现识别按钮");
await dialog.getByRole("button", { name: "关闭" }).click();
await dialog.waitFor({ state: "hidden", timeout: 5_000 });
console.log("1 拍照导入对话框与未配置提示正常");

// 2) 来源筛选到拍照导入：两条种子错题、裁剪图
await page.getByRole("button", { name: /拍照导入 · 2/ }).click();
const photoCards = page.locator('.mistake-group[data-source="photo"]');
await photoCards.first().waitFor({ state: "visible", timeout: 10_000 });
assert.equal(await photoCards.count(), 2, "应有两条拍照错题");
const clips = await page.locator('.mistake-group[data-source="photo"] .photo-tools-image').evaluateAll((els) => els.map((el) => el.style.clipPath));
assert.ok(clips.some((value) => /^inset\(10(\.0)?% 5(\.0)?% 55(\.0)?%( 5(\.0)?%)?\)$/.test(value)), `带 box 的题应按坐标裁剪照片，实际：${JSON.stringify(clips)}`);
assert.ok(clips.includes(""), "无 box 的题应展示整张照片");
console.log("2 来源筛选与裁剪图正常");

// 3) 讲错因：同意后可生成，QA 环境未配置 AI 时给出明确提示而非静默失败
await photoCards.first().getByRole("button", { name: "讲错因" }).click();
await photoCards.first().getByText(/生成讲解时会把这道题的题干与我的作答发送给课程 AI/).click();
await photoCards.first().getByRole("button", { name: "生成错因讲解" }).click();
await photoCards.first().locator(".form-error").waitFor({ state: "visible", timeout: 15_000 });
assert.match(await photoCards.first().locator(".form-error").innerText(), /课程 AI 未配置/);
console.log("3 讲错因未配置提示正常");

// 4) 出同类题：未勾选同意时按钮禁用，勾选后请求并提示未配置
await photoCards.first().getByRole("button", { name: "出同类题" }).click();
const generateButton = photoCards.first().getByRole("button", { name: "生成同类题" });
assert.equal(await generateButton.isDisabled(), true, "未同意时不能生成同类题");
await photoCards.first().getByText(/出题时会把这道题的题干与知识点发送给课程 AI/).click();
await generateButton.click();
await photoCards.first().locator(".form-error").last().waitFor({ state: "visible", timeout: 15_000 });
assert.match(await photoCards.first().locator(".form-error").last().innerText(), /课程 AI 未配置/);
console.log("4 同类题同意门与未配置提示正常");

// 5) 手动掌握：第一题标记后进入已订正，「只看待巩固」只剩第二题
await photoCards.first().getByRole("button", { name: "手动标为「已掌握」" }).click();
await page.waitForFunction(() => document.body.innerText.includes("已订正"), { timeout: 15_000 });
await page.getByRole("button", { name: "只看待巩固" }).click();
await page.waitForTimeout(800);
assert.equal(await page.locator('.mistake-group[data-source="photo"]').count(), 1, "只看待巩固应隐藏已掌握错题");
await page.getByRole("button", { name: "只看待巩固" }).click();
await page.waitForTimeout(500);
console.log("5 手动掌握切换正常");

// 6) 组复习卷：勾选两题生成打印预览（含答案册与打印节点）
await page.getByTestId("review-paper-toggle").click();
const checkboxes = page.getByTestId("paper-select");
assert.equal(await checkboxes.count(), 2, "两道拍照错题都应可组卷");
await checkboxes.nth(0).click();
await checkboxes.nth(1).click();
await page.getByTestId("review-paper-open").click();
const paperDialog = page.getByRole("dialog", { name: "错题复习卷预览" });
await paperDialog.waitFor({ state: "visible", timeout: 5_000 });
assert.equal(await paperDialog.locator(".review-paper-questions > li").count(), 2, "复习卷应含两道题");
assert.match(await paperDialog.locator(".review-paper-answers").innerText(), /参考答案与解析/);
assert.match(await paperDialog.locator(".review-paper-answers").innerText(), /-106/);
assert.equal(await page.locator("body > .review-paper-print").count(), 1, "打印节点应挂在 body 下");
await paperDialog.getByRole("button", { name: "关闭" }).click();
await paperDialog.waitFor({ state: "hidden", timeout: 5_000 });
console.log("6 组复习卷预览正常");

// 7) 删除第二题后只剩一条拍照错题
await page.locator('.mistake-group[data-source="photo"]').nth(1).getByRole("button", { name: "删除" }).click();
await page.locator('.mistake-group[data-source="photo"]').nth(1).getByRole("button", { name: "确认删除" }).click();
await page.waitForFunction(() => document.querySelectorAll('.mistake-group[data-source="photo"]').length === 1, { timeout: 15_000 });
console.log("7 删除拍照错题正常");

assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(" | ")}`);
console.log("PASS: 拍照导入错题全流程（入口/筛选/裁剪/AI 提示/掌握/组卷/删除）");
await browser.close();
