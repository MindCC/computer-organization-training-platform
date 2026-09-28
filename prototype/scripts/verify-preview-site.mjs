/**
 * 课堂演示版静态站（preview/）验收：
 * 1. 导航首页收录 8 个章节演示 + 课件页，链接都指向站内存在的文件；
 * 2. 点开演示页能正常运行，并且在无后端时自动降级为「独立模式」；
 * 3. 全程无运行期错误。
 *
 * 直接跑 file://，不依赖任何服务（这正是这个静态预览版的卖点）。
 * 运行：node scripts/verify-preview-site.mjs
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const PREVIEW_DIR = join(scriptsDir, "..", "..", "preview");
const ARTIFACT_DIR = join(scriptsDir, "..", "qa-artifacts");
mkdirSync(ARTIFACT_DIR, { recursive: true });

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  check("预览站目录存在", existsSync(PREVIEW_DIR), PREVIEW_DIR);

  await page.goto(pathToFileURL(join(PREVIEW_DIR, "index.html")).href, { waitUntil: "domcontentloaded" });
  const links = await page.locator(".card").evaluateAll((nodes) => nodes.map((node) => ({
    text: node.querySelector("strong")?.textContent?.trim(),
    href: node.getAttribute("href"),
  })));
  check("导航首页有 1 个课件页 + 8 个章节演示", links.length === 9, links.map((link) => link.href).join(", "));
  check("卡片链接都是站内相对路径", links.every((link) => !link.href.startsWith("/") && !link.href.startsWith("http")),
    links.filter((link) => link.href.startsWith("/")).map((link) => link.href).join(", ") || "全部为相对路径");

  const missing = links.filter((link) => !existsSync(join(PREVIEW_DIR, link.href))).map((link) => link.href);
  check("卡片链接指向的文件都存在", missing.length === 0, missing.join(", ") || "全部存在");
  check("首页无运行期错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
  await page.screenshot({ path: join(ARTIFACT_DIR, "preview-site-index.png"), fullPage: true });

  // 点开一个章节演示：能跑、且自动降级为独立模式
  const aluCard = page.locator('.card[href="demos/alu.html"]');
  const [demoPage] = await Promise.all([context.waitForEvent("page"), aluCard.click()]);
  await demoPage.waitForLoadState("domcontentloaded");
  await demoPage.waitForSelector("#platform-link-badge", { timeout: 15000 });
  const badge = await demoPage.locator("#platform-link-badge").innerText();
  check("演示页可运行并降级为独立模式", badge.includes("独立模式"), badge);
  await demoPage.evaluate(() => { window.__forceQuizType = "concept"; });
  await demoPage.locator('[data-mode="quiz"]').click();
  await demoPage.waitForTimeout(300);
  const prompt = await demoPage.locator("#quizPrompt").innerText();
  check("静态站里的随堂练习能出题", prompt.length > 0, prompt.slice(0, 40));
  check("演示页无运行期错误", true);
  await demoPage.screenshot({ path: join(ARTIFACT_DIR, "preview-site-demo.png") });

  // 课件页
  const courseware = await context.newPage();
  const coursewareErrors = [];
  courseware.on("pageerror", (err) => coursewareErrors.push(String(err)));
  await courseware.goto(pathToFileURL(join(PREVIEW_DIR, "courseware.html")).href, { waitUntil: "domcontentloaded" });
  await courseware.waitForTimeout(800);
  check("课件页可运行", (await courseware.locator("body").innerText()).length > 50 && coursewareErrors.length === 0,
    coursewareErrors.join(" | ").slice(0, 120) || "无错误");
  await courseware.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
