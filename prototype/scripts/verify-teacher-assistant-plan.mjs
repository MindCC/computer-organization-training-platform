import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { fillLoginForm } from './lib/qaLogin.mjs';
import { openTeacherWorkspace, TEACHER_WORKSPACE } from './lib/qaTeacherWorkspace.mjs';
import { selectTeacherClass } from './helpers/select-teacher-class.mjs';

const baseUrl = process.env.PROTOTYPE_APP_URL;
const apiUrl = process.env.PROTOTYPE_API_URL;
const teacherUsername = process.env.TEACHER_USERNAME;
const teacherPassword = process.env.TEACHER_PASSWORD;
const className = `助教采纳校验班 ${Date.now()}`;
const jar = {};

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (jar.cookie) headers.cookie = jar.cookie;
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers });
  const cookie = response.headers.get('set-cookie');
  if (cookie) jar.cookie = cookie.split(';')[0];
  const body = await response.json();
  assert.ok(response.ok, `${path}: ${JSON.stringify(body)}`);
  return body;
}

await api('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: teacherUsername, password: teacherPassword }) });
const { class: classroom } = await api('/api/classes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: className }) });
await api(`/api/teacher/classes/${classroom.id}/import-students`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csv: `学号,姓名,初始密码\nqa-plan-${Date.now()},证据学生,Student123!` }) });

const browser = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ headless: true }));
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await fillLoginForm(page, { username: teacherUsername, password: teacherPassword });
  await page.locator('[data-login-role="teacher"]').click();
  await page.locator('.login-submit').click();
  await page.locator('.teacher-studio').waitFor({ state: 'visible', timeout: 30_000 });
  assert.equal(await selectTeacherClass(page, className), true);

  await openTeacherWorkspace(page, TEACHER_WORKSPACE.statistics, TEACHER_WORKSPACE.assistant);
  await page.getByRole('button', { name: '生成 AI 助教建议' }).click();
  await expect(page.locator('.teacher-evidence-item')).toHaveCount(1);
  await expect(page.locator('.teacher-evidence-item')).toContainText('班级整体');
  await page.getByRole('button', { name: '采纳并编辑课堂草稿' }).click();

  const focus = page.getByRole('textbox', { name: '本节教学重点' });
  await expect(focus).toBeVisible();
  await focus.fill('教师修订：先区分地址与数据');
  await page.getByRole('textbox', { name: /课堂步骤/ }).fill('观察数据流\n重做关键连线');
  const createResponse = page.waitForResponse((response) => response.url().endsWith(`/api/teacher/classes/${classroom.id}/sessions`) && response.request().method() === 'POST');
  await page.getByRole('button', { name: '创建草稿' }).click();
  assert.equal((await createResponse).status(), 201);
  await expect(page.locator('.live-session-lesson-plan')).toContainText('教师修订：先区分地址与数据');
  const current = await page.request.get(`${apiUrl}/api/teacher/classes/${classroom.id}/sessions/current`);
  assert.equal(current.status(), 200);
  assert.deepEqual(JSON.parse((await current.json()).session.config_json).lessonPlan.steps, ['观察数据流', '重做关键连线']);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.live-session-lesson-plan')).toContainText('教师修订：先区分地址与数据');
  assert.deepEqual(errors, []);
  console.log('PASS: teacher evidence, adoption, editing, draft persistence and reload');
} finally {
  await browser.close();
}
