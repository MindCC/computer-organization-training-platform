import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { gotoApp } from './lib/qaLogin.mjs';
import { clickTopNavItem } from './nav-helpers.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

async function openLogin() {
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.login-portal')).toBeVisible();
}

async function logout() {
  await page.locator('.profile-button').click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
}

try {
  await gotoApp(page, process.env.PROTOTYPE_APP_URL ?? 'http://127.0.0.1:5173');
  await openLogin();
  await page.getByRole('tab', { name: '教师入口' }).click();
  await page.locator('#login-username').fill(process.env.TEACHER_USERNAME ?? 'teacher');
  await page.locator('#login-password').fill(process.env.TEACHER_PASSWORD ?? 'ChangeMe123!');
  await page.locator('.login-submit').click();
  await expect(page.locator('.teacher-reference-shell')).toBeVisible({ timeout: 20_000 });
  await logout();
  await openLogin();
  await page.locator('[data-demo-role="teacher"]').click();
  await expect(page.locator('.teacher-reference-shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.profile-button')).toContainText('演示教师');
  await expect(page.locator('.teacher-class-select')).toContainText('芯游记 · 演示教学班');

  await page.locator('.teacher-section-disclosure').filter({ hasText: '课后作业管理' }).locator('summary').click();
  await page.getByRole('button', { name: '创建作业' }).click();
  const title = `演示联动作业 ${Date.now()}`;
  await page.getByRole('textbox', { name: '作业标题' }).fill(title);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  const row = page.locator('.assignment-row').filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.click();
  await page.getByRole('textbox', { name: '题目内容' }).fill('CPU 的主要作用是什么？');
  await page.getByRole('combobox', { name: '题目类型' }).selectOption('short_answer');
  await page.getByRole('textbox', { name: '正确答案' }).fill('执行指令');
  await page.getByRole('button', { name: '添加题目' }).click();
  await expect(row).toContainText('1 题');
  await page.getByRole('button', { name: '发布作业' }).click();
  await expect(row).toContainText('已发布');

  await logout();
  await openLogin();
  await page.locator('[data-demo-role="student"]').click();
  await expect(page.locator('.profile-button')).toContainText('演示学生1', { timeout: 20_000 });
  await clickTopNavItem(page,'课后作业');
  await page.getByRole('tab', { name: '教师作业' }).click();
  await page.locator('.assignment-card').filter({ hasText: title }).click();
  await expect(page.locator('.assignment-view-header')).toContainText(title);
  await page.getByPlaceholder('输入你的答案').fill('执行机器指令并处理数据');
  await page.getByRole('button', { name: '提交作业' }).click();
  await expect(page.locator('.assignment-card').filter({ hasText: title })).toContainText('待批改');

  await logout();
  await openLogin();
  await page.locator('[data-demo-role="teacher"]').click();
  await expect(page.locator('.teacher-reference-shell')).toBeVisible({ timeout: 20_000 });
  await page.locator('.teacher-section-disclosure').filter({ hasText: '课后作业管理' }).locator('summary').click();
  await page.locator('.assignment-row').filter({ hasText: title }).click();
  const submission = page.locator('.submission-row').filter({ hasText: '演示学生1' });
  await expect(submission).toContainText('待批改');
  await submission.getByRole('spinbutton').fill('8');
  const feedback = '理解了指令执行，还可以补充控制与运算的关系。';
  await submission.getByRole('textbox', { name: '演示学生1 评语' }).fill(feedback);
  await submission.getByRole('button', { name: '提交评分' }).click();
  await expect(submission).toContainText('8 / 10');

  await logout();
  await openLogin();
  await page.locator('[data-demo-role="student"]').click();
  await expect(page.locator('.profile-button')).toContainText('演示学生1', { timeout: 20_000 });
  await clickTopNavItem(page,'课后作业');
  await page.getByRole('tab', { name: '教师作业' }).click();
  const gradedCard = page.locator('.assignment-card').filter({ hasText: title });
  await expect(gradedCard).toContainText('8/10');
  await gradedCard.click();
  await expect(page.locator('.study-teacher-feedback')).toContainText(feedback);
  await expect(page.locator('.study-question-grade')).toContainText('8 / 10');
  assert.deepEqual(errors, []);
  console.log('PASS teacher account and demo teacher login, assignment publish, student submission, teacher grading, student score and feedback');
} finally {
  await browser.close();
}
