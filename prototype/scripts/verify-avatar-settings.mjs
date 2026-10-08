import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { openDatabase, createUser, getUserById } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { PNG_AVATAR } from './lib/avatarFixtures.mjs';
import { fillLoginForm, gotoApp, submitLoginForm } from './lib/qaLogin.mjs';

// One browser/page, in-memory accounts only. Optional first argument = isolated build directory.
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.resolve(root, process.argv[2] ?? 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'));
const visited = new Set(), files = new Set();
function collect(key) { if (visited.has(key)) return; visited.add(key); const c = manifest[key]; if (c.file.endsWith('.js')) files.add(c.file); for (const dep of c.imports ?? []) collect(dep); }
collect(Object.keys(manifest).find(key => manifest[key].isEntry));
const initialBytes = [...files].reduce((total, file) => total + fs.statSync(path.join(dist, file)).size, 0);
assert(initialBytes <= 500 * 1024, `Initial JS exceeds budget: ${initialBytes}`);
const db = openDatabase(':memory:');
const app = createApp({ db, distDir: dist, demoLoginEnabled: false });
const password = 'Avatar-QA-Password-123';
const student = createUser(db, { username: 'avatar-qa-student', displayName: '头像回归学生', role: 'student', passwordHash: await hashPassword(password), profile: { mode: '适中提示模式', mustChangePassword: false } });
const teacher = createUser(db, { username: 'avatar-qa-teacher', displayName: '头像回归教师', role: 'teacher', passwordHash: await hashPassword(password) });
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await gotoApp(page, base);
  await fillLoginForm(page, { username: student.username, password });
  await submitLoginForm(page);
  const top = page.locator('.profile-button img'); await top.waitFor();
  const defaultSrc = await top.getAttribute('src');
  const persisted = user => JSON.parse(getUserById(db, user.id).profile_json).avatar ?? null;
  const dialog = page.getByRole('dialog');
  const open = async () => {
    await page.locator('.profile-button').click();
    await page.getByRole('button', { name: '个人设置', exact: true }).click();
    await dialog.getByRole('button', { name: '更换头像', exact: true }).click();
  };
  const save = async () => {
    await dialog.getByRole('button', { name: '保存设置', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: '个人设置已保存' }).waitFor();
  };
  await open();
  assert.equal(await dialog.locator('.account-avatar-preset').count(), 8);
  assert.equal(await dialog.getByRole('button', { name: '保存设置', exact: true }).count(), 1);
  await page.evaluate(() => {
    const Original = window.Image;
    window.__pendingAvatarLoads = [];
    window.Image = function (...args) {
      const image = new Original(...args); let load;
      Object.defineProperty(image, 'onload', { get: () => load, set: fn => { load = fn; } });
      image.addEventListener('load', () => window.__pendingAvatarLoads.push(() => load?.call(image, new Event('load'))));
      return image;
    };
  });
  const file = { name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(PNG_AVATAR.split(',')[1], 'base64') };
  const upload = async count => {
    await dialog.getByLabel('上传头像图片').setInputFiles(file);
    await page.waitForFunction(n => window.__pendingAvatarLoads.length === n, count);
  };
  const flush = () => page.evaluate(async () => { window.__pendingAvatarLoads.shift()?.(); await new Promise(requestAnimationFrame); });

  await upload(1);
  assert(await dialog.getByRole('button', { name: '保存设置', exact: true }).isDisabled(), 'Save must wait for image processing');
  await dialog.locator('form').evaluate(el => el.requestSubmit());
  assert.equal(persisted(student), null);
  assert.match(await dialog.getByRole('alert').innerText(), /头像正在处理/);
  await flush();
  await page.waitForFunction(() => document.querySelector('.account-avatar-preview').src.startsWith('data:image/webp;base64,'));
  await save();
  const custom = persisted(student); assert.match(custom, /^data:image\/webp;base64,/);
  assert.equal(await top.getAttribute('src'), custom);
  assert.deepEqual(await top.evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight })), { width: 128, height: 128 });
  console.log('PASS upload blocks early save; completed image saves as a real 128x128 avatar');

  await dialog.getByRole('button', { name: '更换头像', exact: true }).click();
  await upload(1);
  await dialog.getByRole('button', { name: '小芯·蓝', exact: true }).click();
  await flush();
  assert.equal(await dialog.locator('.account-avatar-preview').getAttribute('src'), '/avatars/chip-blue.svg');
  assert(await dialog.getByRole('button', { name: '保存设置', exact: true }).isEnabled());
  await save(); assert.equal(persisted(student), 'preset:chip-blue');
  console.log('PASS later preset wins over pending upload');

  await dialog.getByRole('button', { name: '更换头像', exact: true }).click();
  await upload(1);
  await dialog.getByRole('button', { name: '恢复默认', exact: true }).click();
  await flush();
  assert.equal(await dialog.locator('.account-avatar-preview').getAttribute('src'), defaultSrc);
  await save(); assert.equal(persisted(student), null);
  console.log('PASS restore default cancels pending upload');

  await dialog.getByRole('button', { name: '更换头像', exact: true }).click();
  await upload(1); await upload(2); await flush();
  assert(await dialog.getByRole('button', { name: '保存设置', exact: true }).isDisabled());
  await flush();
  await page.waitForFunction(() => !document.querySelector('.account-save-button').disabled);
  await save(); assert.match(persisted(student), /^data:image\/webp;base64,/);
  console.log('PASS only newest upload completes the active selection');

  await dialog.getByRole('button', { name: '更换头像', exact: true }).click();
  await upload(1);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await open(); await flush();
  assert.equal(await dialog.locator('.account-avatar-preview').getAttribute('src'), persisted(student));
  assert(await dialog.getByRole('button', { name: '保存设置', exact: true }).isEnabled());
  console.log('PASS closing settings invalidates unfinished upload');

  let release, arrived;
  const ready = new Promise(resolve => { arrived = resolve; });
  await page.route('**/api/auth/settings', async route => {
    await new Promise(resolve => { release = resolve; arrived(); });
    await route.continue();
  });
  await dialog.getByRole('button', { name: '小芯·蓝', exact: true }).click();
  await dialog.getByRole('button', { name: '保存设置', exact: true }).click();
  await ready;
  assert(await dialog.getByRole('button', { name: '小芯·青', exact: true }).isDisabled());
  assert(await dialog.getByLabel('上传头像图片').isDisabled());
  release();
  await dialog.getByRole('status').filter({ hasText: '个人设置已保存' }).waitFor();
  await page.unroute('**/api/auth/settings');
  await page.reload(); await top.waitFor(); assert.equal(await top.getAttribute('src'), '/avatars/chip-blue.svg');
  console.log('PASS saving locks avatar controls; refresh keeps saved preset');

  // The same settings form is available to teachers, including narrow-screen layout.
  await page.context().clearCookies(); await gotoApp(page, base);
  await fillLoginForm(page, { username: teacher.username, password });
  await page.locator('[data-login-role="teacher"]').click(); await submitLoginForm(page);
  await top.waitFor(); await open();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await dialog.getByRole('button', { name: '小芯·紫', exact: true }).click();
  await save(); assert.equal(persisted(teacher), 'preset:chip-violet');
  assert.deepEqual(errors, []);
  console.log(`PASS teacher/mobile settings and browser errors; initial JS ${initialBytes}/512000 bytes`);
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); }
