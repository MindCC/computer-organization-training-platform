import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';
import { clickTopNavItem } from './nav-helpers.mjs';

const app = process.env.PROTOTYPE_APP_URL ?? 'http://127.0.0.1:8787';
mkdirSync('qa-artifacts', { recursive: true });
let browser; try { browser = await chromium.launch({ channel: 'msedge', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }), errors = [];
page.on('pageerror', error => errors.push(error.message));
const nav = (target, name) => ({ click: () => clickTopNavItem(target, name) });
const coach = page.getByTestId('learning-coach');
async function post(context, path, body) { const response = await context.post(app + path, { data: body }); assert.ok(response.ok(), `${path}: ${response.status()} ${await response.text()}`); return response.json(); }
try {
  const teacher = await browser.newPage({ viewport: { width: 1366, height: 900 } }); teacher.on('pageerror', error => errors.push(error.message));
  await gotoApp(teacher, app); await fillLoginForm(teacher, { username: 'teacher', password: 'ChangeMe123!' }); await teacher.locator('[data-login-role="teacher"]').click(); await submitLoginForm(teacher);
  await clickTopNavItem(teacher, '学习记录');
  const classroom = (await post(teacher.request, '/api/classes', { name: '智能体验收班' })).class;
  const username = 'coachqa-' + Date.now();
  await post(teacher.request, `/api/teacher/classes/${classroom.id}/import-students`, { csv: `${username},诊断验收学生,Student123!` });
  await teacher.reload({ waitUntil: 'domcontentloaded' }); await nav(teacher, '学习记录').click();
  await teacher.getByLabel('学情班级', { exact: true }).selectOption(String(classroom.id));
  const review = teacher.getByTestId('teacher-coach-review'); await expect(review).toBeVisible();
  await review.locator('details').filter({ has: teacher.locator('summary').filter({ hasText: '审核课程依据与发布知识库段落' }) }).locator('summary').first().click();
  await review.getByRole('button', { name: '确认审核并发布', exact: true }).first().click();
  await expect(review).toContainText('课程依据已审核发布到本班');
  // Reuse the existing knowledge import, then publish a teacher-confirmed chunk.
  const upload = await teacher.request.post(app + '/api/teacher/knowledge/upload', { headers: { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent('全加器课堂依据.txt') }, data: Buffer.from('全加器处理三个输入位。先分别分析和位与输出进位，再用多组输入验证电路。') });
  assert.equal(upload.status(), 201, await upload.text());
  const document = (await upload.json()).document;
  await review.getByRole('button', { name: '读取我的知识库文档' }).click(); await review.getByLabel('发布依据的知识库文档').selectOption(String(document.id));
  await expect(review.getByLabel('发布课程段落')).toBeVisible(); await review.getByRole('checkbox', { name: /我已核对该段/ }).check();
  await review.getByRole('button', { name: '发布此段为课程依据' }).click(); await expect(review).toContainText('全加器课堂依据');
  await review.getByRole('button', { name: '选择全班', exact: true }).click(); await review.getByRole('button', { name: '确认发布补练（1人）', exact: true }).click();
  await expect(review).toContainText('已发布 1 个补练任务');
  await gotoApp(page, app); await fillLoginForm(page, { username, password: 'Student123!' }); await submitLoginForm(page);
  const next = page.getByTestId('coach-next-step'); await expect(next).toContainText('教师安排的补练'); await next.getByRole('button', { name: '前往全加器诊断与补练' }).click();
  await expect(coach).toBeVisible(); await expect(coach.getByLabel('选择教师补练')).not.toHaveValue('');
  // A read-only locked experiment may still be diagnosed without bypassing course grades.
  await coach.getByRole('button', { name: '帮我诊断当前电路', exact: true }).click(); await expect(coach.locator('.coach-session-meta')).toContainText('待修正');
  await expect(coach.getByRole('button', { name: '开始变式复测', exact: true })).toBeDisabled();
  await coach.getByRole('button', { name: '给我概念提醒' }).click(); await coach.getByRole('button', { name: '进一步定位问题' }).click();
  await expect(coach.locator('.coach-hints')).toContainText('2 / 4');
  await review.getByRole('button', { name: '刷新补练记录' }).click();
  await review.getByRole('button', { name: '待修正 · 1 人', exact: true }).click();
  await expect(review.getByRole('checkbox', { name: '选择补练学生 诊断验收学生', exact: true })).toBeChecked();
  await page.getByRole('button', { name: '填入参考结构', exact: true }).click(); await expect(coach.locator('.coach-changed')).toBeVisible();
  await coach.getByRole('button', { name: '验证当前修改' }).click(); await expect(coach.locator('.coach-session-meta')).toContainText('电路检测通过 · 待复测');
  await review.getByRole('button', { name: '刷新补练记录' }).click();
  await expect(review.getByRole('button', { name: '待复测 · 1 人', exact: true })).toBeEnabled();
  await coach.getByRole('button', { name: '开始变式复测', exact: true }).click(); await expect(coach.locator('.coach-retest fieldset')).toHaveCount(4);
  let run = (await (await page.request.get(app + '/api/student/learning-coach')).json()).latest;
  for (const [index, q] of run.retest.questions.entries()) { const total = q.a + q.b + q.cin; await coach.getByLabel(`第${index + 1}题结果`).selectOption(String(total & ((1 << q.width) - 1))); await coach.getByLabel(`第${index + 1}题进位`).selectOption(String(total >> q.width)); }
  // Mobile supports reviewing and submitting a retest started at the desktop workbench.
  await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: 'qa-artifacts/learning-coach-mobile.png', fullPage: true });
  await coach.getByRole('button', { name: '提交复测并判分' }).click(); await expect(coach.locator('.coach-retest')).toContainText('4 / 4 题通过');
  await page.setViewportSize({ width: 1366, height: 900 }); await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(coach.locator('.coach-session-meta')).toContainText('本次复测通过'); await expect(coach.locator('.coach-hints')).toContainText('2 / 4');
  await coach.getByText('查看本次作答与解析', { exact: true }).click();
  await expect(coach.getByLabel('第1题结果')).toHaveValue(String((run.retest.questions[0].a + run.retest.questions[0].b + run.retest.questions[0].cin) & ((1 << run.retest.questions[0].width) - 1)));
  await coach.getByText('讲解依据与材料出处', { exact: true }).click(); await expect(coach).toContainText('教师已审核发布');
  await coach.screenshot({ path: 'qa-artifacts/learning-coach-desktop.png' });
  const progress = await (await page.request.get(app + '/api/student/progress')).json(); assert.notEqual(progress.progress['full-adder'].status, 'completed');
  await review.getByRole('button', { name: '刷新补练记录' }).click(); await expect(review.locator('.teacher-coach-metrics')).toContainText('1 / 1');
  await expect(review.getByRole('button', { name: '待修正 · 0 人', exact: true })).toBeDisabled();
  await expect(review.getByRole('button', { name: '待复测 · 0 人', exact: true })).toBeDisabled();
  const summary = await (await teacher.request.get(app + `/api/teacher/classes/${classroom.id}/learning-coach`)).json(); assert.equal(summary.pendingTasks, 0); assert.equal(summary.passedStudents, 1); assert.equal(summary.students[0].withoutRetestHints, 1);
  await review.getByText('回看学生过程证据', { exact: true }).click(); await review.getByRole('button', { name: '诊断验收学生 · 过程证据', exact: true }).click(); await expect(review).toContainText('首次检测：未通过');
  const downloadPromise = teacher.waitForEvent('download'); await review.getByRole('link', { name: '导出试用记录 CSV' }).click(); const download = await downloadPromise; await download.saveAs('qa-artifacts/learning-coach-pilot.csv'); assert.ok(readFileSync('qa-artifacts/learning-coach-pilot.csv', 'utf8').includes(username));
  await review.screenshot({ path: 'qa-artifacts/learning-coach-teacher.png' });
  // Failure states preserve the saved session; retry reads the authoritative record.
  await page.route('**/api/student/learning-coach/runs/*/verify', route => route.fulfill({ status: 503, json: { error: '测试网络暂时不可用' } }));
  await coach.getByRole('button', { name: '开始新的诊断' }).click(); await expect(coach.locator('.coach-session-meta')).toContainText('待修正');
  await coach.getByRole('button', { name: '验证当前修改' }).click(); await expect(coach.locator('.coach-error')).toContainText('测试网络暂时不可用');
  await coach.getByRole('button', { name: '重新读取记录' }).click(); await expect(coach.locator('.coach-error')).toHaveCount(0);
  await page.unroute('**/api/student/learning-coach/runs/*/verify');
  await nav(page, '课程首页').click(); await expect(next).toContainText('继续上次诊断');
  assert.deepEqual(errors, []);
  console.log('PASS: student evidence diagnosis → tiered hints → real circuit correction → server transfer grading → reload; teacher knowledge-source confirmation → targeted task → outcome export; mobile, failure retry and unchanged course grades. External AI not called.');
} catch (error) { await page.screenshot({ path: 'qa-artifacts/learning-coach-failure.png', fullPage: true }); throw error; }
finally { await browser.close(); }
