import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fillLoginForm, submitLoginForm, gotoApp } from './lib/qaLogin.mjs';
import { openChallengeFromHome } from './lib/qaHome.mjs';

// 由 scripts/run-browser-qa.mjs 注入实际地址（随机端口），手工运行时回落到默认开发端口。
const baseUrl = process.env.PROTOTYPE_URL ?? process.env.PROTOTYPE_APP_URL ?? 'http://127.0.0.1:5173/';
// 依赖 seed:demo 生成的演示学生（demo2026001 / Student123!）。
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await gotoApp(page, baseUrl);
  // Observe the renderer used by the real page, without adding production test hooks.
  await page.evaluate(async () => {
    const source = await (await fetch('/src/components/nativeComputerScene.js')).text();
    const url = source.match(/import\s*\{\s*PerspectiveCamera\s*\}\s*from\s*["']([^"']+)["']/)[1];
    const { PerspectiveCamera } = await import(url);
    const lookAt = PerspectiveCamera.prototype.lookAt;
    PerspectiveCamera.prototype.lookAt = function(...args) {
      window.qaCamera = this;
      return lookAt.apply(this, args);
    };
    const sceneUrl = source.match(/import\s*\{\s*Scene\s*\}\s*from\s*["']([^"']+)["']/)[1];
    const { Scene } = await import(sceneUrl);
    const add = Scene.prototype.add;
    Scene.prototype.add = function(...args) {
      window.qaScene = this;
      return add.apply(this, args);
    };
  });
  await fillLoginForm(page, { username: 'demo2026001', password: 'Student123!' });
  await submitLoginForm(page);
  await page.locator('.sidebar-nav').waitFor();
  await openChallengeFromHome(page, '认识计算机五大部件');
  const canvas = page.locator('canvas[data-model-source="blender-glb"]');
  // 冷启动时 vite 首次编译 + GLB 加载明显更慢，这里给足余量避免抖动。
  await canvas.waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: '自由探索', exact: true }).click();
  await page.waitForFunction(() => window.qaScene && window.qaCamera, { timeout: 60000 });
  // Pick a visible CPU triangle, rather than assuming model coordinates or screen position.
  const start = await page.evaluate(async () => {
    const { Raycaster } = await import('/node_modules/three/src/core/Raycaster.js');
    const { Vector2 } = await import('/node_modules/three/src/math/Vector2.js');
    const scene = window.qaScene, camera = window.qaCamera;
    const group = scene.children.find(n => n.userData.partId === 'cpu');
    const rect = document.querySelector('canvas[data-model-source="blender-glb"]').getBoundingClientRect();
    const ray = new Raycaster();
    const p = group.position.clone().project(camera);
    for (let dx = -30; dx <= 30; dx += 3) for (let dy = -30; dy <= 30; dy += 3) {
      const x = (p.x + 1) * rect.width / 2 + dx, y = (1 - p.y) * rect.height / 2 + dy;
      ray.setFromCamera(new Vector2(x / rect.width * 2 - 1, 1 - y / rect.height * 2), camera);
      const hit = ray.intersectObjects(scene.children.filter(n => n.visible && n.userData.partId), true)[0];
      if (hit?.object.userData.partId === 'cpu') return { x: rect.left + x, y: rect.top + y, position: group.position.toArray() };
    }
    throw new Error('No visible CPU pick point');
  });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 100, start.y - 60, { steps: 15 });
  await page.mouse.up();
  await page.waitForFunction(position => window.qaScene.children.find(n => n.userData.partId === 'cpu').position.toArray().some((x,i)=>Math.abs(x-position[i]) > .05), start.position);
  await page.locator('.exploded-info-card').waitFor();
  await page.getByRole('button', { name: '选中部件归位', exact: true }).click();
  await page.waitForFunction(position => window.qaScene.children.find(n => n.userData.partId === 'cpu').position.toArray().every((x,i)=>Math.abs(x-position[i]) < .03), start.position);
  await mkdir('qa-artifacts', { recursive: true });
  await page.screenshot({ path: 'qa-artifacts/overview-exploration.png' });
  await page.getByRole('button', { name: '分步组装', exact: true }).click();
  for (let i = 1; i < 8; i++) await page.getByRole('button', { name: '下一步', exact: false }).click();
  assert.equal(await page.getByRole('button', { name: /完成探索/ }).count(), 1);
  assert.deepEqual(errors, []);
  console.log('PASS: Blender model, CPU drag, details, return, eight teaching steps');
} finally { await browser.close(); }
