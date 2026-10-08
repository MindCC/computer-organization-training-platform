import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createApp } from '../server/app.js';
import { openDatabase, createUser } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { COURSEWARE } from '../src/courseware.js';
import { fillLoginForm, gotoApp, submitLoginForm } from './lib/qaLogin.mjs';
import { clickTopNavItem } from './nav-helpers.mjs';

// No real accounts, provider calls or GKK login. One Chromium instance/page.
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.resolve(root, process.argv[2] ?? 'dist');
const out = path.join(root, 'qa-artifacts/lecture-qa'); fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'));
const visited = new Set(), files = new Set();
function collect(key) { if (visited.has(key)) return; visited.add(key); const c = manifest[key]; if (c.file.endsWith('.js')) files.add(c.file); for (const dep of c.imports ?? []) collect(dep); }
collect(Object.keys(manifest).find(key => manifest[key].isEntry));
const initialBytes = [...files].reduce((total, file) => total + fs.statSync(path.join(dist, file)).size, 0);
assert(initialBytes <= 512000, `Initial JS exceeds budget: ${initialBytes}`);
const db = openDatabase(':memory:'), env = { DEEPSEEK_API_KEY: 'isolated-test-provider' }, prompts = [];
const app = createApp({ db, distDir: dist, logger: () => {}, studyAssistantOptions: { env,
  scopeRequester: async () => '{"decision":"course"}',
  requester: async (_config, messages) => { prompts.push(JSON.stringify(messages)); return JSON.stringify({ explanation: '计算机按存储的程序依次取出指令，通过控制器协调运算与数据传送。', steps: ['先区分指令与数据的用途。'], check: '控制器如何协调取指过程？' }); },
} });
const password = 'Lecture-QA-Password-123', passwordHash = await hashPassword(password);
const student = createUser(db, { username: 'lecture-qa-student', displayName: '答疑测试学生', role: 'student', passwordHash, profile: { mustChangePassword: false } });
createUser(db, { username: 'lecture-qa-teacher', displayName: '答疑测试教师', role: 'teacher', passwordHash });
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://ppt.gkk.cn/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html lang="zh"><body style="background:#eaf2f9;font-family:sans-serif;padding:40px"><h1>GKK 讲演（隔离测试）</h1><p>尚未登录 GKK。平台答疑独立可用。</p><button onclick="this.textContent=Number(this.textContent)+1">0</button></body></html>' }));
  const panel = page.getByRole('complementary', { name: '本课答疑', exact: true });
  const first = COURSEWARE.chapters.find(ch => ch.embeds?.length), second = COURSEWARE.chapters.find(ch => ch.id === 'ch2');
  async function login(username, role = 'student') {
    await gotoApp(page, base); await fillLoginForm(page, { username, password });
    if (role === 'teacher') await page.locator('[data-login-role="teacher"]').click();
    await submitLoginForm(page);
    await page.locator('.profile-button').waitFor();
    await clickTopNavItem(page, 'AI讲演');
  }
  async function lecture(chapter, index = 0) {
    const row = page.locator('.ai-lecture-row').filter({ has: page.locator('strong', { hasText: chapter.title }) }).first();
    if (await row.locator('.ai-lecture-row-head').getAttribute('aria-expanded') !== 'true') await row.locator('.ai-lecture-row-head').click();
    await row.locator('.ai-lecture-card-links button').nth(index).click();
    if (!(await panel.isVisible())) await page.getByRole('button', { name: '本课答疑', exact: true }).click();
    await expect(panel).toBeVisible();
  }
  async function ask(question = '计算机怎样区分指令与数据？') {
    await panel.getByLabel('你的本课问题').fill(question);
    const response = page.waitForResponse(r => /\/api\/(student|teacher)\/study-assistant$/.test(r.url()) && r.request().method() === 'POST');
    await panel.getByRole('button', { name: '询问助教', exact: true }).click();
    const result = await response; return { status: result.status(), body: await result.json(), payload: result.request().postDataJSON() };
  }
  await login(student.username); await lecture(first);
  await expect(page.getByTestId('study-companion')).toHaveCount(0);
  const submitBounds = await panel.getByRole('button', { name: '询问助教', exact: true }).boundingBox();
  assert(submitBounds.y + submitBounds.height <= 768, 'question controls must fit in the initial desktop viewport');
  assert.equal((await page.context().cookies('https://ppt.gkk.cn')).length, 0);
  let reply = await ask(); assert.equal(reply.body.source, 'ai');
  assert.deepEqual(reply.payload.context, { chapterId: first.id, lectureIndex: 0 });
  assert(prompts.at(-1).includes(first.embeds[0].title));
  await expect(panel.locator('.study-mascot-source')).toHaveText('AI 讲解 · DeepSeek');
  await panel.getByText('回答依据', { exact: true }).click(); await expect(panel.locator('.lecture-question-sources')).toContainText(first.embeds[0].title);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ai_conversations WHERE student_id=?').get(student.id).n, 1);
  console.log('PASS platform login only: course-bound AI answer, actual API, source labels and owned history');

  await panel.getByText('补充课件原文（选填）', { exact: true }).click();
  await panel.getByLabel('粘贴需要讲解的课件文字').fill('UNSELECTED_PRIVATE_TEXT');
  reply = await ask(); assert.equal(reply.payload.lectureExcerpt, undefined); assert(!prompts.at(-1).includes('UNSELECTED_PRIVATE_TEXT'));
  await panel.getByLabel('粘贴需要讲解的课件文字').fill('课件原文：指令和数据都以二进制形式存放在存储器中。');
  await panel.getByLabel('本次提问附带以上课件文字').check();
  reply = await ask(); assert.equal(reply.payload.materialConsent, 'lecture-excerpt'); assert(prompts.at(-1).includes('课件原文：指令和数据'));
  await expect(panel.locator('.lecture-question-sources')).toContainText('本次补充的课件原文');
  await panel.getByLabel('本次提问附带以上课件文字').uncheck();
  await panel.getByText('补充课件原文（选填）', { exact: true }).click();
  console.log('PASS optional excerpt is forwarded only when explicitly selected');

  env.DEEPSEEK_API_KEY = ''; reply = await ask(); assert.equal(reply.body.reason, 'AI_DISABLED');
  await expect(panel.locator('.study-mascot-source')).toHaveText('AI 尚未配置 · 课程参考');
  env.DEEPSEEK_API_KEY = 'isolated-test-provider';
  await page.route('**/api/student/study-assistant', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '测试暂时不可用' } }) }), { times: 1 });
  reply = await ask(); assert.equal(reply.status, 503);
  await expect(panel.getByRole('alert')).toContainText('问题仍保留'); await expect(panel.getByLabel('你的本课问题')).toHaveValue('计算机怎样区分指令与数据？');
  reply = await ask(); assert.equal(reply.body.source, 'ai');
  console.log('PASS truthful local fallback and retry after request failure');

  const frame = page.frameLocator('.ai-lecture-player iframe'); await frame.getByRole('button', { name: '0', exact: true }).click();
  await page.getByRole('button', { name: '收起答疑', exact: true }).click(); await expect(frame.getByRole('button', { name: '1', exact: true })).toBeVisible();
  await expect(page.getByTestId('study-companion')).toHaveCount(1);
  await page.getByRole('button', { name: '本课答疑', exact: true }).click();
  await page.getByRole('button', { name: '全屏', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.className)).toBe('ai-lecture-player');
  await expect(panel).toBeVisible();
  await page.getByRole('button', { name: '全屏', exact: true }).click();
  await expect(frame.getByRole('button', { name: '1', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(out, 'desktop.png') });
  console.log('PASS answer toggle/fullscreen preserve the same iframe and playback state');

  let release, arrived;
  const ready = new Promise(resolve => { arrived = resolve; });
  await page.route('**/api/student/study-assistant', async route => { arrived(); await new Promise(resolve => { release = resolve; }); await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ source: 'ai', explanation: 'OLD_LECTURE_LATE_REPLY', steps: [], check: '' }) }); }, { times: 1 });
  await panel.getByLabel('你的本课问题').fill('为什么程序要存入内存？'); await panel.getByRole('button', { name: '询问助教', exact: true }).click(); await ready;
  await page.getByRole('button', { name: '返回 AI讲演', exact: true }).click(); await lecture(second, 1);
  release(); await expect(panel.getByLabel('你的本课问题')).toHaveValue(''); await expect(panel).not.toContainText('OLD_LECTURE_LATE_REPLY');
  reply = await ask('补码最高位怎样参与运算？'); assert.deepEqual(reply.payload.context, { chapterId: second.id, lectureIndex: 1 });
  assert(prompts.at(-1).includes(second.embeds[1].title));
  console.log('PASS switching lectures clears old draft/reply and selects the new canonical material');

  await page.setViewportSize({ width: 390, height: 844 }); await expect(panel).toBeVisible();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(out, 'mobile.png') });
  await page.getByRole('button', { name: '收起答疑', exact: true }).click(); await expect(page.locator('.ai-lecture-player iframe')).toBeVisible();
  await page.getByRole('button', { name: '本课答疑', exact: true }).click(); await expect(panel.getByLabel('你的本课问题')).toBeVisible();
  console.log('PASS mobile answer/lecture switching without horizontal overflow');

  await page.setViewportSize({ width: 1366, height: 768 }); await page.context().clearCookies();
  await login('lecture-qa-teacher', 'teacher'); await lecture(first);
  reply = await ask(); assert.equal(reply.status, 200);
  assert(reply.payload.context.chapterId === first.id);
  assert.deepEqual(errors, []);
  console.log(`PASS teacher role endpoint and no browser errors; initial JS ${initialBytes}/512000 bytes`);
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); }
