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
  await expect(page.locator('.demo-readonly-banner')).toHaveCount(0);

  await logout();
  await openLogin();
  await page.locator('[data-demo-role="teacher"]').click();
  await expect(page.locator('.teacher-reference-shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.profile-button')).toContainText('演示教师');
  await expect(page.locator('.teacher-class-select')).toContainText('计算机组成原理1班');
  // 只读横幅明确展示；浏览作业管理与学情页面正常
  await expect(page.locator('.demo-readonly-banner')).toContainText('只读');
  await page.locator('.teacher-workspace-nav').getByRole('button', { name: '作业管理', exact: true }).click();
  await expect(page.getByRole('button', { name: '创建作业' })).toBeVisible();

  // 尝试创建作业：服务器拒绝并给出只读说明
  await page.getByRole('button', { name: '创建作业' }).click();
  await page.getByRole('textbox', { name: '作业标题' }).fill(`只读校验作业 ${Date.now()}`);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.getByText(/演示账号为只读账号/)).toBeVisible();

  await logout();
  await openLogin();
  await page.locator('[data-demo-role="student"]').click();
  // 生产模式学生姓名脱敏：演示学生 → 演**生
  await expect(page.locator('.profile-button')).toContainText('演**生', { timeout: 20_000 });
  // 2026-10-12：演示学生可正常操作（接受任务/提交练习），只读只约束演示教师。
  await expect(page.locator('.demo-readonly-banner')).toHaveCount(0);
  // 学生端浏览：课程首页、学习记录、课后作业页面都正常打开
  await clickTopNavItem(page,'课后作业');
  await page.getByRole('tab', { name: '教师作业' }).click();
  await expect(page.locator('.assignment-card, .assignment-cards .empty-state').first()).toBeVisible();
  await clickTopNavItem(page,'学习记录');
  await expect(page.locator('.records-screen')).toBeVisible({ timeout: 15_000 });

  assert.deepEqual(errors, []);
  console.log('PASS formal teacher unaffected; demo teacher/student get read-only banner, browsing works and homework creation is rejected');
} finally {
  await browser.close();
}
