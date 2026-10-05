/**
 * 电路实验室「挑战路径」E2E 回归（2026-09-28）：
 *
 * 1. 挑战路径按教材章节排列，编号 1..18 连续不跳号（此前用的是关卡数组下标，
 *    界面按章节分组显示，于是出现 1、2、12、5、4、3 这种跳号）；
 * 2. 未解锁 ≠ 打不开：锁定的关卡照样能进去练习，只是提交检测被拦下并说明还差哪一关
 *    （教师设置里写的是「未完成前置关卡时不能提交后续关卡」，不是「不能进入」）。
 *
 * 前置：API(8787) 与 Vite(5173) 已启动，演示班级已 seed。
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { clickTopNavItem } from "./nav-helpers.mjs";
import { fileURLToPath } from "node:url";
import { COURSE_CHAPTERS } from "../src/courseChapters.js";
import { CHALLENGES, challengeOrderOf } from "../src/platformLogic.js";
import { openChallengeFromHome } from "./lib/qaHome.mjs";

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
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  // 登录（一键演示账号）并进入实验台
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForSelector(".login-portal", { timeout: 10000 });
  await page.locator(".demo-login-button").click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });
  await openChallengeFromHome(page, "存储器与地址访问");
  await page.waitForSelector(".lab-studio", { timeout: 20000 });
  await page.waitForTimeout(900);

  // 挑战路径章节默认收起（新交互），先「全展开」再读取全部 18 关步骤
  await page.locator(".route-fold-btn", { hasText: "全展开" }).click();
  await page.waitForTimeout(400);

  // 1. 编号连续 + 顺序与章节一致
  const steps = await page.locator(".lab-studio-step").evaluateAll((nodes) => nodes.map((node) => ({
    num: Number(node.querySelector(".lab-studio-step-number")?.textContent?.trim()),
    title: node.querySelector("strong")?.textContent?.trim(),
    score: node.querySelector(".lab-studio-step-score")?.textContent?.trim(),
    locked: node.className.includes("locked"),
    disabled: node.disabled,
  })));
  check("挑战路径共 18 关", steps.length === CHALLENGES.length, `实际 ${steps.length}`);
  check("编号 1..18 连续不跳号",
    steps.every((step, index) => step.num === index + 1),
    steps.map((step) => step.num).join(","));
  check("编号与章节顺序一致",
    steps.every((step, index) => step.title === CHALLENGES[index].title),
    `第 1 关 ${steps[0]?.title} / 第 18 关 ${steps.at(-1)?.title}`);
  check("最后一关编号等于关卡总数", steps.at(-1)?.num === CHALLENGES.length && steps.at(-1)?.title === "I/O 数据传送");

  const groupTitles = await page.locator(".lab-studio-step-chapter strong").allTextContents();
  check("章节分组按教材顺序且无重复",
    groupTitles.length === COURSE_CHAPTERS.length && groupTitles.every((title, index) => title === COURSE_CHAPTERS[index].title),
    groupTitles.join(" | "));

  // 2. 每一关都能点开（未解锁也不能禁用）
  const disabledSteps = steps.filter((step) => step.disabled);
  check("没有任何关卡被禁用", disabledSteps.length === 0, disabledSteps.map((step) => step.title).join(" | ") || "无");

  // 3. 未解锁关卡：能进去练习，但提交被拦下
  const lockedIndex = steps.findIndex((step) => step.locked);
  check("演示学情里存在未解锁关卡用于验证", lockedIndex >= 0);
  if (lockedIndex >= 0) {
    await page.locator(".lab-studio-step").nth(lockedIndex).click();
    await page.waitForTimeout(700);
    const current = await page.locator(".lab-studio-current").innerText();
    const notice = page.locator(".lab-studio-locked-notice");
    const noticeText = await notice.innerText().catch(() => "");
    check("未解锁关卡可以进入实验台", current.includes(steps[lockedIndex].title) && current.includes("未解锁"), current.replace(/\n/g, " | "));
    check("未解锁关卡显示解锁提示并说明前置关卡", await notice.isVisible() && noticeText.includes("尚未解锁") && noticeText.includes("请先完成"), noticeText.replace(/\n/g, " "));
    check("未解锁关卡提交检测被禁用", await page.getByRole("button", { name: "提交检测" }).isDisabled());
    check("未解锁关卡仍可练习（画布渲染出元件）", await page.locator(".react-flow__node").count() > 0);
    await page.screenshot({ path: `${ARTIFACT_DIR}/lab-locked-practice.png` });
  }

  // 4. 已解锁的评分型关卡：无解锁提示，提交可用
  // （参与型关卡用的是 3D 探索实验台，没有「提交检测」按钮，所以跳过）
  const doneIndex = steps.findIndex((step) => !step.locked && step.score !== "参与型");
  check("演示学情里存在已解锁的评分型关卡用于对照", doneIndex >= 0);
  if (doneIndex >= 0) {
    await page.locator(".lab-studio-step").nth(doneIndex).click();
    await page.waitForTimeout(700);
    check("已解锁关卡不显示解锁提示", await page.locator(".lab-studio-locked-notice").count() === 0, steps[doneIndex].title);
    check("已解锁关卡提交检测可用", !(await page.getByRole("button", { name: "提交检测" }).isDisabled()), steps[doneIndex].title);
  }

  // 5. 首页与学习记录里未解锁关卡同样可以进入
  await page.getByRole("button", { name: "返回课程首页" }).click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });
  const routeCards = await page.locator(".route-card, button.project-experiment-row").evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent, disabled: node.disabled })));
  check("课程首页没有不可进入的关卡卡片", routeCards.every((card) => !card.disabled),
    routeCards.filter((card) => card.disabled).map((card) => card.text.slice(0, 20)).join(" | ") || "无");

  await clickTopNavItem(page, "学习记录");
  await page.waitForSelector(".records-screen", { timeout: 15000 });
  const recordRows = await page.locator(".record-row").evaluateAll((nodes) => nodes.map((node) => node.disabled));
  check("学习记录明细里未解锁关卡也能点开", recordRows.every((disabled) => !disabled));

  check("全程无运行期错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
