import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.PROTOTYPE_URL ?? "http://127.0.0.1:4173";
const defaultArtifactDirUrl = new URL("../qa-artifacts/", import.meta.url);
const artifactDir = process.env.QA_ARTIFACT_DIR
  ? path.resolve(process.env.QA_ARTIFACT_DIR)
  : fileURLToPath(defaultArtifactDirUrl);
const artifactDirUrl = new URL(`file:///${artifactDir.replace(/\\/g, "/")}${artifactDir.endsWith("\\") ? "" : "/"}`);

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
await assertMissing(page, "陈一鸣，继续把运算器拼起来。");
await page.screenshot({ path: artifactPath("desktop-home.png"), fullPage: true });

await page.getByRole("button", { name: /从当前关卡继续/ }).click();
await assertCount(page, ".lab-screen", 1);
await assertCount(page, ".lab-dropzone", 1);
await assertVisible(page, "可视化实验台");
await assertCountAtLeast(page, ".placement-slot", 3);

await dropPaletteComponent(page, "异或门1", 0.28, 0.34, 0);
await assertCountAtLeast(page, ".floating-component", 1);
await assertCountAtLeast(page, ".placement-slot.matched", 1);
await page.locator(".lab-anchor.input").first().click();
await page.locator(".floating-pin").first().click();
await assertCountAtLeast(page, ".connection-chip", 1);
const placedId = await page.locator(".floating-component").first().getAttribute("data-component-id");
assert.ok(placedId, "placed component id should exist");
await movePlacedComponent(page, placedId, "异或门1", 0, 0.72, 0.34);

await page.getByRole("button", { name: "单步演示" }).click();
await page.getByRole("button", { name: "查看参考结构" }).click();
await page.getByRole("button", { name: "提交检测" }).click();
await assertVisible(page, "本关通过");
await page.screenshot({ path: artifactPath("desktop-lab-pass.png"), fullPage: true });

await page.getByRole("button", { name: /返回课程首页/ }).click();
await page.getByRole("button", { name: /认识数据流/ }).first().click();
await assertVisible(page, "信号直通");
await assertCount(page, ".input-board .toggle-control", 1);
await page.screenshot({ path: artifactPath("desktop-lab-data-flow.png"), fullPage: true });

await page.getByRole("button", { name: /返回课程首页/ }).click();
await page.getByRole("button", { name: /多位加法器/ }).first().click();
await assertVisible(page, "级联传播");
await assertCount(page, ".input-board .toggle-control", 3);
await page.screenshot({ path: artifactPath("desktop-lab-multi-adder.png"), fullPage: true });

await page.getByRole("button", { name: /返回课程首页/ }).click();
await page.getByRole("button", { name: "学习记录", exact: true }).click();
await assertVisible(page, "个人学情记录");
await assertVisible(page, "累计学习");
await page.screenshot({ path: artifactPath("desktop-records.png"), fullPage: true });

await page.getByRole("button", { name: /学习笔记/ }).click();
await assertVisible(page, "把实验复盘沉淀下来。");
await page.getByLabel("笔记内容").fill("我理解了进位会从低位传到高位。");
await page.getByRole("button", { name: "保存笔记" }).click();
await assertVisible(page, "我理解了进位会从低位传到高位。");

await page.getByRole("button", { name: /学习档案/ }).click();
await page.getByRole("button", { name: "个人设置" }).click();
await page.getByLabel("姓名").fill("李同学");
await page.getByRole("button", { name: "保存设置" }).click();
await assertVisible(page, "个人设置已更新。");

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

async function assertMissing(targetPage, text) {
  assert.equal(await targetPage.getByText(text, { exact: false }).count(), 0);
}

async function assertCount(targetPage, selector, count) {
  assert.equal(await targetPage.locator(selector).count(), count);
}

async function assertCountAtLeast(targetPage, selector, count) {
  assert.ok((await targetPage.locator(selector).count()) >= count, `${selector} count should be >= ${count}`);
}

async function dropPaletteComponent(targetPage, componentName, xRatio, yRatio, sourceIndex = 0) {
  await targetPage.evaluate(({ componentName, xRatio, yRatio, sourceIndex }) => {
    const target = document.querySelector(".lab-dropzone");
    const rect = target.getBoundingClientRect();
    const data = new DataTransfer();
    data.setData("application/json", JSON.stringify({
      source: "palette",
      name: componentName,
      displayLabel: componentName,
      sourceIndex,
    }));
    data.setData("text/plain", componentName);
    const event = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width * xRatio,
      clientY: rect.top + rect.height * yRatio,
      dataTransfer: data,
    });
    target.dispatchEvent(event);
  }, { componentName, xRatio, yRatio, sourceIndex });
}

async function movePlacedComponent(targetPage, id, name, sourceIndex, xRatio, yRatio) {
  await targetPage.evaluate(({ id, name, sourceIndex, xRatio, yRatio }) => {
    const target = document.querySelector(".lab-dropzone");
    const rect = target.getBoundingClientRect();
    const data = new DataTransfer();
    data.setData("application/json", JSON.stringify({ source: "canvas", id, name, displayLabel: name, sourceIndex }));
    data.setData("text/plain", name);
    const event = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width * xRatio,
      clientY: rect.top + rect.height * yRatio,
      dataTransfer: data,
    });
    target.dispatchEvent(event);
  }, { id, name, sourceIndex, xRatio, yRatio });
}

function artifactPath(fileName) {
  return fileURLToPath(new URL(fileName, artifactDirUrl));
}
