/**
 * 章节化实验与入口回归（2026-09-19）：
 * 1. 学生侧边导航不再有「关卡实验」入口；
 * 2. 课程首页按教材八章展示实验，第六/七/八章各有新实验；
 * 3. 从首页章节卡片可进入实验台，实验台挑战路径同样按章节分组。
 *
 * 运行：node scripts/verify-chapter-labs.mjs
 * 前置：API(8787) 与 Vite(5173) 已启动，且已 seed 演示班级（demo2026001 / Student123!）。
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

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.locator("#login-username").fill("demo2026001");
  await page.locator("#login-password").fill("Student123!");
  await page.locator(".login-submit").click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });

  // 1. 侧边导航不再出现「关卡实验」
  const navLabels = await page.locator(".sidebar-nav .nav-item").allTextContents();
  check("侧边导航无「关卡实验」入口", !navLabels.some((label) => label.includes("关卡实验")), navLabels.join("/"));

  // 2. 章节板覆盖八章
  const chapterToggles = page.locator(".project-chapter-toggle");
  const chapterCount = await chapterToggles.count();
  check("课程首页展示八个章节", chapterCount === 8, `实际 ${chapterCount} 章`);

  const chapterTexts = await chapterToggles.allTextContents();
  check(
    "章节顺序与教材一致",
    [1, 2, 3, 4, 5, 6, 7, 8].every((n, i) => chapterTexts[i]?.includes(`第 ${n} 章`)),
    chapterTexts.map((text) => text.trim().slice(0, 12)).join(" | "),
  );

  // 3. 第六/七/八章各包含新实验
  const expected = [
    { chapter: "第 6 章", title: "CPU 数据通路" },
    { chapter: "第 7 章", title: "三总线协作" },
    { chapter: "第 8 章", title: "I/O 数据传送" },
  ];
  for (const item of expected) {
    const toggle = page.locator(".project-chapter-toggle", { hasText: item.chapter });
    await toggle.click();
    const chapter = page.locator(".project-chapter", { has: toggle });
    const visible = await chapter.locator(".project-experiment-row", { hasText: item.title }).count();
    check(`${item.chapter}包含实验「${item.title}」`, visible > 0);
  }

  await page.screenshot({ path: `${ARTIFACT_DIR}/chapter-home.png`, fullPage: true });

  // 4. 从第三章章节卡片进入「认识数据流」实验
  await page.locator(".project-chapter-toggle", { hasText: "第 3 章" }).click();
  await page.locator(".project-experiment-row", { hasText: "认识数据流" }).first().click();
  await page.waitForSelector(".lab-studio", { timeout: 15000 });
  await page.waitForSelector(".react-flow", { timeout: 20000 });
  check("从课程首页章节卡片进入实验台", true);

  // 5. 实验台挑战路径按章节分组
  const stepChapters = await page.locator(".lab-studio-step-chapter").allTextContents();
  check(
    "实验台挑战路径按章节分组",
    stepChapters.length === 8 && stepChapters.some((text) => text.includes("第六章")) && stepChapters.some((text) => text.includes("第八章")),
    stepChapters.join(" | "),
  );

  // 6. 新实验也在实验台步骤条中注册
  const stepperText = await page.locator(".lab-studio-stepper").innerText();
  check(
    "步骤条注册三个新实验",
    ["CPU 数据通路", "三总线协作", "I/O 数据传送"].every((title) => stepperText.includes(title)),
  );

  await page.screenshot({ path: `${ARTIFACT_DIR}/chapter-lab.png`, fullPage: false });
  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
