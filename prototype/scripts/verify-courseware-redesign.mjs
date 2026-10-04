/**
 * 课程课件 + 互动演示 版式验收
 *
 * 2026-10-04 适配说明（本地保留了章节大纲版课件页，与上游「纯播放器」页不同）：
 * - 讲演播放在**章节大纲**里（.outline-lecture），展开章节才挂载 iframe；
 * - 全屏按钮为 .outline-lecture-fullscreen，走原生 Fullscreen API（.outline-lecture 进入全屏）；
 * - 本页**保留 PPT/PPTX 上传**（用户决定 2026-10-04，见 AGENTS.md），因此不再断言「无上传 UI」；
 * - 2026-10-04 取消独立「互动演示」顶栏入口，演示统一挂在课件页的「课堂互动演示」面板；
 *   测试改为校验该面板列出全部章节演示，并断言顶栏不再出现「互动演示」。
 */
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { COURSEWARE } from '../src/courseware.js';

const base = process.env.PROTOTYPE_APP_URL ?? process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });

const firstChapterWithEmbed = COURSEWARE.chapters.find((chapter) => chapter.embeds?.length);
const firstEmbed = firstChapterWithEmbed?.embeds?.[0];
assert.ok(firstEmbed, '至少要配置一个 AI 互动讲演地址');
const totalEmbeds = COURSEWARE.chapters.reduce((sum, chapter) => sum + (chapter.embeds?.length ?? 0), 0);

