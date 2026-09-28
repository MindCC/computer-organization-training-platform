/**
 * 首页章节板课堂演示入口 E2E 回归（2026-09-28）：
 * 学生从课程首页进入时，每一章展开后除小实验外，还应列出该章的课堂演示页
 * （courseware `demos` 字段派生），点击在新标签打开演示页并连接学情。
 *
 * 前置：API(8787) 与 Vite(5173) 已启动，演示班级已 seed。
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";
const ARTIFACT_DIR = fileURLToPath(new URL("../qa-artifacts/", import.meta.url));
mkdirSync(ARTIFACT_DIR, { recursive: true });

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** 章节号 → 该章课堂演示页 href（与 courseware.js demos 一致） */
const EXPECTED_DEMOS = {
  "第 2 章": ["/demos/twos-complement.html", "/demos/arithmetic-basics.html"],
  "第 4 章": ["/demos/memory-system.html"],
  "第 5 章": ["/demos/addressing.html"],
  "第 6 章": ["/demos/cpu.html"],
  "第 7 章": ["/demos/bus.html"],
  "第 8 章": ["/demos/io.html"],
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  // 登录（一键演示账号）
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForSelector(".login-portal", { timeout: 10000 });
  await page.locator(".demo-login-button").click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });
  check("登录后进入课程首页章节板", await page.locator(".project-chapter-toggle").count() === 8);

  // 逐章展开，核对演示入口数量与 href
  for (const [chapterLabel, hrefs] of Object.entries(EXPECTED_DEMOS)) {
    const toggle = page.locator(".project-chapter-toggle", { hasText: chapterLabel });
    const board = page.locator(".project-chapter", { has: toggle });
    await toggle.click();
    await page.waitForTimeout(250);
    const entries = board.locator("a.demo-entry");
    const count = await entries.count();
    const found = [];
    for (let i = 0; i < count; i++) found.push(await entries.nth(i).getAttribute("href"));
    const matched = hrefs.every((href) => found.includes(href));
    check(`${chapterLabel} 展开后列出课堂演示入口`, matched && count === hrefs.length, `expect=${hrefs.join(",")} got=${found.join(",") || "无"}`);
    for (let i = 0; i < count; i++) {
      const visible = await entries.nth(i).isVisible();
      const target = await entries.nth(i).getAttribute("target");
      if (!visible || target !== "_blank") check(`${chapterLabel} 第 ${i + 1} 个演示入口可点`, false, `visible=${visible} target=${target}`);
    }
    await toggle.click(); // 收起，避免影响后续章节定位
    await page.waitForTimeout(150);
  }

  // 点击第五章演示入口 → 新标签打开且徽标已连接学情
  const ch5Toggle = page.locator(".project-chapter-toggle", { hasText: "第 5 章" });
  await ch5Toggle.click();
  await page.waitForTimeout(250);
  const ch5Demo = page.locator(".project-chapter", { has: ch5Toggle }).locator("a.demo-entry[href='/demos/addressing.html']");
  check("首页 ch5 演示入口可见", await ch5Demo.isVisible());
  await ch5Demo.scrollIntoViewIfNeeded();
  const [demoPage] = await Promise.all([context.waitForEvent("page"), ch5Demo.click()]);
  await demoPage.waitForLoadState("domcontentloaded");
  await demoPage.waitForSelector("#platform-link-badge", { timeout: 15000 });
  const badge = await demoPage.locator("#platform-link-badge").innerText();
  check("从首页点开的演示页连接学情", badge.includes("已连接学情"), badge);

  await page.screenshot({ path: `${ARTIFACT_DIR}/home-demo-entries.png`, fullPage: true });
  check("首页无运行期错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));

  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
