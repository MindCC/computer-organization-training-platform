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
await assertCount(page, "[aria-label='信号状态']", 1);
await assertCount(page, ".signal-badge", 3);

await dropPaletteComponent(page, "异或门1", 0.28, 0.34, 0);
await assertCountAtLeast(page, ".floating-component", 1);
await assertCountAtLeast(page, ".placement-slot.matched", 1);
await assertVisible(page, "拖动元件");
await dragPlacedComponentByHandle(page, page.locator(".floating-component").first(), page.locator(".component-drag-handle").first(), 180, 42);
await beginWireDrag(page, page.locator(".lab-anchor.input").first());
await hoverWireTarget(page, page.locator(".floating-pin").first());
await assertVisible(page, "目标端点");
await page.mouse.up();
await waitForCountAtLeast(page, ".connection-chip.removable", 1);
await clickFirstConnectionChip(page);
await waitForCount(page, ".connection-chip.removable", 0);
await dragWireBetween(page, page.locator(".lab-anchor.input").first(), page.locator(".floating-pin").first());
await waitForCountAtLeast(page, ".connection-chip.removable", 1);
const placedId = await page.locator(".floating-component").first().getAttribute("data-component-id");
assert.ok(placedId, "placed component id should exist");
await movePlacedComponent(page, placedId, "异或门1", 0, 0.72, 0.34);

await page.getByRole("button", { name: "单步演示" }).click();
await page.getByRole("button", { name: "提交检测" }).click();
await assertCountAtLeast(page, ".canvas-issue-marker", 1);
await assertVisible(page, "元件未就位");
await page.screenshot({ path: artifactPath("desktop-lab-issues.png"), fullPage: true });
await page.getByRole("button", { name: "查看参考结构" }).click();
await assertCountAtLeast(page, ".connection-signal-label", 5);
await clickFirstCanvasConnection(page);
await waitForCount(page, ".connection-chip.removable", 4);
await page.getByRole("button", { name: "查看参考结构" }).click();
await waitForCount(page, ".connection-chip.removable", 5);
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

async function waitForCount(targetPage, selector, count) {
  await targetPage.waitForFunction(
    ({ selector, count }) => document.querySelectorAll(selector).length === count,
    { selector, count },
  );
  await assertCount(targetPage, selector, count);
}

async function waitForCountAtLeast(targetPage, selector, count) {
  await targetPage.waitForFunction(
    ({ selector, count }) => document.querySelectorAll(selector).length >= count,
    { selector, count },
  );
  await assertCountAtLeast(targetPage, selector, count);
}

async function clickFirstConnectionChip(targetPage) {
  const clicked = await targetPage.evaluate(() => {
    const chip = document.querySelector(".connection-chip.removable");
    if (!chip) return false;
    chip.click();
    return true;
  });
  assert.equal(clicked, true, "first removable connection chip should exist");
}

async function clickFirstCanvasConnection(targetPage) {
  const clicked = await targetPage.evaluate(() => {
    const hitTarget = document.querySelector(".canvas-wire-hit-target");
    if (!hitTarget) return false;

    const rect = hitTarget.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const target = document.elementFromPoint(clientX, clientY);
    if (!target?.classList?.contains("canvas-wire-hit-target")) return false;
    target.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
    }));
    return true;
  });

  assert.equal(clicked, true, "first canvas connection should be directly clickable");
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

async function dragWireBetween(targetPage, fromLocator, toLocator) {
  const fromBox = await fromLocator.boundingBox();
  const toBox = await toLocator.boundingBox();

  assert.ok(fromBox, "wire drag start target should exist");
  assert.ok(toBox, "wire drag end target should exist");

  await targetPage.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await targetPage.mouse.down();
  await targetPage.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 10 });
  await targetPage.mouse.up();
}

async function beginWireDrag(targetPage, fromLocator) {
  const fromBox = await fromLocator.boundingBox();
  assert.ok(fromBox, "wire drag start target should exist");
  await targetPage.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await targetPage.mouse.down();
}

async function hoverWireTarget(targetPage, toLocator) {
  const toBox = await toLocator.boundingBox();
  assert.ok(toBox, "wire drag hover target should exist");
  await targetPage.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 10 });
}

async function dragPlacedComponentByHandle(targetPage, componentLocator, handleLocator, offsetX, offsetY) {
  const before = await componentLocator.getAttribute("style");
  const handleBox = await handleLocator.boundingBox();
  assert.ok(handleBox, "component drag handle should exist");
  await targetPage.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await targetPage.mouse.down();
  await targetPage.mouse.move(handleBox.x + handleBox.width / 2 + offsetX, handleBox.y + handleBox.height / 2 + offsetY, { steps: 12 });
  await targetPage.mouse.up();
  await targetPage.waitForTimeout(300);
  const after = await componentLocator.getAttribute("style");
  assert.notEqual(after, before, "placed component should move after dragging the handle");
}

function artifactPath(fileName) {
  return fileURLToPath(new URL(fileName, artifactDirUrl));
}
