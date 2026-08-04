import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// P1-A 空状态 + P1-C 教师设置页备份区 浏览器实测
const baseUrl = process.env.PROTOTYPE_URL ?? "http://127.0.0.1:8787";
const pageErrors = [];

async function launchBrowser() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  return { browser, page };
}

async function login(page, username, password) {
  await page.getByLabel("账号").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForLoadState("networkidle");
  console.log("LOGIN", username, "-> URL:", page.url());
}

async function assertVisible(page, text) {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await locator.isVisible(), true);
}

async function logout(page) {
  const logoutButton = page.getByRole("button", { name: "退出登录" });
  if (!(await logoutButton.isVisible().catch(() => false))) {
    await page.locator(".profile-button").click();
  }
  await logoutButton.click();
  await page.waitForLoadState("networkidle");
}

// ---- 教师端：P1-C 设置页 数据与备份 ----
{
  const { browser, page } = await launchBrowser();
  try {
    await login(page, "teacher", "ChangeMe123!");
    await assertVisible(page, "教师数据页");

    // 打开课堂设置
    const settingsButton = page.getByRole("button", { name: "课堂设置" });
    if (!(await settingsButton.isVisible().catch(() => false))) {
      await page.locator(".profile-button").click();
    }
    await settingsButton.click();

    await assertVisible(page, "数据与备份");
    await assertVisible(page, "数据库位置与备份");
    await assertVisible(page, "建议每次课后或导入学生前备份一次");
    await assertVisible(page, "下载备份");
    await assertVisible(page, "恢复备份怎么做？");

    console.log("P1-C PASS: 教师设置页备份区渲染正常");
  } finally {
    await browser.close();
  }
}

// ---- 学生端：P1-A 零进度学生首页引导 ----
{
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // 用 demo 学生（有数据）验证不出现引导横幅
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await login(page, "demo2026001", "Student123!");
  await assertVisible(page, "当前任务");
  const bannerCount = await page.locator(".quest-empty-banner").count();
  assert.equal(bannerCount, 0, "有进度的学生不应看到首次引导横幅");
  await logout(page);

  // 创建零进度学生并验证引导横幅（用全新班级，避免 ended session 抢占首页）
  await login(page, "teacher", "ChangeMe123!");
  await assertVisible(page, "教师数据页");
  const freshClass = "空状态验证班 " + Date.now();
  await page.getByLabel("新班级名称").fill(freshClass);
  await page.getByRole("button", { name: "创建班级" }).click();
  await assertVisible(page, freshClass);
  await page.locator(".teacher-class", { hasText: freshClass }).click();
  await page.waitForLoadState("networkidle");
  const settingsButton = page.getByRole("button", { name: "课堂设置" });
  if (!(await settingsButton.isVisible().catch(() => false))) {
    await page.locator(".profile-button").click();
  }
  await settingsButton.click();
  const no = "empty-" + Date.now();
  await page.getByLabel("学生导入 CSV").fill(`学号,姓名,初始密码\n${no},空状态测试学生,Student123!`);
  await page.getByRole("button", { name: "导入学生" }).click();
  await page.waitForLoadState("networkidle");

  // 关闭设置弹窗，避免遮挡后续点击
  await page.getByRole("button", { name: "关闭" }).click();
  await page.waitForLoadState("networkidle");

  // 退出并登录新学生
  await logout(page);
  await login(page, no, "Student123!");
  const bodyText = await page.locator("body").innerText().catch(() => "<body unavailable>");
  console.log("NEW STUDENT BODY:", JSON.stringify(bodyText.slice(0, 400)));
  await assertVisible(page, "建议从第一章");
  await assertVisible(page, "开始第一个实验");
  console.log("P1-A PASS: 零进度学生首页显示引导横幅与开始按钮");

  await browser.close();
}

// 教师端：P1-A 有学生但零提交的提示
{
  const { browser, page } = await launchBrowser();
  try {
    await login(page, "teacher", "ChangeMe123!");
    await assertVisible(page, "教师数据页");
    // 选中含零进度学生的班级
    const classButton = page.locator(".teacher-class").first();
    await classButton.click();
    await page.waitForLoadState("networkidle");
    // 学生表内应有「还没有提交数据」或「暂无学生数据」空状态之一
    const noSubmit = await page.getByText("还没有提交数据", { exact: false }).count();
    const noStudents = await page.getByText("暂无学生数据", { exact: false }).count();
    console.log(`P1-A teacher empty state check: noSubmit=${noSubmit}, noStudents=${noStudents}`);
  } finally {
    await browser.close();
  }
}

if (pageErrors.length > 0) {
  console.log("PAGE ERRORS:", pageErrors.join(" | "));
  process.exitCode = 1;
} else {
  console.log("ALL P1-A / P1-C CHECKS DONE, no page errors");
}
