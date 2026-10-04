import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { COURSEWARE } from '../src/courseware.js';

const base = process.env.PROTOTYPE_APP_URL ?? process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const originalEmbed = COURSEWARE.chapters.find(chapter => chapter.embeds?.length)?.embeds[0];
assert.ok(originalEmbed, '原 AI 课件地址必须存在');
const uploadRequests = [];
const localErrors = [];
async function checkCourseware(page) {
  await page.locator('.topbar-nav').getByRole('button', { name: '课程课件', exact: true }).click();
  await expect(page.locator('.courseware-lecture-player iframe')).toHaveAttribute('src', originalEmbed.src);
  await expect(page.locator('.lecture-fullscreen-link')).toHaveAttribute('href', originalEmbed.src);
  assert.equal(await page.locator('.courseware-play-chapter, .upload-courseware-panel, .uploaded-courseware-stage, .pptx-stage, .page-notes, input[type=file]').count(), 0);
  assert.equal(await page.locator('.courseware-view').getByText(/PPTX?|\d+ 页课件/).count(), 0);
  await expect(page.locator('.courseware-chapter-card')).toHaveCount(0);
  const frame = await page.locator('.courseware-lecture-player iframe').boundingBox();
  assert.ok(frame && frame.width > 250 && frame.height > 200, 'AI 播放器必须有实际可用空间');
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('request', request => { if (request.url().includes('/api/courseware/uploads')) uploadRequests.push(request.url()); });
  page.on('pageerror', error => { if (!error.stack?.includes('ppt.gkk.cn')) localErrors.push(error.message); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await checkCourseware(page);
  await page.locator('.topbar-nav').getByRole('button', { name: '互动演示', exact: true }).click();
  await expect(page.locator('.courseware-chapter-card')).toHaveCount(8);
  assert.equal(await page.locator('.courseware-demo-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 4);
  await expect(page.locator('.courseware-chapter-card').nth(1).locator('.courseware-demo-entry')).toHaveCount(2);
  await expect(page.locator('.courseware-chapter-card').nth(2).locator('a[href="/demos/adder-alu.html"]')).toHaveCount(1);
  await page.screenshot({ path: 'qa-artifacts/courseware-ai-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkCourseware(page);
  await page.locator('.topbar-nav').getByRole('button', { name: '互动演示', exact: true }).click();
  await expect(page.locator('.courseware-chapter-card')).toHaveCount(8);
  assert.equal(await page.locator('.courseware-demo-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: 'qa-artifacts/courseware-ai-mobile.png' });
  await context.close();
  for (const role of ['student', 'teacher']) {
    const roleContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const rolePage = await roleContext.newPage();
    rolePage.on('request', request => { if (request.url().includes('/api/courseware/uploads')) uploadRequests.push(request.url()); });
    await rolePage.goto(base, { waitUntil: 'domcontentloaded' });
    await rolePage.getByRole('button', { name: '登录', exact: true }).click();
    await rolePage.locator(`[data-demo-role="${role}"]`).click();
    await expect(rolePage.locator('.profile-button')).toBeVisible();
    await checkCourseware(rolePage);
    await roleContext.close();
  }
  assert.deepEqual(uploadRequests, [], '页面不应再加载 PPT 上传列表');
  assert.deepEqual(localErrors, []);
  console.log('PASS: 原 AI 课件地址与独立入口、独立互动演示入口、无 PPT 播放/上传、游客学生教师与手机布局');
} finally {
  await browser.close();
}
