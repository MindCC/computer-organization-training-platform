import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { COURSEWARE } from '../src/courseware.js';
import { clickTopNavItem } from './nav-helpers.mjs';

const base = process.env.PROTOTYPE_APP_URL ?? process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const originalEmbed = COURSEWARE.chapters.find(chapter => chapter.embeds?.length)?.embeds[0];
assert.ok(originalEmbed, '原 AI 课件地址必须存在');
const uploadRequests = [];
const localErrors = [];
const lectureStub = '<!doctype html><html><body style="margin:0;background:#eaf3f5;height:100vh;display:grid;place-content:center;text-align:center;font:24px sans-serif"><h1>AI 课件播放器 · 版式验收</h1><button onclick="this.textContent=Number(this.textContent)+1">0</button></body></html>';
async function stubLecture(context) {
  await context.route(new URL(originalEmbed.src).origin + '/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:lectureStub}));
}
async function checkCourseware(page) {
  await clickTopNavItem(page, '课程课件');
  await expect(page.locator('.courseware-lecture-player iframe')).toHaveAttribute('src', originalEmbed.src);
  await expect(page.getByRole('button',{name:'全屏',exact:true})).toBeVisible();
  await expect(page.getByText(/独立打开 AI 课件|若课件未显示/)).toHaveCount(0);
  assert.equal(await page.locator('.courseware-play-chapter, .upload-courseware-panel, .uploaded-courseware-stage, .pptx-stage, .page-notes, input[type=file]').count(), 0);
  assert.equal(await page.locator('.courseware-view').getByText(/PPTX?|\d+ 页课件/).count(), 0);
  await expect(page.locator('.courseware-chapter-card')).toHaveCount(0);
  const frame = await page.locator('.courseware-lecture-player iframe').boundingBox();
  assert.ok(frame && frame.width > 250 && frame.height > 200, 'AI 播放器必须有实际可用空间');
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await stubLecture(context);
  const page = await context.newPage();
  page.on('request', request => { if (request.url().includes('/api/courseware/uploads')) uploadRequests.push(request.url()); });
  page.on('pageerror', error => { if (!error.stack?.includes('ppt.gkk.cn')) localErrors.push(error.message); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await checkCourseware(page);
  const player=page.locator('.courseware-lecture-player'), iframe=player.locator('iframe');
  const normal=await iframe.boundingBox();
  assert.ok(Math.abs(normal.width / normal.height - 16 / 9)<0.02,'桌面课件保持自然 16:9 比例');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),'自然高度允许页面滚动');
  const frame=page.frameLocator('.courseware-lecture-player iframe');
  await frame.getByRole('button',{name:'0',exact:true}).click();
  await page.getByRole('button',{name:'全屏',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.classList.contains('courseware-lecture-player'))).toBe(true);
  await expect(page.getByRole('button',{name:'退出全屏',exact:true})).toBeVisible();
  const full=await iframe.boundingBox(); assert.ok(full.height>normal.height);
  await page.getByRole('button',{name:'退出全屏',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);
  await expect(frame.getByRole('button',{name:'1',exact:true})).toBeVisible();
  await page.screenshot({path:'qa-artifacts/courseware-player-natural.png',fullPage:true});
  await page.evaluate(()=>{document.querySelector('.courseware-lecture-player').requestFullscreen=()=>Promise.reject(new Error('unavailable'));});
  await page.getByRole('button',{name:'全屏',exact:true}).click();
  await expect(player).toHaveClass(/is-expanded/);
  await page.keyboard.press('Escape'); await expect(player).not.toHaveClass(/is-expanded/);
  await expect(frame.getByRole('button',{name:'1',exact:true})).toBeVisible();
  await clickTopNavItem(page, '互动演示');
  await expect(page.locator('.courseware-chapter-card')).toHaveCount(8);
  assert.equal(await page.locator('.courseware-demo-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 4);
  await expect(page.locator('.courseware-chapter-card').nth(1).locator('.courseware-demo-entry')).toHaveCount(2);
  await expect(page.locator('.courseware-chapter-card').nth(2).locator('a[href="/demos/adder-alu.html"]')).toHaveCount(1);
  await page.screenshot({ path: 'qa-artifacts/courseware-ai-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkCourseware(page);
  const mobile=await iframe.boundingBox(); assert.ok(mobile.height>=480);
  await page.evaluate(()=>{document.querySelector('.courseware-lecture-player').requestFullscreen=()=>Promise.reject(new Error('unavailable'));});
  await page.getByRole('button',{name:'全屏',exact:true}).click();
  await expect(player).toHaveClass(/is-expanded/);
  await page.getByRole('button',{name:'退出全屏',exact:true}).click();
  await expect(player).not.toHaveClass(/is-expanded/);
  await clickTopNavItem(page, '互动演示');
  await expect(page.locator('.courseware-chapter-card')).toHaveCount(8);
  assert.equal(await page.locator('.courseware-demo-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: 'qa-artifacts/courseware-ai-mobile.png' });
  await context.close();
  for (const role of ['student', 'teacher']) {
    const roleContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await stubLecture(roleContext);
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
  console.log('PASS: AI 课件自然比例、原地址保留、原生全屏及退出、降级放大/Esc、播放状态保留、手机布局、游客学生教师入口');
} finally {
  await browser.close();
}
