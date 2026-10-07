import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await gotoApp(page, process.env.PROTOTYPE_APP_URL ?? 'http://127.0.0.1:5173');
  await fillLoginForm(page, { username: 'demo2026001', password: 'Student123!' }); await submitLoginForm(page);
  // 2026-10-06 起顶栏试点「二级项全部平铺」：不再有分组下拉与 hover 空隙，
  // 原下拉断言（toggle/menu/hover gap/Escape）见 git 历史。这里改为断言平铺形态：
  // 学生端 8 个入口全部作为一级按钮可点，且顶栏在常见宽度下不溢出、不裁剪。
  const NAV_LABELS = ['课程首页', 'AI讲演', '互动演示', '硬件配置挑战', '课后作业', '学习记录', '错题本', '知识库'];
  await page.locator('.topbar-nav-flat-item').first().waitFor({ timeout: 20000 });
  const flatLabels = await page.locator('.topbar-nav .topbar-nav-flat-item').allInnerTexts();
  assert.deepEqual(flatLabels.map(text => text.trim()), NAV_LABELS, `平铺入口应为 ${NAV_LABELS.join('/')}`);
  await expect(page.locator('.topbar-nav-group')).toHaveCount(0);
  for (const width of [1920, 1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(200);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      clipped: [...document.querySelectorAll('.topbar-nav .topbar-nav-item')]
        .some(el => el.getBoundingClientRect().right > window.innerWidth + 1 || el.getBoundingClientRect().left < -1),
    }));
    assert.equal(layout.overflow, false, `${width}: 页面横向溢出`);
    assert.equal(layout.clipped, false, `${width}: 顶栏入口被裁剪`);
  }
  // 平铺后每个入口都要真的能到对应页面
  await page.setViewportSize({ width: 1366, height: 900 });
  for (const label of ['AI讲演', '互动演示', '学习记录', '错题本', '知识库']) {
    await page.locator('.topbar-nav-flat-item').filter({ hasText: label }).first().click();
    await page.waitForTimeout(600);
    await expect(page.locator('.topbar-nav-flat-item.active')).toHaveText(label);
  }
  await page.getByRole('button', { name: '课后作业', exact: true }).click();
  const tabs = page.locator('.chapter-tab'); await expect(tabs).toHaveCount(8);
  for (const width of [1366, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const sizes = await tabs.evaluateAll(elements => elements.map(el => ({ width: el.getBoundingClientRect().width, scroll: el.scrollWidth, client: el.clientWidth })));
    assert.ok(Math.max(...sizes.map(s => s.width)) - Math.min(...sizes.map(s => s.width)) < 1, `${width}: unequal tabs`);
    assert.ok(sizes.every(s => s.scroll <= s.client + 1), `${width}: tab text overflows`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${width}: page overflows`);
    await page.screenshot({ path: `qa-artifacts/navigation-practice-${width}.png` });
  }
  await page.getByTestId('study-companion').getByRole('button').click();
  const dialog = page.locator('.study-companion-dialog'); await expect(dialog).toBeVisible();
  await expect(dialog.locator('.study-mascot-consent')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '询问助教', exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS flat topbar (8 reachable entries, no overflow/clipping at 1920/1366/768/390), 8 equal tabs at 1366/768/390/320, removed paragraph');
} finally { await browser.close(); }
