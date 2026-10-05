import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { fillLoginForm, gotoApp } from './lib/qaLogin.mjs';
import { openTeacherWorkspace, TEACHER_WORKSPACE } from './lib/qaTeacherWorkspace.mjs';
import { selectTeacherClass } from './helpers/select-teacher-class.mjs';
import { COURSEWARE } from '../src/courseware.js';
import { clickTopNavItem } from './nav-helpers.mjs';

const url = process.env.PROTOTYPE_APP_URL;
const dir = path.join(process.env.QA_ARTIFACT_DIR ?? 'qa-artifacts', 'mobile');
await mkdir(dir, { recursive: true });
const results = [], errors = [];
let sessionId;
const widths = [320, 360, 390, 768, 844];
const browser = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ headless: true }));
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  // Third-party lecture contents are excluded; validate the configured player and controls.
  for (const origin of new Set(COURSEWARE.chapters.flatMap(ch => (ch.embeds ?? []).map(embed => new URL(embed.src).origin)))) {
    await ctx.route(`${origin}/**`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width"><h1>AI 互动课件</h1>' }));
  }
  return ctx;
}
async function check(name, action) {
  try { await action(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
async function layout(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const measurement = await page.evaluate(() => ({
    width: innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')].filter(el => {
      const box = el.getBoundingClientRect();
      return box.width && box.right > document.documentElement.clientWidth + 2 && !el.closest('svg');
    }).slice(0, 12).map(el => ({ tag: el.tagName, className: String(el.className), text: el.textContent.slice(0, 55) })),
  }));
  const bad = measurement.scrollWidth > measurement.clientWidth + 1 || measurement.width > measurement.clientWidth + 1;
  if (page.viewportSize().width === 390 || bad) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(dir, `${name}-${page.viewportSize().width}.png`), fullPage: true });
    if (page.viewportSize().width === 390) await page.screenshot({ path: path.join(dir, `${name}-screen.png`) });
  }
  assert.equal(bad, false, `horizontal overflow: ${JSON.stringify(measurement)}`);
}
async function sizes(page, name) {
  for (const width of widths) await check(`${name}-${width}`, async () => {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : width === 844 ? 390 : 844 });
    await layout(page, name);
  });
  await page.setViewportSize({ width: 390, height: 844 });
}
async function nav(page, label, selector) {
  if (await page.getByRole('dialog').isVisible().catch(() => false)) await page.reload({ waitUntil: 'domcontentloaded' });
  await clickTopNavItem(page, label);
  const button = page.locator('.topbar-nav-item').filter({ hasText: label }).first();
  await expect(button).toHaveClass(/active/);
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 20000 }).catch(async error => {
    console.error('PAGE STATE', label, (await page.locator('body').innerText()).slice(-1800));
    await page.screenshot({ path: path.join(dir, `navigation-failure-${label}.png`), fullPage: true });
    throw error;
  });
  await page.evaluate(() => window.scrollTo(0, 0));
}
async function login(page, role, username, password) {
  page.on('pageerror', error => errors.push(`${role}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('ErrorBoundary caught')) { errors.push(`${role}: ${message.text()}`); console.error(message.text()); } });
  await gotoApp(page, url);
  await fillLoginForm(page, { username, password });
  await page.locator(`[data-login-role="${role}"]`).click();
  await sizes(page, `${role}-login`);
  await page.locator('.login-submit').click();
  await expect(page.locator(role === 'teacher' ? '.teacher-studio' : '.quest-student-home')).toBeVisible({ timeout: 30000 });
}
async function post(request, route, data) {
  const response = await request.post(url + route, { data });
  assert.ok(response.ok(), `${route}: ${response.status()} ${await response.text()}`);
  return response.json();
}
async function accountPanels(page, role) {
  await page.locator('.profile-button').click();
  await sizes(page, `${role}-profile`);
  await page.getByRole('button', { name: '个人设置', exact: true }).click();
  const settings = page.getByRole('dialog');
  await expect(settings).toBeVisible(); await sizes(page, `${role}-settings`);
  await settings.getByLabel('姓名', { exact: true }).fill(role === 'teacher' ? '移动端验收教师' : '移动端验收学生');
  await settings.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(settings).toContainText('个人设置已保存');
  if (role === 'teacher') {
    await settings.getByRole('tab', { name: '课堂管理', exact: true }).click();
    await expect(settings.getByLabel('学生导入 CSV')).toBeVisible();
    await sizes(page, `${role}-class-settings`);
  }
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.profile-button').click();
  await page.getByRole('button', { name: '帮助支持', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await sizes(page, `${role}-help`);
  await page.getByRole('button', { name: '关闭帮助与提醒' }).click();
  await page.getByRole('button', { name: '通知', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await sizes(page, `${role}-notifications`);
  await page.getByRole('button', { name: '关闭帮助与提醒' }).click();
}

try {
  const teacherCtx = await context(), teacher = await teacherCtx.newPage();
  await login(teacher, 'teacher', process.env.TEACHER_USERNAME, process.env.TEACHER_PASSWORD);
  const { class: cls } = await post(teacher.request, '/api/classes', { name: '移动端验收：计算机组成原理教学协同与任务链展示班' });
  const username = `mobile-${Date.now()}`;
  await post(teacher.request, `/api/teacher/classes/${cls.id}/import-students`, { csv: `${username},移动端验收学生,Student123!\n${username}-long,用于验证长姓名换行的移动端学生,Student123!` });
  await teacher.reload({ waitUntil: 'domcontentloaded' });
  assert.ok(await selectTeacherClass(teacher, cls.name));
  await sizes(teacher, 'teacher-builder');
  await check('teacher-ai-mode', async () => {
    await teacher.getByRole('tab', { name: 'AI 创建', exact: true }).click();
    await teacher.getByLabel('AI教学要求').fill('45分钟补码课堂：诊断、演示与练习');
    await sizes(teacher, 'teacher-ai-builder');
    await teacher.getByRole('tab', { name: '手动编排', exact: true }).click();
  });
  for (const [label, selector, name] of [
    [TEACHER_WORKSPACE.insight, '.teacher-studio-summary', 'teacher-insight'],
    [TEACHER_WORKSPACE.students, '.teacher-student-table', 'teacher-students'],
    ['装机练习', '.teacher-studio-main', 'teacher-practice'],
    [TEACHER_WORKSPACE.assistant, '.teacher-assistant-panel', 'teacher-assistant'],
  ]) await check(name, async () => {
    await openTeacherWorkspace(teacher, TEACHER_WORKSPACE.statistics, label);
    await expect(teacher.locator(selector).first()).toBeVisible();
    if (label === TEACHER_WORKSPACE.assistant) {
      await teacher.getByRole('button', { name: '生成 AI 助教建议' }).click();
      await expect(teacher.locator('.teacher-evidence-item').first()).toBeVisible();
    }
    await sizes(teacher, name);
  });
  await check('teacher-plan-adoption', async () => {
    await teacher.getByRole('button', { name: '采纳并编辑课堂草稿' }).click();
    await teacher.getByRole('textbox', { name: '本节教学重点' }).fill('教师修订：从观察负数编码到区分进位与溢出');
    await sizes(teacher, 'teacher-adopted-plan');
    await teacher.getByRole('button', { name: '创建草稿', exact: true }).click();
    await expect(teacher.locator('.live-session-lesson-plan')).toContainText('教师修订');
    await check('teacher-stage-text-contrast', async () => {
      const lowContrast = await teacher.locator('.chain-live-stages').evaluate(root => {
        const rgb = color => (color.match(/[\d.]+/g) ?? []).map(Number);
        const luminance = c => c.slice(0,3).map(n => n/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((sum,v,i) => sum+v*[.2126,.7152,.0722][i],0);
        return [...root.querySelectorAll('strong,button')].flatMap(el => {
          let ancestor = el, background = [255,255,255];
          while (ancestor) { const color = rgb(getComputedStyle(ancestor).backgroundColor); if (color.length===3 || color[3]===1) { background=color; break; } ancestor=ancestor.parentElement; }
          const a = luminance(rgb(getComputedStyle(el).color)), b = luminance(background), ratio = (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
          return ratio<4.5 ? [{ text: el.textContent, ratio }] : [];
        });
      });
      assert.deepEqual(lowContrast, [], 'stage titles and actions are readable');
    });
    await sizes(teacher, 'teacher-draft');
    await teacher.getByRole('button', { name: '课堂演示', exact: true }).click();
    await expect(teacher.getByRole('region', { name: '教师课堂演示', exact: true })).toBeVisible();
    await sizes(teacher, 'teacher-presentation');
    await teacher.getByRole('button', { name: '大屏演示', exact: true }).click();
    await sizes(teacher, 'teacher-presentation-expanded');
    await teacher.getByRole('button', { name: '退出大屏', exact: true }).click();
    await teacher.getByRole('button', { name: '关闭演示', exact: true }).click();
    await teacher.getByRole('button', { name: '开始课堂', exact: true }).click();
    await expect(teacher.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
    const current = await teacher.request.get(`${url}/api/teacher/classes/${cls.id}/sessions/current`);
    sessionId = (await current.json()).session.id;
    await sizes(teacher, 'teacher-live');
  });
  await check('teacher-account-panels', () => accountPanels(teacher, 'teacher'));
  await check('teacher-learning-review', async () => { await nav(teacher, '学习记录', '.teacher-learning-review'); await sizes(teacher, 'teacher-learning-review'); });

  const studentCtx = await context(), student = await studentCtx.newPage();
  await login(student, 'student', username, 'Student123!');
  await sizes(student, 'student-home');
  await check('student-classroom', async () => {
    await student.getByRole('button', { name: '接受任务并开始', exact: true }).click();
    await expect(student.locator('[data-qid]').first()).toBeVisible();
    await sizes(student, 'student-classroom-practice');
    await student.reload({ waitUntil: 'domcontentloaded' });
    await expect(student.locator('[data-qid]').first()).toBeVisible();
  });
  for (const [label, selector, name] of [
    ['课程首页', '.student-chain-home', 'student-home-active'],
    ['学习记录', '.records-screen', 'student-records'],
    ['错题本', '.mistakes-layout', 'student-mistakes'],
    ['课后作业', '.student-assignments', 'student-assignments'],
    ['互动演示', '.courseware-demo-grid', 'student-demos'],
    ['课程课件', '.courseware-lecture', 'student-courseware'],
    ['知识库', '.kb-layout', 'student-knowledge'],
    ['硬件配置挑战', '.hardware-game-page', 'student-hardware'],
  ]) await check(name, async () => {
    await nav(student, label, selector); await sizes(student, name);
    if (label === '课程课件') {
      await student.getByRole('button', { name: '全屏', exact: true }).click();
      await expect(student.getByRole('button', { name: '退出全屏', exact: true })).toBeVisible();
      await layout(student, 'student-courseware-fullscreen');
      await student.getByRole('button', { name: '退出全屏', exact: true }).click();
    }
    if (label === '知识库') {
      await student.getByRole('button', { name: '思维画板', exact: true }).click();
      await sizes(student, 'student-mindmap');
      await student.getByRole('button', { name: '填入存储系统示例', exact: true }).click();
      await student.getByRole('checkbox', { name: /生成时，仅将/ }).check();
      await student.getByRole('button', { name: '整理成导图', exact: true }).click();
      await expect(student.getByTestId('mind-canvas')).toBeVisible();
      await sizes(student, 'student-mindmap-populated');
    }
    if (label === '课后作业') {
      await student.locator('.study-page-tools').getByRole('button', { name: '小芯复习建议，点击提问', exact: true }).click();
      await expect(student.getByRole('dialog')).toBeVisible();
      await sizes(student, 'student-ai-help');
      await student.getByRole('button', { name: '关闭小芯助教', exact: true }).click();
    }
  });
  await check('student-account-panels', () => accountPanels(student, 'student'));
  await check('student-lab', async () => {
    assert.ok(sessionId, 'teacher started the classroom');
    await post(teacher.request, `/api/teacher/sessions/${sessionId}/end`);
    await student.reload({ waitUntil: 'domcontentloaded' });
    await nav(student, '课程首页', '.quest-student-home');
    await sizes(student, 'student-home-after-class');
    await student.getByRole('button', { name: '进入关卡：认识计算机五大部件', exact: true }).click();
    await expect(student.locator('.lab-screen,.lab-studio,.mobile-lab-fallback').first()).toBeVisible();
    await sizes(student, 'student-lab');
    await check('student-3d-step-controls', async () => {
      const next = student.locator('.exploded-stepbar').getByRole('button', { name: '下一步 ▶', exact: true });
      await expect(next).toBeVisible();
      assert.ok((await next.boundingBox()).width >= 90, 'step button has a usable touch width');
      assert.equal(await next.evaluate(el => getComputedStyle(el).whiteSpace), 'nowrap');
      await next.click();
      await expect(student.locator('.exploded-step-desc')).toContainText('第二步');
      await sizes(student, 'student-3d-next-step');
      const bar = await student.locator('.exploded-stepbar').boundingBox();
      const diagram = await student.locator('.von-neumann-overview').boundingBox();
      const parts = await student.locator('.exploded-part-list').boundingBox();
      assert.ok(bar && diagram && parts && bar.y + bar.height <= diagram.y && parts.y + parts.height <= bar.y, '3D controls, parts and architecture diagram do not overlap');
    });
  });
  await studentCtx.close();
  await teacherCtx.close();
  // Seeded demo records exercise populated charts and mistakes as well as the empty formal account.
  const demoCtx = await context(), demo = await demoCtx.newPage();
  demo.on('pageerror', error => errors.push(`demo: ${error.message}`));
  await gotoApp(demo, url); await fillLoginForm(demo, { username: '', password: '' });
  await demo.locator('.demo-login-button').click();
  await expect(demo.locator('.quest-student-home')).toBeVisible();
  for (const [label, selector, name] of [
    ['学习记录', '.records-screen', 'student-records-populated'],
    ['错题本', '.mistakes-layout', 'student-mistakes-populated'],
  ]) await check(name, async () => { await nav(demo, label, selector); await sizes(demo, name); });
  await demoCtx.close();
  await check('uncaught-page-errors', () => assert.deepEqual(errors, []));
} catch (error) {
  results.push({ name: 'flow', passed: false, error: error.stack });
  console.error(error.stack);
} finally {
  await browser.close();
  await writeFile(path.join(dir, 'results.json'), JSON.stringify({ widths, thirdPartyLecturesStubbed: true, results, errors }, null, 2));
  const failed = results.filter(result => !result.passed);
  console.log(`Mobile checks: ${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
}
