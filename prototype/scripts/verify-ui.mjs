import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.PROTOTYPE_URL ?? "http://127.0.0.1:4173";
const artifactDirUrl = new URL("../qa-artifacts/", import.meta.url);
const artifactDir = fileURLToPath(artifactDirUrl);

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

await mkdir(artifactDir, { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });

await page.goto(baseUrl, { waitUntil: "networkidle" });
await assertVisible(page, "组成原理实训平台");
await assertVisible(page, "运算器闯关路径");
await page.screenshot({ path: artifactPath("desktop-home.png"), fullPage: true });

await page.getByRole("button", { name: /进入实验台/ }).click();
await assertVisible(page, "可视化实验台");
await page.getByRole("button", { name: "单步演示" }).click();
await page.getByRole("button", { name: "查看参考结构" }).click();
await page.getByRole("button", { name: "提交检测" }).click();
await assertVisible(page, "本关通过");
await page.screenshot({ path: artifactPath("desktop-lab-pass.png"), fullPage: true });

await page.getByRole("button", { name: /学习记录/ }).click();
await assertVisible(page, "个人学情记录");
await assertVisible(page, "累计学习");
await page.screenshot({ path: artifactPath("desktop-records.png"), fullPage: true });

await page.getByRole("button", { name: /学习笔记/ }).click();
await assertVisible(page, "把实验复盘沉淀下来");
await page.getByLabel("笔记内容").fill("我理解了进位会从低位传到高位。");
await page.getByRole("button", { name: "保存笔记" }).click();
await assertVisible(page, "我理解了进位会从低位传到高位。");

await page.getByRole("button", { name: /陈一鸣/ }).click();
await page.getByRole("button", { name: "个人设置" }).click();
await page.getByLabel("姓名").fill("李同学");
await page.getByRole("button", { name: "保存设置" }).click();
await assertVisible(page, "李同学");

await page.setViewportSize({ width: 390, height: 900 });
await page.goto(baseUrl, { waitUntil: "networkidle" });
await assertVisible(page, "课程首页");
await page.screenshot({ path: artifactPath("mobile-home.png"), fullPage: true });

await browser.close();

console.log("UI smoke check passed");

async function assertVisible(targetPage, text) {
  await targetPage.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await targetPage.getByText(text, { exact: false }).first().isVisible(), true);
}

function artifactPath(fileName) {
  return fileURLToPath(new URL(fileName, artifactDirUrl));
}
