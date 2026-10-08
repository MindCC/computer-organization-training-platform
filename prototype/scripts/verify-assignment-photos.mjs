import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';
import { clickTopNavItem } from './nav-helpers.mjs';

const url = process.env.PROTOTYPE_APP_URL, apiUrl = process.env.PROTOTYPE_API_URL;
const account = { username: process.env.TEACHER_USERNAME, password: process.env.TEACHER_PASSWORD };
const browser = await chromium.launch({ headless: true });
const errors = [];
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const question = { chapterId: 'ch3', type: 'choice', stem: '半加器的进位输出为？', options: ['A·B', 'A⊕B'], answer: 'A·B', answerSource: 'ai', teacherConfirmed: false, analysis: '当 A 与 B 均为 1 时产生进位，故为与运算。', score: 10, warning: '' };
let cookie;
async function request(route, body) {
  const res = await fetch(apiUrl + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
  const data = await res.json(); assert.ok(res.ok, JSON.stringify(data)); return data;
}
try {
  await request('/api/auth/login', account);
  const cls = (await request('/api/classes', { name: '拍照作业 QA 班' })).class;
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  // School LAN deployments may use HTTP, where crypto.randomUUID is unavailable.
  await context.addInitScript(() => { Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true }); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/teacher/assignment-photos/capabilities', route => route.fulfill({ json: { imageAi: true, maxImages: 3, maxImageMB: 5, maxTotalMB: 10 } }));
  let recognitionCalls = 0;
  await page.route('**/api/teacher/assignment-photos/recognize', route => {
    const input = route.request().postDataJSON();
    assert.equal(input.consent, true); assert.equal(input.images.length, 1);
    recognitionCalls++;
    return recognitionCalls === 1 ? route.fulfill({ status: 503, json: { error: '识别故障注入' } }) : route.fulfill({ json: { title: '书本半加器习题', questions: [question, { ...question, stem: '暂不加入的题目' }] } });
  });
  await gotoApp(page, url); await fillLoginForm(page, account);
  await page.locator('[data-login-role="teacher"]').click(); await submitLoginForm(page);
  await expect(page.locator('.profile-button')).toBeVisible();
  await clickTopNavItem(page, '教师看板');
  await page.locator('.teacher-workspace-nav').getByRole('button', { name: '作业管理', exact: true }).click();
  await page.getByRole('combobox', { name: '当前班级' }).selectOption(String(cls.id));
  await page.getByRole('button', { name: '拍照上传作业', exact: true }).click();
  const importer = page.getByRole('region', { name: '拍照上传作业', exact: true });
  await importer.getByLabel('选择作业图片', { exact: true }).setInputFiles({ name: 'book.png', mimeType: 'image/png', buffer: image });
  await expect(importer.locator('.assignment-photo-previews img')).toHaveCount(1);
  await expect(importer.getByRole('button', { name: '开始识别作业' })).toBeDisabled();
  await importer.getByLabel(/我确认将以上图片/).check();
  await importer.getByRole('button', { name: '开始识别作业' }).click();
  await expect(importer.getByRole('alert')).toContainText('图片已保留');
  await importer.getByRole('button', { name: '开始识别作业' }).click();
  const questions = importer.locator('.assignment-photo-question');
  await expect(questions).toHaveCount(2);
  await expect(questions.first()).toContainText('AI 生成答案 · 未人工确认');
  await expect(questions.first().getByLabel('我已人工确认此题答案（可选）')).not.toBeChecked();
  await questions.nth(1).getByLabel('加入此题', { exact: true }).uncheck();
  await expect(importer).toContainText('已选 1 题');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '拍照作业手机页面不得横向溢出');
  await page.screenshot({ path: path.join(process.env.QA_ARTIFACT_DIR, 'assignment-photo-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 900 });
  // Fail a save before it reaches the server; edited candidates and selection must survive.
  await page.route('**/api/teacher/assignment-photos/save', route => route.fulfill({ status: 503, json: { error: '保存故障注入' } }));
  await importer.getByRole('button', { name: '同时加入题库和作业库' }).click();
  await expect(importer.getByRole('alert')).toContainText('已保留核对内容和勾选');
  await expect(questions.first().getByLabel('加入此题', { exact: true })).toBeChecked();
  await expect(questions.nth(1).getByLabel('加入此题', { exact: true })).not.toBeChecked();
  await page.unroute('**/api/teacher/assignment-photos/save');
  await importer.getByRole('button', { name: '同时加入题库和作业库' }).click();
  await expect(importer.getByRole('status')).toContainText('已加入题库 1 题；已加入作业库草稿 1 题');
  await expect(importer.getByRole('button', { name: '同时加入题库和作业库' })).toBeDisabled();
  const bank = (await request('/api/teacher/question-bank')).questions;
  assert.equal(bank.length, 1); assert.match(bank[0].analysis, /AI 生成.*未人工确认/);
  const assignments = (await request(`/api/teacher/classes/${cls.id}/assignments`)).assignments;
  assert.equal(assignments.length, 1); assert.equal(assignments[0].status, 'draft'); assert.equal(assignments[0].question_count, 1);
  await page.screenshot({ path: path.join(process.env.QA_ARTIFACT_DIR, 'assignment-photo-saved.png'), fullPage: true });
  // Existing draft offers the same photo flow and retains a separate publish action.
  await page.locator('.assignment-row').filter({ hasText: '书本半加器习题' }).click();
  await page.getByRole('tab', { name: '拍照识别', exact: true }).click();
  await expect(page.getByRole('region', { name: '拍照上传作业', exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: '发布作业', exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS photo homework: upload, recognition retry, AI answer with optional confirmation, selection, atomic save, source labels, draft entry, desktop/mobile. Recognition uses a fixture; saves use the isolated database.');
} finally { await browser.close(); }
