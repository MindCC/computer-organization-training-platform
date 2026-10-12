import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const url = process.env.PROTOTYPE_APP_URL ?? 'http://127.0.0.1:5173';
const dir = path.resolve('qa-artifacts', 'mobile-preview');
await mkdir(dir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ headless: true }));
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
const page = await ctx.newPage();

async function settle() {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
}
async function snap(name, fullPage) {
  await settle();
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log('SHOT', file);
}

// 1. 落地/登录入口页
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForFunction(() => Boolean(document.querySelector('#root')?.children.length), null, { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(800);
await snap('landing', false);          // 视口首屏
await snap('landing-full', true);      // 整页

// 2. 打开登录表单
for (const name of ['登录', '开始第一个实验']) {
  const entry = page.getByRole('button', { name }).first();
  if (await entry.isVisible().catch(() => false)) { await entry.click(); break; }
}
await page.waitForSelector('#login-username', { timeout: 15_000 }).catch(() => {});
await snap('login-form', false);

// 3. 用只读演示教师登录，进入教师工作台（先切到教师入口）
await page.locator('[data-login-role="teacher"]').click();
await page.locator('#login-username').fill('demo-teacher');
await page.locator('#login-password').fill('Demo123!');
await page.locator('button.login-submit').click();
await page.waitForSelector('.teacher-studio', { timeout: 30_000 }).catch(async () => {
  console.error('TEACHER LOGIN FAILED; body:', (await page.locator('body').innerText()).slice(-600));
});
await page.waitForTimeout(1500);
await snap('teacher-studio', false);   // 视口首屏
await snap('teacher-studio-full', true);

await browser.close();
console.log('DONE');