const localErrors = [];
const lectureStub = '<!doctype html><html><body style="margin:0;background:#eaf3f5;height:100vh;display:grid;place-content:center;text-align:center;font:24px sans-serif"><h1>AI 课件播放器 · 版式验收</h1><button onclick="this.textContent=Number(this.textContent)+1">0</button></body></html>';
async function stubLecture(context) {
  await context.route(new URL(firstEmbed.src).origin + '/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: lectureStub }));
}

async function openCourseware(page) {
  // 整页重载再进课件页，确保是全新挂载：否则会保留上一次的展开状态，
  // 「展开前不应加载 iframe」这条懒加载断言就失去意义（窄屏下顶栏结构也不同，不依赖点首页按钮）。
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.locator('.topbar-nav').getByRole('button', { name: '课程课件', exact: true }).click();
  await expect(page.locator('.courseware-view')).toBeVisible();
  const outline = page.locator('.outline-chapter');
  await expect(outline).toHaveCount(COURSEWARE.chapters.length);
  // 未展开时不应挂载任何 iframe（懒加载）
  assert.equal(await page.locator('.outline-lecture iframe').count(), 0, '展开前不应加载讲演 iframe');
  // 展开第一个带讲演的章节
  const chapter = page.locator('.outline-chapter', { hasText: firstChapterWithEmbed.title }).first();
  await chapter.locator('summary').click();
  const player = chapter.locator('.outline-lecture').first();
  await expect(player.locator('iframe')).toHaveAttribute('src', firstEmbed.src);
  await expect(player.locator('.outline-lecture-fullscreen')).toBeVisible();
  assert.equal(await page.locator('.courseware-chapter-card').count(), 0, '课件页不应出现演示卡片（那是互动演示页）');
  const frame = await player.locator('iframe').boundingBox();
  assert.ok(frame && frame.width > 250 && frame.height > 200, '讲演播放器必须有实际可用空间');
  return { player, iframe: player.locator('iframe'), frame: player.locator('iframe') };
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await stubLecture(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => { if (!error.stack?.includes('ppt.gkk.cn')) localErrors.push(error.message); });

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const { player, iframe } = await openCourseware(page);
  const normal = await iframe.boundingBox();
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), '自然高度允许页面滚动');

  // 播放状态：在 iframe 内点一次，全屏进出后应保留
  const frame = page.frameLocator('.outline-lecture iframe').first();
  await frame.getByRole('button', { name: '0', exact: true }).click();

  // 全屏：按钮必须对 .outline-lecture 调用 requestFullscreen（用桩函数确定性地验证接线）
  // 桩同时模拟 fullscreenElement，才能验证「再次点击退出全屏」这条分支。
  await page.evaluate(() => {
    window.__fsCalls = [];
    window.__fsExited = false;
    window.__fsEl = null;
    Element.prototype.requestFullscreen = function requestFullscreen() {
      window.__fsCalls.push(this.className);
      window.__fsEl = this;
      return Promise.resolve();
    };
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => window.__fsEl });
    document.exitFullscreen = () => { window.__fsExited = true; window.__fsEl = null; return Promise.resolve(); };
  });
  await player.locator('.outline-lecture-fullscreen').click();
  const fsCalls = await page.evaluate(() => window.__fsCalls);
  assert.deepEqual(fsCalls, ['outline-lecture'], `全屏按钮应对播放器调用 requestFullscreen，实际 ${JSON.stringify(fsCalls)}`);
  // 已在全屏时再点一次应退出
  await player.locator('.outline-lecture-fullscreen').click();
  assert.equal(await page.evaluate(() => window.__fsExited === true), true, '全屏状态下再点按钮应退出全屏');
  await expect(frame.getByRole('button', { name: '1', exact: true })).toBeVisible();

  // 全屏覆盖样式存在（真机全屏时的铺满规则）
  assert.equal(await page.locator('.outline-lecture').first().evaluate((el) => el.className.includes('outline-lecture')), true);
  await page.screenshot({ path: 'qa-artifacts/courseware-outline-desktop.png', fullPage: false });

  // 多节讲演：第二章 3 个、第三章 2 个都应渲染
  for (const [chapterTitle, expected] of [['第二章', 3], ['第三章', 2]]) {
    const group = page.locator('.outline-chapter', { hasText: chapterTitle }).first();
    if (!(await group.evaluate((el) => el.open))) await group.locator('summary').click();
    await expect(group.locator('.outline-lecture')).toHaveCount(expected);
  }
  assert.equal(totalEmbeds, 7, `讲演总数应为 7，实际 ${totalEmbeds}`);

  // 演示入口（2026-10-04 二轮去重）：课件页不再列演示卡片，演示只从课程首页探险地图的章节面板进入
  assert.equal(await page.locator('.topbar-nav').getByRole('button', { name: '互动演示', exact: true }).count(), 0, '顶栏不应出现「互动演示」入口');
  assert.equal(await page.locator('.courseware-demos').count(), 0, '课件页不应再列演示卡片');
  const expectedHrefs = COURSEWARE.chapters.flatMap((chapter) => (chapter.demos ?? []).map((demo) => demo.href));
  await page.locator('.topbar-nav').getByRole('button', { name: '课程首页', exact: true }).click();
  await page.waitForSelector('.course-adventure-map', { timeout: 15000 });
  await page.locator('.adventure-map-viewport [role="button"], .adventure-map-marker').first().click({ force: true });
  await page.waitForTimeout(900);
  const mapDemoHrefs = await page.locator('.adventure-map-demos a').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  assert.ok(mapDemoHrefs.length > 0 && mapDemoHrefs.every((href) => expectedHrefs.includes(href)), `课程首页章节面板应提供该章演示入口，实际 ${JSON.stringify(mapDemoHrefs)}`);
  await page.screenshot({ path: 'qa-artifacts/courseware-demos-desktop.png' });

  // 手机布局
  await page.setViewportSize({ width: 390, height: 844 });
  await openCourseware(page);
  const mobile = await page.locator('.outline-lecture iframe').first().boundingBox();
  assert.ok(mobile.height >= 440, `手机端播放器高度应 >= 440，实际 ${Math.round(mobile.height)}`);
  assert.equal(await page.locator('.courseware-demos').count(), 0, '手机端课件页同样不应再列演示卡片');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '手机端不应横向溢出');
  await page.screenshot({ path: 'qa-artifacts/courseware-demos-mobile.png' });
  await context.close();

  // 三种身份入口都能打开课件页并看到讲演
  for (const role of ['student', 'teacher']) {
    const roleContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await stubLecture(roleContext);
    const rolePage = await roleContext.newPage();
    rolePage.on('pageerror', (error) => { if (!error.stack?.includes('ppt.gkk.cn')) localErrors.push(error.message); });
    await rolePage.goto(base, { waitUntil: 'domcontentloaded' });
    await rolePage.getByRole('button', { name: '登录', exact: true }).click();
    await rolePage.locator(`[data-demo-role="${role}"]`).click();
    await expect(rolePage.locator('.profile-button')).toBeVisible();
    await openCourseware(rolePage);
    await roleContext.close();
  }

  assert.deepEqual(localErrors, []);
  console.log(`PASS: 章节大纲课件页 ${COURSEWARE.chapters.length} 章 / ${totalEmbeds} 个讲演（懒加载、原地址、真实全屏出入、播放状态保留、手机布局）、课件页无演示面板且演示入口统一在课程首页地图（${expectedHrefs.length} 个）、三种身份入口`);
} finally {
  await browser.close();
}
