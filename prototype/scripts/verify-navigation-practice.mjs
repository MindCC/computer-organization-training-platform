import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await gotoApp(page, process.env.PROTOTYPE_APP_URL);
  await fillLoginForm(page, { username: 'demo2026001', password: 'Student123!' }); await submitLoginForm(page);
  const toggle = page.getByRole('button', { name: '课程学习', exact: true });
  await expect(toggle).toBeVisible(); await toggle.hover();
  const menu = page.locator('.topbar-nav-group').filter({ has: toggle }).locator('.topbar-nav-menu');
  await expect(menu).toBeVisible();
  const box = await toggle.boundingBox(), mb = await menu.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 3);
  await page.waitForTimeout(800); await expect(menu).toBeVisible();
  await page.mouse.move(mb.x + 30, mb.y + 20, { steps: 10 });
  await page.waitForTimeout(800); await expect(menu).toBeVisible();
  await page.mouse.move(1300, 700); await expect(menu).toBeHidden();
  await toggle.click(); await page.mouse.move(1300, 700); await page.waitForTimeout(500); await expect(menu).toBeVisible();
  await toggle.hover(); await page.mouse.move(1300, 700); await page.waitForTimeout(500); await expect(menu).toBeVisible();
  await page.keyboard.press('Escape'); await expect(menu).toBeHidden();
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
  console.log('PASS slow hover gap, delayed leave, pinned reentry, Escape, 8 equal tabs at 1366/768/390/320, removed paragraph');
} finally { await browser.close(); }
