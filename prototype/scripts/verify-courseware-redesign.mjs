import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { COURSEWARE } from '../src/courseware.js';
import { clickTopNavItem } from './nav-helpers.mjs';

const base = process.env.PROTOTYPE_APP_URL ?? 'http://127.0.0.1:5173';
const lectureChapters = COURSEWARE.chapters.filter(chapter => chapter.embeds?.length);
const lectureCount = lectureChapters.reduce((count, chapter) => count + chapter.embeds.length, 0);
const browser = await chromium.launch({ headless: true });
await mkdir('qa-artifacts', { recursive: true });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.route('https://ppt.gkk.cn/**', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html><body><button onclick="this.textContent=Number(this.textContent)+1">0</button></body></html>',
  }));
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await clickTopNavItem(page, 'AI讲演');
  await expect(page.getByRole('heading', { name: 'AI讲演', exact: true })).toBeVisible();
  await expect(page.locator('.ai-lecture-card')).toHaveCount(lectureChapters.length);
  await expect(page.locator('.ai-lecture-card-links button')).toHaveCount(lectureCount);
  await expect(page.locator('.ai-lecture-player iframe')).toHaveCount(0);
  await expect(page.locator('.upload-courseware-panel, input[type=file]')).toHaveCount(0);
  assert.equal(await page.locator('.ai-lecture-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 4);

  await page.screenshot({ path: 'qa-artifacts/ai-lecture-hub-desktop.png' });
  const first = lectureChapters[0].embeds[0];
  await page.locator('.ai-lecture-card-links button').first().click();
  const player = page.locator('.ai-lecture-player');
  const iframe = player.locator('iframe');
  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute('src', first.src);
  await expect(page.locator('.ai-lecture-card')).toHaveCount(0);
  for (const viewport of [{width:1440,height:900},{width:1920,height:947},{width:1366,height:768},{width:1280,height:632}]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const bounds = await player.boundingBox();
      return bounds ? bounds.y + bounds.height <= viewport.height - 16 : false;
    }).toBe(true);
    const bounds = await iframe.boundingBox();
    assert.ok(bounds && Math.abs(bounds.width / bounds.height - 16 / 9) < .05, 'player fits the screen without changing 16:9');
  }
  await page.setViewportSize({width:1440,height:900});
  const frame = page.frameLocator('.ai-lecture-player iframe');
  await frame.getByRole('button', { name: '0' }).click();
  await page.evaluate(() => {
    window.__fullscreenHost = null;
    Element.prototype.requestFullscreen = function () { window.__fullscreenHost = this; return Promise.resolve(); };
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => window.__fullscreenHost });
    document.exitFullscreen = () => { window.__fullscreenHost = null; return Promise.resolve(); };
  });
  await page.getByRole('button', { name: '全屏' }).click();
  assert.equal(await page.evaluate(() => window.__fullscreenHost?.className), 'ai-lecture-player');
  await page.getByRole('button', { name: '全屏' }).click();
  assert.equal(await page.evaluate(() => window.__fullscreenHost), null);
  await expect(frame.getByRole('button', { name: '1' })).toBeVisible();
  await page.screenshot({ path: 'qa-artifacts/ai-lecture-player-desktop.png' });
  await page.getByRole('button', { name: '返回 AI讲演' }).click();
  await expect(iframe).toHaveCount(0);

  const multiChapter = lectureChapters.find(chapter => chapter.embeds.length > 1);
  const card = page.locator('.ai-lecture-card').filter({ hasText: multiChapter.title });
  await card.locator('button').nth(1).click();
  await expect(page.locator('.ai-lecture-player iframe')).toHaveAttribute('src', multiChapter.embeds[1].src);
  await page.getByRole('button', { name: '返回 AI讲演' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('.ai-lecture-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 1);
  await page.locator('.ai-lecture-card-links button').first().click();
  const mobile = await page.locator('.ai-lecture-player iframe').boundingBox();
  assert.ok(mobile && Math.abs(mobile.width / mobile.height - 16 / 9) < .05, 'mobile player retains 16:9');
  const mobilePlayer = await page.locator('.ai-lecture-player').boundingBox();
  assert.ok(mobilePlayer && mobilePlayer.y + mobilePlayer.height <= 844 - 16, 'mobile player fits the screen');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile page has no horizontal overflow');
  await page.screenshot({ path: 'qa-artifacts/ai-lecture-player-mobile.png' });
  await context.close();
  console.log('PASS AI讲演: hub cards, no PPT upload, one player, 16:9 sizing, fullscreen, return, multiple lectures, mobile');
} finally {
  await browser.close();
}
