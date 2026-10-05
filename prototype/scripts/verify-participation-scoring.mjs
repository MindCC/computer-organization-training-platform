/**
 * 参与型关卡计分口径 E2E 回归（2026-09-28）：
 * 「认识计算机五大部件」这类引导探索关卡服务端只记 passed: true + score: 0，
 * 这个 0 表示"不计分"，不是"考了 0 分"。展示层与统计口径都必须按参与型处理：
 *
 * 1. 学习记录明细里参与型关卡显示「参与型」而不是「0 分」；
 * 2. 没有提交记录的评分型关卡显示「—」而不是「0 分」；
 * 3. 大屏平均分与后端 summary.averageScore 一致，且等于「已完成评分型关卡」的均值；
 * 4. 实验台里参与型关卡不显示「得分 0 / 100」。
 *
 * 前置：API(8787) 与 Vite(5173) 已启动，演示班级已 seed。
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LEARNING_ITEMS } from "../src/platformLogic.js";
import { clickTopNavItem } from "./nav-helpers.mjs";

const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";
const API_URL = process.env.QA_API_URL ?? "http://127.0.0.1:8787";
const ARTIFACT_DIR = fileURLToPath(new URL("../qa-artifacts/", import.meta.url));
mkdirSync(ARTIFACT_DIR, { recursive: true });

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** 参与型（不计分）关卡的 id 集合，来自单一来源 platformLogic 的 grading 字段。 */
const PARTICIPATION_IDS = new Set(LEARNING_ITEMS.filter((item) => item.grading === "participation").map((item) => item.id));
const SCORED_IDS = new Set(LEARNING_ITEMS.filter((item) => item.grading !== "participation").map((item) => item.id));

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  // 登录（一键演示账号）
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForSelector(".login-portal", { timeout: 10000 });
  await page.locator(".demo-login-button").click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });

  // 1. 后端 summary 的平均分口径
  const apiBody = await (await page.request.get(`${API_URL}/api/student/progress`)).json();
  const progress = apiBody.progress ?? {};
  const completedScored = LEARNING_ITEMS.filter((item) => item.grading !== "participation" && progress[item.id]?.status === "completed");
  const expectedAverage = completedScored.length
    ? Math.round(completedScored.reduce((sum, item) => sum + Number(progress[item.id]?.bestScore ?? 0), 0) / completedScored.length)
    : 0;
  check("后端平均分只统计已完成评分型关卡", apiBody.summary?.averageScore === expectedAverage,
    `summary=${apiBody.summary?.averageScore} 期望=${expectedAverage} 已完成评分型=${completedScored.length}`);
  check("后端参与型关卡不会以 0 分混入平均分", apiBody.summary?.averageScore > 0 || completedScored.length === 0,
    `averageScore=${apiBody.summary?.averageScore}`);

  // 2. 学习记录明细
  await clickTopNavItem(page, "学习记录");
  await page.waitForSelector(".records-screen", { timeout: 15000 });
  const rows = await page.locator(".record-row").evaluateAll((nodes) => nodes.map((node) => {
    const cells = [...node.querySelectorAll(":scope > *")].map((cell) => cell.textContent.trim());
    return { title: cells[0], status: cells[1], attempts: cells[2], score: cells[3] };
  }));

  const participationRows = rows.filter((row) => PARTICIPATION_IDS.has(LEARNING_ITEMS.find((item) => item.title === row.title)?.id));
  check("记录明细里参与型关卡全部显示「参与型」",
    participationRows.length > 0 && participationRows.every((row) => row.score === "参与型"),
    participationRows.map((row) => `${row.title}=${row.score}`).join(" | "));

  const zeroScoreRows = rows.filter((row) => row.score === "0 分" && Number.parseInt(row.attempts, 10) === 0);
  check("没有提交记录的关卡不会显示 0 分", zeroScoreRows.length === 0,
    zeroScoreRows.map((row) => `${row.title}(${row.status}, ${row.attempts})`).join(" | ") || "无");

  const scoredRows = rows.filter((row) => SCORED_IDS.has(LEARNING_ITEMS.find((item) => item.title === row.title)?.id));
  check("评分型关卡仍然照常显示分数",
    scoredRows.filter((row) => row.status === "已完成").every((row) => /^\d+ 分$/.test(row.score)),
    scoredRows.filter((row) => row.status === "已完成").map((row) => `${row.title}=${row.score}`).join(" | "));

  // 3. 大屏 KPI 与后端一致
  const screenText = await page.locator(".records-screen").innerText();
  const kpiMatch = screenText.match(/平均得分\s*\n?\s*(\d+)/);
  check("大屏平均得分与后端 summary 一致", kpiMatch && Number(kpiMatch[1]) === expectedAverage,
    `大屏=${kpiMatch?.[1]} 后端=${expectedAverage}`);
  check("大屏说明写明参与型不计分", screenText.includes("参与型不计分"));
  check("关卡明细说明写明参与型不计分", screenText.includes("完成即通过，不计分"));
  await page.locator(".record-chapter").first().screenshot({ path: `${ARTIFACT_DIR}/participation-records.png` });

  // 4. 实验台：参与型关卡不显示得分 0 / 100
  await clickTopNavItem(page, "课程首页");
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });
  const ch4 = page.locator(".project-chapter-toggle", { hasText: "第 4 章" });
  await ch4.click();
  await page.waitForTimeout(300);
  await page.locator(".project-chapter", { has: ch4 }).locator(".project-experiment-row").filter({ hasText: "存储器" }).first().click();
  await page.waitForSelector(".lab-studio", { timeout: 20000 });
  await page.waitForTimeout(800);
  const scoreCard = await page.locator(".lab-studio-score").innerText();
  check("实验台参与型关卡显示计分方式而不是得分", scoreCard.includes("参与型") && !scoreCard.includes("0"), scoreCard.replace(/\n/g, " | "));
  const recent = await page.locator(".lab-studio-inspector section").nth(1).innerText();
  check("实验台实时状态不把参与型显示成 0 分", recent.includes("参与型"), recent.replace(/\n/g, " | "));
  const stepScores = await page.locator(".lab-studio-step").evaluateAll((nodes) => nodes.map((node) => ({
    title: node.querySelector("strong")?.textContent?.trim(),
    score: node.querySelector(".lab-studio-step-score")?.textContent?.trim(),
  })));
  const participationSteps = stepScores.filter((step) => {
    const item = LEARNING_ITEMS.find((entry) => entry.title === step.title);
    return item && PARTICIPATION_IDS.has(item.id);
  });
  check("挑战路径里参与型关卡不显示 0 / 100",
    participationSteps.length > 0 && participationSteps.every((step) => step.score === "参与型"),
    participationSteps.map((step) => `${step.title}=${step.score}`).join(" | "));

  check("全程无运行期错误", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
