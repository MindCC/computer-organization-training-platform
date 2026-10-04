import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { gotoApp, fillLoginForm } from "./lib/qaLogin.mjs";

const base = process.env.PROTOTYPE_APP_URL ?? "http://127.0.0.1:5173/";
const artifacts = process.env.QA_ARTIFACT_DIR ?? "qa-artifacts";
await mkdir(artifacts, { recursive: true });
let browser;
try { browser = await chromium.launch({ channel: "msedge", headless: true }); }
catch { browser = await chromium.launch({ headless: true }); }
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await gotoApp(page, base);
  await fillLoginForm(page, { username: "", password: "" });
  await page.locator(".demo-login-button").click();
  await page.locator(".topbar-nav .topbar-nav-item", { hasText: "互动演示" }).click();
  const playground = page.locator(".parameter-playground");
  await expect(playground).toBeVisible();
  await playground.getByRole('tab',{name:'CPU 性能',exact:true}).click();
  await expect(playground.getByTestId("parameter-result")).toContainText("500");
  const cpuCurveBefore = await playground.locator(".parameter-chart-reference").getAttribute("d");
  await playground.locator("#parameter-cpu-clockGHz").focus();
  await playground.locator("#parameter-cpu-clockGHz").press("End");
  await expect(playground.getByTestId("parameter-result")).toContainText("250");
  const currentDotAtMax = await playground.locator(".parameter-chart-dot").getAttribute("cx");
  await playground.locator("#parameter-cpu-cpi").focus();
  await playground.locator("#parameter-cpu-cpi").press("End");
  assert.notEqual(await playground.locator(".parameter-chart-reference").getAttribute("d"), cpuCurveBefore);
  assert.equal(await playground.locator(".parameter-chart-dot").getAttribute("cx"), currentDotAtMax);
  await playground.getByRole("button", { name: "恢复本组初始值" }).click();
  await expect(playground.getByTestId("parameter-result")).toContainText("500");
  const frequency = playground.locator("#parameter-cpu-clockGHz");
  const rangeBox = await frequency.boundingBox();
  await page.mouse.move(rangeBox.x + rangeBox.width * (3 - 0.5) / (6 - 0.5), rangeBox.y + rangeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rangeBox.x + rangeBox.width * 0.65, rangeBox.y + rangeBox.height / 2);
  const duringDrag = await frequency.inputValue();
  await page.mouse.move(rangeBox.x + rangeBox.width * 0.8, rangeBox.y + rangeBox.height / 2);
  assert.notEqual(await frequency.inputValue(), duringDrag, "slider updates while pointer remains pressed");
  await page.mouse.up();
  await playground.locator("#parameter-cpu-instructionMillions").focus();
  await playground.locator("#parameter-cpu-instructionMillions").press("Home");
  await expect(playground.getByTestId("parameter-result")).toContainText("0");
  await expect(playground.locator(".parameter-insight")).toContainText("保持不变");
  await playground.getByRole("button", { name: "恢复本组初始值" }).click();

  await playground.getByRole("tab", { name: "Cache 访问" }).click();
  await expect(playground.getByTestId("parameter-result")).toContainText("10");
  await playground.locator("#parameter-cache-hitPercent").focus();
  await playground.locator("#parameter-cache-hitPercent").press("End");
  await expect(playground.getByTestId("parameter-result")).toContainText("2");
  await playground.getByRole("tab", { name: "总线带宽" }).click();
  await expect(playground.getByTestId("parameter-result")).toContainText("3,200");
  await playground.getByRole("combobox", { name: "选择曲线横轴" }).selectOption("widthBits");
  await expect(playground.locator(".parameter-chart-axis-label").first()).toContainText("数据总线位宽");
  await playground.screenshot({ path: `${artifacts}/parameter-playground-desktop.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(playground).toBeVisible();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "mobile page has no horizontal overflow");
  assert.ok(await playground.locator(".parameter-chart-wrap").evaluate(element => element.scrollWidth > element.clientWidth), "mobile chart scrolls within its card");
  await playground.screenshot({ path: `${artifacts}/parameter-playground-mobile.png` });
  assert.deepEqual(errors, []);
  console.log("PASS: CPU/Cache/Bus sliders, live result and curve, reset, sweep selection, mobile layout");
} finally {
  await browser.close();
}
