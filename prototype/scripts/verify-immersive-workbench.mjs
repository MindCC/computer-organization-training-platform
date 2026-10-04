import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { fillLoginForm, gotoApp, submitLoginForm } from './lib/qaLogin.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const artifactDir = process.env.QA_ARTIFACT_DIR ?? 'qa-artifacts';
await mkdir(artifactDir, { recursive: true });
try {
  await gotoApp(page, process.env.PROTOTYPE_APP_URL);
  await fillLoginForm(page, { username: 'demo2026001', password: 'Student123!' });
  await submitLoginForm(page);
  await expect(page.locator('.topbar-nav')).toBeVisible();
  await page.getByTestId('course-adventure-map').getByRole('button', { name: /认识数据流/ }).click();
  const canvas = page.getByTestId('react-flow-circuit-canvas');
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  const workspace = await page.locator('.lab-studio-workspace').boundingBox();
  assert.ok(bounds.width > workspace.width * 0.88, 'canvas should own most of the workspace width');
  assert.ok(bounds.height >= 580, 'canvas should be tall enough for direct manipulation');
  await expect(page.locator('.workbench-mission')).toBeVisible();
  await expect(page.locator('.circuit-flow-live-panel')).toBeHidden();
  await page.screenshot({ path: path.join(artifactDir, 'immersive-workbench-desktop.png') });
  await page.getByRole('button', { name: '显示数据面板' }).click();
  await expect(page.locator('.circuit-flow-live-panel')).toBeVisible();
  await page.getByRole('button', { name: '收起数据面板' }).click();
  await expect(page.locator('.circuit-flow-live-panel')).toBeHidden();
  await page.getByRole('button', { name: '放大工作台' }).click();
  await expect(page.locator('.circuit-flow-workbench')).toHaveClass(/expanded/);
  await expect(canvas).toBeVisible();
  const expandedBounds = await canvas.boundingBox();
  const zoomControls = await canvas.locator('.react-flow__controls').boundingBox();
  const footerBounds = await page.locator('.circuit-stage-footer').boundingBox();
  assert.ok(zoomControls.y + zoomControls.height < footerBounds.y, 'zoom controls should remain above the bottom toolbar');
  console.log('Canvas dimensions', { normal: bounds, expanded: expandedBounds });
  await page.screenshot({ path: path.join(artifactDir, 'immersive-workbench-expanded.png') });
  assert.ok(expandedBounds.height > bounds.height, 'expanded mode should enlarge the canvas');
  for (const [source, target] of [['port-input-a-out', 'port-data-path-in'], ['port-data-path-out', 'port-result-s-in']]) {
    let previousTransform, stable = 0;
    await expect.poll(async () => {
      const transform = await canvas.locator('.react-flow__viewport').getAttribute('style');
      stable = transform === previousTransform ? stable + 1 : 0;
      previousTransform = transform;
      return stable;
    }, { intervals: [100, 100, 100] }).toBeGreaterThanOrEqual(2);
    const from = await page.getByTestId(source).boundingBox();
    const to = await page.getByTestId(target).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 14 });
    await page.mouse.up();
  }
  await expect(canvas.locator('.react-flow__edge')).toHaveCount(2);
  await canvas.locator('.circuit-input-switch').click();
  await expect(canvas.locator('.circuit-output-lamp')).toHaveAttribute('aria-label', '输出 1');
  await page.keyboard.press('Escape');
  await expect(page.locator('.circuit-flow-workbench')).not.toHaveClass(/expanded/);
  await expect(canvas.locator('.react-flow__edge')).toHaveCount(2);
  await expect(canvas.locator('.circuit-output-lamp')).toHaveAttribute('aria-label', '输出 1');
  await page.getByRole('button',{name:'参数实验',exact:true}).click();
  const parameter=page.locator('.lab-parameter-workbench');
  await expect(parameter).toBeVisible();
  for(const id of ['cpu','cache','bus']) {
    await parameter.locator(`[data-parameter-topic="${id}"]`).click();
    const value=parameter.getByTestId('parameter-value'), before=await value.textContent();
    await parameter.locator('input[type="range"]').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(value).not.toHaveText(before);
    await expect(parameter.getByTestId('parameter-curve')).toBeVisible();
  }
  await page.getByRole('button',{name:'← 返回工作台',exact:true}).click();
  await expect(canvas.locator('.react-flow__edge')).toHaveCount(2);
  await expect(canvas.locator('.circuit-output-lamp')).toHaveAttribute('aria-label','输出 1');
  await page.setViewportSize({ width: 820, height: 800 });
  await expect(canvas).toBeVisible();
  await expect(canvas.locator('.react-flow__edge')).toHaveCount(2);
  await expect(canvas.locator('.circuit-output-lamp')).toHaveAttribute('aria-label', '输出 1');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'narrow layout should not overflow');
  await page.screenshot({ path: path.join(artifactDir, 'immersive-workbench-narrow.png'), fullPage: true });
  await page.getByRole('button', { name: '提交检测', exact: true }).click();
  await expect(page.locator('.circuit-flow-report')).toHaveClass(/passed/);
  console.log(`沉浸式工作台通过：画布 ${Math.round(bounds.width)}×${Math.round(bounds.height)}，数据面板、放大与窄屏布局正常`);
} finally {
  await browser.close();
}
