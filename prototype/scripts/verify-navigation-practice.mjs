import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';
import { clickTopNavItem } from './nav-helpers.mjs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await gotoApp(page, process.env.PROTOTYPE_APP_URL ?? 'http://127.0.0.1:5173');
  await fillLoginForm(page, { username: 'demo2026001', password: 'Student123!' }); await submitLoginForm(page);
  const NAV_LABELS = ['课程首页', '实训平台', '课程学习', 'AI助教', '学习复盘'];
  await page.locator('.topbar-nav-primary > button').first().waitFor({ timeout: 20000 });
  const flatLabels = await page.locator('.topbar-nav-primary > button').allInnerTexts();
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
  // 一级与二级入口均能到达对应页面。
  await page.setViewportSize({ width: 1366, height: 900 });
  for (const label of ['AI讲演', '互动演示', '实训平台', 'AI助教', '学习记录', '错题本', '知识库']) {
    await clickTopNavItem(page,label);
    await page.waitForTimeout(600);
    await expect(page.locator('.topbar-nav-item.active').filter({hasText:label}).first()).toHaveText(label);
  }
  await clickTopNavItem(page,'课后作业');
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
  await dialog.getByRole('button', {name:'关闭小芯助教'}).click();
  await page.setViewportSize({width:1366,height:900});
  await clickTopNavItem(page,'AI讲演');
  await page.locator('.topbar').screenshot({path:'qa-artifacts/grouped-topbar.png'});
  assert.deepEqual(errors, []);
  console.log('PASS grouped topbar (5 primary entries, reachable secondary entries, no overflow/clipping at 1920/1366/768/390), 8 equal tabs at 1366/768/390/320');
} finally { await browser.close(); }
