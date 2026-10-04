import { chromium, expect } from '@playwright/test';
import { fillLoginForm, gotoApp, submitLoginForm } from './lib/qaLogin.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
try {
  await gotoApp(page, process.env.PROTOTYPE_URL);
  await fillLoginForm(page, { username: 'demo2026001', password: 'Student123!' });
  await submitLoginForm(page);
  await expect(page.locator('.profile-button')).toBeVisible();
  await page.locator('.profile-button').click();
  await page.getByRole('button', { name: '个人设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('本周目标')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '修改密码' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '保存设置' })).toHaveCount(1);

  await dialog.getByRole('textbox', { name: '姓名' }).fill('设置测试学生');
  await dialog.getByRole('button', { name: '保存设置' }).click();
  await expect(dialog.getByRole('status')).toContainText('个人设置已保存');
  await expect(page.locator('.profile-button')).toContainText('设置测试学生');

  await dialog.getByLabel('当前密码').fill('错误密码');
  await dialog.getByLabel('新密码', { exact: true }).fill('NewPassword123!');
  await dialog.getByLabel('确认新密码').fill('NewPassword123!');
  await dialog.getByRole('button', { name: '保存设置' }).click();
  await expect(dialog.getByRole('alert')).toContainText('当前密码不正确');

  await dialog.getByLabel('当前密码').fill('Student123!');
  await dialog.getByRole('button', { name: '保存设置' }).click();
  await expect(dialog.getByRole('status')).toContainText('资料与密码已一起保存');
  console.log('个人设置：单一保存按钮、无学习目标、资料与密码保存及错误提示均通过');
} finally {
  await browser.close();
}
